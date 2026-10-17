import { getDtp } from "../libs/downtime-resources.js";
import { canUserControlActor, isGroupActor } from "../group-sheet/actors.js";
import { getGroupData } from "../group-sheet/activities.js";
import { getPrimaryActiveGm, isPrimaryActiveGm } from "../group-sheet/users.js";
import { getDowntimeGoldCost, getDowntimeOption, getDowntimeProfile, isDowntimeEligible } from "./activities.js";

const MODULE_ID = "mk-shadowdark";
const DTP_PATH = `flags.${MODULE_ID}.dtp`;
const PAYMENT_FLAG = "dtpPartyPayment";
const pendingPayments = new Map();
const handledRequests = new Set();
let sharedPaymentQueue = Promise.resolve();

function canSpendDtp(actor, user = globalThis.game?.user) {
  return globalThis.game?.system?.id === "shadowdark" && actor?.type === "Player" && !isGroupActor(actor)
    && canUserControlActor(actor, user);
}

function getGold(actor) {
  const gp = Number(actor?.system?.coins?.gp ?? 0);
  return Number.isSafeInteger(gp) && gp >= 0 ? gp : null;
}

function getSkillTeachers(actor, user = globalThis.game?.user) {
  if (!canSpendDtp(actor, user) || !actor.uuid) return [];
  return Array.from(globalThis.game?.actors ?? []).filter(teacher => teacher.type === "Player"
    && teacher.uuid !== actor.uuid && teacher.id !== actor.id && !isGroupActor(teacher)
    && (user?.isGM || teacher.testUserPermission?.(user, "OBSERVER")
      || (user?.id === globalThis.game?.user?.id && teacher.isOwner)))
    .sort((left, right) => left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid));
}

function getPartyGroups(actor, user = globalThis.game?.user) {
  if (!canSpendDtp(actor, user) || !actor.uuid) return [];
  return Array.from(globalThis.game?.actors ?? []).filter(group => {
    if (!isGroupActor(group) || group === actor) return false;
    const accessible = user?.isGM || group.testUserPermission?.(user, "OBSERVER")
      || (user?.id === globalThis.game?.user?.id && group.isOwner);
    return accessible && getGroupData(group).members.includes(actor.uuid);
  }).sort((left, right) => left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid));
}

function getPersonalSpendUpdate(actor, entry) {
  const gold = getDowntimeGoldCost(actor, entry);
  if (!entry || getDtp(actor) < 1 || gold === null) return null;
  const gp = getGold(actor);
  if (gold > 0 && (gp === null || gp < gold)) return null;
  return { [DTP_PATH]: getDtp(actor) - 1, ...(gold > 0 ? { "system.coins.gp": gp - gold } : {}) };
}

function getDowntimePayment(actor, entry, { groupUuid = "", teacherUuid = "", user = globalThis.game?.user } = {}) {
  if (!canSpendDtp(actor, user) || getDowntimeOption(entry?.id) !== entry) return null;
  if (teacherUuid) {
    if (entry.id !== "skills-int-learn" || getDtp(actor) < 1 || !getPrimaryActiveGm()) return null;
    const teacher = getSkillTeachers(actor, user).find(teacher => teacher.uuid === teacherUuid);
    if (!teacher || getDtp(teacher) < 1) return null;
    return { gold: 0, group: null, teacher, update: { [DTP_PATH]: getDtp(actor) - 1 } };
  }
  const personalUpdate = getPersonalSpendUpdate(actor, entry);
  const gold = getDowntimeGoldCost(actor, entry);
  if (personalUpdate) return { gold, update: personalUpdate, group: null };
  if (getDtp(actor) < 1 || gold === null || !getPrimaryActiveGm()) return null;
  const groups = getPartyGroups(actor, user);
  const group = groupUuid ? groups.find(group => group.uuid === groupUuid) : groups.length === 1 ? groups[0] : null;
  const gp = getGold(group);
  if (!group || gp === null || gp < gold) return null;
  return { gold, group, update: { [DTP_PATH]: getDtp(actor) - 1 } };
}

