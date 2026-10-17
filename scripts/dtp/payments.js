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
let partyPaymentQueue = Promise.resolve();

function canSpendDtp(actor, user = globalThis.game?.user) {
  return globalThis.game?.system?.id === "shadowdark" && actor?.type === "Player" && !isGroupActor(actor)
    && canUserControlActor(actor, user);
}

function getGold(actor) {
  const gp = Number(actor?.system?.coins?.gp ?? 0);
  return Number.isSafeInteger(gp) && gp >= 0 ? gp : null;
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

function getDowntimePayment(actor, entry, { groupUuid = "", user = globalThis.game?.user } = {}) {
  if (!canSpendDtp(actor, user) || getDowntimeOption(entry?.id) !== entry) return null;
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

function queuePartyPayment(callback) {
  const next = partyPaymentQueue.catch(() => {}).then(callback);
  partyPaymentQueue = next;
  return next;
}

async function applyPartyPayment(actor, entry, groupUuid, user, expiresAt = Infinity) {
  const profile = await getDowntimeProfile(actor);
  if (!isPrimaryActiveGm() || Date.now() >= expiresAt || !isDowntimeEligible(entry, profile)) return null;
  // All shared payments are serialized on the primary GM and use current balances.
  const payment = getDowntimePayment(actor, entry, { groupUuid, user });
  if (!payment) return null;
  if (!payment.group) return payPersonal(actor, entry, payment);
  const group = payment.group;
  if (!await group.update({ "system.coins.gp": getGold(group) - payment.gold })) return null;
  try {
    if (!await actor.update(payment.update)) throw new Error("DTP payment was rejected.");
  } catch (error) {
    // Return the fee if the character update fails, preserving other gold changes.
    try {
      const gp = getGold(group);
      if (gp === null || !await group.update({ "system.coins.gp": gp + payment.gold })) throw error;
    } catch (refundError) {
      const review = paymentReviewError();
      review.cause = refundError;
      throw review;
    }
    throw error;
  }
  return { gold: payment.gold, groupUuid: group.uuid, groupName: group.name };
}

function paymentData(message) {
  return message?.getFlag?.(MODULE_ID, PAYMENT_FLAG) ?? message?.flags?.[MODULE_ID]?.[PAYMENT_FLAG];
}

async function handlePartyPaymentRequest(message) {
  const data = paymentData(message);
  if (!isPrimaryActiveGm() || !message?.id || data?.status !== "pending" || handledRequests.has(message.id)) return;
  handledRequests.add(message.id);
  return queuePartyPayment(async () => {
    const actor = Array.from(globalThis.game?.actors ?? []).find(actor => actor.uuid === data.actorUuid);
    const entry = getDowntimeOption(data.activityId);
    const user = message.author;
    let receipt = null;
    let review = false;
    try {
      if (!isPrimaryActiveGm()) return;
      await message.update({ [`flags.${MODULE_ID}.${PAYMENT_FLAG}.status`]: "processing" });
      if (user?.active && canSpendDtp(actor, user) && entry && Date.now() - message.timestamp < 25000) {
        receipt = await applyPartyPayment(actor, entry, data.groupUuid, user, message.timestamp + 25000);
      }
    } catch (error) {
      review = true;
      console.error(`${MODULE_ID} | DTP | Party Treasure payment failed`, error);
    }
    const key = receipt ? receipt.groupUuid ? "partyPaid" : "personalPaid" : review ? "partyReview" : "partyPaymentFailed";
    await message.update({
      content: `<p>${escapeHtml(localize(key, { actor: actor?.name ?? "", gold: receipt?.gold ?? 0, group: receipt?.groupName ?? "" }))}</p>`,
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
    || data.authorityId !== pending.authorityId || !["paid", "failed", "review"].includes(data.status)) return;
  clearTimeout(pending.timer);
  pendingPayments.delete(data.requestId);
  if (data.status === "review") pending.reject(paymentReviewError());
  else pending.resolve(data.status === "paid" ? data.receipt : null);
}

async function requestPartyPayment(actor, entry, group) {
  const authority = getPrimaryActiveGm();
  if (!authority || !globalThis.ChatMessage?.create) return null;
  const requestId = globalThis.foundry?.utils?.randomID?.() ?? globalThis.crypto?.randomUUID?.();
  if (!requestId) return null;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingPayments.delete(requestId);
      reject(paymentReviewError());
    }, 30000);
    pendingPayments.set(requestId, { resolve, reject, timer, actorUuid: actor.uuid, groupUuid: group.uuid, authorityId: authority.id });
    void globalThis.ChatMessage.create({
      content: `<p>${escapeHtml(localize("partyPaying", { actor: actor.name, group: group.name }))}</p>`,
      whisper: [...new Set([authority.id, globalThis.game.user.id])],
      flags: { [MODULE_ID]: { [PAYMENT_FLAG]: {
        requestId, status: "pending", actorUuid: actor.uuid, activityId: entry.id, groupUuid: group.uuid
      } } }
    }).then(message => {
      if (!message) throw new Error("Party Treasure request was not saved.");
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
  if (!payment.group) return payPersonal(actor, entry, payment);
  if (isPrimaryActiveGm()) {
    return queuePartyPayment(() => applyPartyPayment(actor, entry, payment.group.uuid, globalThis.game.user));
  }
  return requestPartyPayment(actor, entry, payment.group);
}

function localize(key, data = {}) {
  return globalThis.game?.i18n?.format?.(`MK_SHADOWDARK.dtp.${key}`, data) ?? key;
}

function paymentReviewError() {
  const error = new Error(localize("partyReview"));
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
  canSpendDtp, getGold, getPartyGroups, getPersonalSpendUpdate, getDowntimePayment,
  payDowntime, handlePartyPaymentRequest, receivePartyPayment
};