async function payPersonal(actor, entry, payment) {
  const saved = await actor.update(payment.update, { mkShadowdarkDtp: { activityId: entry.id } });
  return saved ? { gold: payment.gold, groupUuid: null, groupName: null } : null;
}

function queueSharedPayment(callback) {
  const next = sharedPaymentQueue.catch(() => {}).then(callback);
  sharedPaymentQueue = next;
  return next;
}

async function applySharedPayment(actor, entry, options, user, expiresAt = Infinity) {
  const profile = await getDowntimeProfile(actor);
  if (!isPrimaryActiveGm() || Date.now() >= expiresAt || !isDowntimeEligible(entry, profile)) return null;
  // All shared payments are serialized on the primary GM and use current balances.
  const payment = getDowntimePayment(actor, entry, { ...options, user });
  if (!payment) return null;
  if (!payment.group && !payment.teacher) return payPersonal(actor, entry, payment);
  const payer = payment.teacher ?? payment.group;
  const path = payment.teacher ? DTP_PATH : "system.coins.gp";
  const cost = payment.teacher ? 1 : payment.gold;
  const balance = () => payment.teacher ? getDtp(payer) : getGold(payer);
  if (!await payer.update({ [path]: balance() - cost })) return null;
  try {
    if (!isPrimaryActiveGm() || getDtp(actor) < 1
      || !await actor.update({ ...payment.update, [DTP_PATH]: getDtp(actor) - 1 })) throw new Error("DTP payment was rejected.");
  } catch (error) {
    // Restore the shared payer's resource if the learner update fails.
    try {
      const current = balance();
      if (current === null || !Number.isSafeInteger(current + cost) || !await payer.update({ [path]: current + cost })) throw error;
    } catch (refundError) {
      const review = paymentReviewError();
      review.cause = refundError;
      throw review;
    }
    throw error;
  }
  return payment.teacher
    ? { gold: 0, groupUuid: null, groupName: null, teacherUuid: payer.uuid, teacherName: payer.name, teacherRemaining: getDtp(payer) }
    : { gold: payment.gold, groupUuid: payer.uuid, groupName: payer.name };
}

function paymentData(message) {
  return message?.getFlag?.(MODULE_ID, PAYMENT_FLAG) ?? message?.flags?.[MODULE_ID]?.[PAYMENT_FLAG];
}

async function handlePartyPaymentRequest(message) {
  const data = paymentData(message);
  if (!isPrimaryActiveGm() || !message?.id || data?.status !== "pending" || handledRequests.has(message.id)) return;
  handledRequests.add(message.id);
  return queueSharedPayment(async () => {
    const actor = Array.from(globalThis.game?.actors ?? []).find(actor => actor.uuid === data.actorUuid);
    const entry = getDowntimeOption(data.activityId);
    const user = message.author;
    let receipt = null;
    let review = false;
    try {
      if (!isPrimaryActiveGm()) return;
      await message.update({ [`flags.${MODULE_ID}.${PAYMENT_FLAG}.status`]: "processing" });
      if (user?.active && canSpendDtp(actor, user) && entry && Date.now() - message.timestamp < 25000) {
        receipt = await applySharedPayment(actor, entry, { groupUuid: data.groupUuid, teacherUuid: data.teacherUuid }, user, message.timestamp + 25000);
      }
    } catch (error) {
      review = true;
      console.error(`${MODULE_ID} | DTP | Shared payment failed`, error);
    }
    const key = receipt ? receipt.teacherUuid ? "teachingPaid" : receipt.groupUuid ? "partyPaid" : "personalPaid"
      : review ? "paymentReview" : "sharedPaymentFailed";
    await message.update({
      content: `<p>${escapeHtml(localize(key, {
        actor: actor?.name ?? "", gold: receipt?.gold ?? 0, group: receipt?.groupName ?? "", teacher: receipt?.teacherName ?? ""
      }))}</p>`,
      [`flags.${MODULE_ID}.${PAYMENT_FLAG}`]: {
        ...data, status: review ? "review" : receipt ? "paid" : "failed", receipt, authorityId: globalThis.game.user.id
      }
    });
  });
}

function receivePartyPayment(message) {
  const data = paymentData(message);
  const pending = pendingPayments.get(data?.requestId);
  if (!pending || data.actorUuid !== pending.actorUuid || data.groupUuid !== pending.groupUuid
    || (data.teacherUuid ?? "") !== pending.teacherUuid
    || data.authorityId !== pending.authorityId || !["paid", "failed", "review"].includes(data.status)) return;
  clearTimeout(pending.timer);
  pendingPayments.delete(data.requestId);
  if (data.status === "review") pending.reject(paymentReviewError());
  else pending.resolve(data.status === "paid" ? data.receipt : null);
}

async function requestSharedPayment(actor, entry, payment) {
  const authority = getPrimaryActiveGm();
  if (!authority || !globalThis.ChatMessage?.create) return null;
  const requestId = globalThis.foundry?.utils?.randomID?.() ?? globalThis.crypto?.randomUUID?.();
  if (!requestId) return null;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingPayments.delete(requestId);
      reject(paymentReviewError());
    }, 30000);
    const groupUuid = payment.group?.uuid ?? null;
    const teacherUuid = payment.teacher?.uuid ?? "";
    pendingPayments.set(requestId, { resolve, reject, timer, actorUuid: actor.uuid, groupUuid, teacherUuid, authorityId: authority.id });
    void globalThis.ChatMessage.create({
      content: `<p>${escapeHtml(localize(teacherUuid ? "teacherPaying" : "partyPaying", {
        actor: actor.name, group: payment.group?.name, teacher: payment.teacher?.name
      }))}</p>`,
      whisper: [...new Set([authority.id, globalThis.game.user.id])],
      flags: { [MODULE_ID]: { [PAYMENT_FLAG]: {
        requestId, status: "pending", actorUuid: actor.uuid, activityId: entry.id, groupUuid, teacherUuid
      } } }
    }).then(message => {
      if (!message) throw new Error("Downtime payment request was not saved.");
      receivePartyPayment(message);
    }).catch(error => {
      clearTimeout(timer);
      pendingPayments.delete(requestId);
      reject(error);
    });
  });
}

async function payDowntime(actor, entry, options = {}) {
  const payment = getDowntimePayment(actor, entry, options);
  if (!payment) return null;
  if (!payment.group && !payment.teacher) return payPersonal(actor, entry, payment);
  if (isPrimaryActiveGm()) {
    return queueSharedPayment(() => applySharedPayment(actor, entry, {
      groupUuid: payment.group?.uuid, teacherUuid: payment.teacher?.uuid
    }, globalThis.game.user));
  }
  return requestSharedPayment(actor, entry, payment);
}

function localize(key, data = {}) {
  return globalThis.game?.i18n?.format?.(`MK_SHADOWDARK.dtp.${key}`, data) ?? key;
}

function paymentReviewError() {
  const error = new Error(localize("paymentReview"));
  error.partyPaymentReview = true;
  return error;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

globalThis.Hooks?.on?.("createChatMessage", message => {
  void handlePartyPaymentRequest(message).catch(error => console.error(`${MODULE_ID} | DTP | Payment request failed`, error));
  receivePartyPayment(message);
});
globalThis.Hooks?.on?.("updateChatMessage", receivePartyPayment);

export {
  canSpendDtp, getGold, getPartyGroups, getSkillTeachers, getPersonalSpendUpdate, getDowntimePayment,
  payDowntime, handlePartyPaymentRequest, receivePartyPayment
};
