import { hasProperty, isEquipped, isStashed } from "../libs/equipment.js";

const MODULE_ID = "mk-shadowdark";
const OFFER_FLAG = "sunderingOffer";
const RESPONSE_FLAG = "sunderingResponse";
const activeDialogs = new Set();
const waitingDecisions = new Map();

function localize(key, data = {}) {
  return globalThis.game?.i18n?.format?.(`MK_SHADOWDARK.sundering.${key}`, data) ?? key;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function primaryGM() {
  return Array.from(globalThis.game?.users ?? []).filter(user => user.active && user.isGM)
    .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
}

function isAuthority() {
  return Boolean(primaryGM() && globalThis.game?.user?.id === primaryGM().id);
}

function ownsActor(user, actor) {
  if (!user) return false;
  if (user.isGM) return true;
  return actor?.testUserPermission?.(user, globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3) === true;
}

function decisionUser(actor) {
  const owners = Array.from(globalThis.game?.users ?? [])
    .filter(user => user.active && !user.isGM && ownsActor(user, actor))
    .sort((left, right) => left.id.localeCompare(right.id));
  return owners.find(user => user.character?.id === actor.id) ?? owners[0] ?? primaryGM();
}

async function sunderingItems(actor, resolveUuid = globalThis.fromUuid) {
  if (actor?.type !== "Player") return [];
  const items = [];
  for (const item of actor.items ?? []) {
    if (!isEquipped(item) || isStashed(item)) continue;
    let sundering = hasProperty(item, "Sundering");
    if (!sundering && typeof resolveUuid === "function") {
      for (const uuid of item.system?.properties ?? []) {
        if (typeof uuid !== "string") continue;
        try {
          const property = await resolveUuid(uuid);
          if (String(property?.name ?? "").trim().toLowerCase() === "sundering") sundering = true;
        } catch (_error) {
          // An unavailable Property document cannot grant Sundering.
        }
        if (sundering) break;
      }
    }
    if (sundering && item.id) items.push(item);
  }
  return items;
}

async function isMeleeWeaponAttack(message, resolveUuid = globalThis.fromUuid) {
  const config = message?.rollConfig ?? message?.getFlag?.("shadowdark", "rollConfig")
    ?? message?.flags?.shadowdark?.rollConfig ?? message?._source?.flags?.shadowdark?.rollConfig;
  if (config?.type !== "attack" || config.cast || !config.itemUuid) return false;
  if (config.attack?.type && config.attack.type !== "melee") return false;
  let item;
  try { item = await resolveUuid?.(config.itemUuid); } catch (_error) { return false; }
  if (!["Weapon", "NPC Attack"].includes(item?.type)) return false;
  if (config.attack?.type) return config.attack.type === "melee";
  return item.type === "Weapon" ? item.system?.type === "melee" : item.system?.ranges?.[0] === "close";
}

async function createOffer(message, target, actor) {
  if (target.operation !== "damage" || target.effectiveAmount <= 0 || actor?.type !== "Player") return null;
  const items = await sunderingItems(actor);
  const user = decisionUser(actor);
  if (!items.length || !user) return null;
  return {
    requestId: `${message.id}:${target.uuid}`,
    status: "pending",
    userId: user.id,
    items: items.map(item => ({ id: item.id, name: item.name })),
    itemId: null,
    itemName: null
  };
}

function responseChoice(response, sourceMessage, target, actor) {
  const data = response?.getFlag?.(MODULE_ID, RESPONSE_FLAG) ?? response?.flags?.[MODULE_ID]?.[RESPONSE_FLAG];
  const author = response?.author ?? globalThis.game?.users?.get?.(response?.user?.id ?? response?.user);
  const offer = target.sundering;
  if (!data || data.messageId !== sourceMessage.id || data.targetUuid !== target.uuid
    || data.requestId !== offer?.requestId || author?.id !== offer.userId || !ownsActor(author, actor)) return undefined;
  if (data.itemId === null) return null;
  return offer.items.some(item => item.id === data.itemId) ? data.itemId : undefined;
}

async function promptForItem(target) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.wait) throw new Error("Foundry DialogV2 is unavailable for Sundering.");
  const offer = target.sundering;
  return DialogV2.wait({
    window: { title: localize("title") },
    classes: ["mk-sundering-dialog"],
    content: `<p>${localize("prompt", { actor: escapeHtml(target.actorName), damage: target.effectiveAmount })}</p>
      <p>${localize("destroyWarning")}</p>
      <div class="form-group"><label>${localize("item")}</label><select name="sunderingItem">
        ${offer.items.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}
      </select></div>`,
    buttons: [
      { action: "sunder", label: localize("sunder"), icon: "fa-solid fa-shield-halved",
        callback: (_event, button) => button.form.elements.sunderingItem.value },
      { action: "damage", label: localize("takeDamage"), default: true, callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
}

async function showOffer(message) {
  const data = message?.getFlag?.(MODULE_ID, OFFER_FLAG) ?? message?.flags?.[MODULE_ID]?.[OFFER_FLAG];
  if (!data || data.resolved || !message.author?.isGM || data.target?.sundering?.userId !== globalThis.game?.user?.id) return;
  const key = data.target.sundering.requestId;
  if (activeDialogs.has(key)) return;
  activeDialogs.add(key);
  try {
    const itemId = await promptForItem(data.target);
    if (message.getFlag(MODULE_ID, OFFER_FLAG)?.resolved) return;
    const itemName = data.target.sundering.items.find(item => item.id === itemId)?.name;
    await ChatMessage.create({
      user: game.user.id,
      content: `<p>${localize(itemName ? "chosen" : "declined", {
        actor: escapeHtml(data.target.actorName), item: escapeHtml(itemName)
      })}</p>`,
      whisper: Array.from(game.users ?? []).filter(user => user.active && user.isGM).map(user => user.id),
      flags: { [MODULE_ID]: { [RESPONSE_FLAG]: {
        messageId: data.messageId, targetUuid: data.target.uuid, requestId: key,
        itemId: itemName ? itemId : null
      } } }
    });
  } catch (error) {
    globalThis.ui?.notifications?.error?.(localize("promptFailed"));
    console.error(`${MODULE_ID} | Sundering | prompt failed`, error);
  } finally { activeDialogs.delete(key); }
}

function receiveResponse(message) {
  const data = message?.getFlag?.(MODULE_ID, RESPONSE_FLAG) ?? message?.flags?.[MODULE_ID]?.[RESPONSE_FLAG];
  if (data && isAuthority()) waitingDecisions.get(data.requestId)?.receive(message);
}

async function waitForDecision(message, target, actor) {
  let finish;
  let fail;
  const result = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const offer = target.sundering;
  const receive = response => {
    const choice = responseChoice(response, message, target, actor);
    if (choice !== undefined) finish({ itemId: choice });
  };
  waitingDecisions.set(offer.requestId, { receive });
  // A persisted response survives a GM reload before the original damage plan is updated.
  const previousResponse = Array.from(game.messages ?? []).find(response => responseChoice(response, message, target, actor) !== undefined);
  if (previousResponse) receive(previousResponse);
  let request;
  let monitor;
  try {
    request = Array.from(game.messages ?? []).find(candidate => {
      const data = candidate.getFlag?.(MODULE_ID, OFFER_FLAG);
      return candidate.author?.isGM && data?.target?.sundering?.requestId === offer.requestId
        && data.target.sundering.userId === offer.userId && !data.resolved;
    });
    if (!request && !previousResponse) {
      request = await ChatMessage.create({
        user: game.user.id,
        content: `<p>${localize("waiting", { actor: escapeHtml(target.actorName) })}</p>`,
        whisper: [...new Set([offer.userId, ...Array.from(game.users ?? []).filter(user => user.active && user.isGM).map(user => user.id)])],
        flags: { [MODULE_ID]: { [OFFER_FLAG]: { messageId: message.id, target, resolved: false } } }
      });
    }
    if (request) void showOffer(request);
    monitor = setInterval(() => {
      if (!isAuthority()) { fail(new Error("Sundering authority changed; the damage plan remains pending.")); return; }
      const user = game.users?.get?.(offer.userId);
      if (!user?.active || !ownsActor(user, actor)) finish({ offline: true });
    }, 1000);
    return await result;
  } finally {
    clearInterval(monitor);
    waitingDecisions.delete(offer.requestId);
    if (request && isAuthority()) await request.setFlag(MODULE_ID, OFFER_FLAG, {
      ...request.getFlag(MODULE_ID, OFFER_FLAG), resolved: true
    });
  }
}

async function resolvePlan(message, state, { persistState, resolveTarget, refreshTarget, ask = waitForDecision } = {}) {
  if (!isAuthority()) throw new Error("Only the primary active GM can resolve Sundering.");
  const working = JSON.parse(JSON.stringify(state));
  const saveState = async () => {
    if (!isAuthority()) throw new Error("Sundering authority changed; the damage plan remains pending.");
    await persistState(working);
  };
  for (const target of working.targets) {
    const offer = target.sundering;
    if (target.state !== "planned" || !offer || !["pending", "destroying"].includes(offer.status)) continue;
    const { actor } = await resolveTarget(target);
    if (offer.status === "pending") {
      let decision;
      do {
        const user = decisionUser(actor);
        if (!user) throw new Error("No active Sundering decision owner.");
        if (offer.userId !== user.id) {
          offer.userId = user.id;
          await saveState();
        }
        decision = await ask(message, target, actor);
      } while (decision.offline);
      if (!isAuthority()) throw new Error("Sundering authority changed before item destruction.");
      const item = offer.items.some(item => item.id === decision.itemId)
        ? (await sunderingItems(actor)).find(item => item.id === decision.itemId) : null;
      offer.itemId = item?.id ?? null;
      offer.itemName = item?.name ?? null;
      offer.status = item ? "destroying" : "declined";
      await refreshTarget(target);
      // Save the destruction intent before deleting the embedded Item.
      await saveState();
    }
    if (offer.status === "destroying") {
      if (!isAuthority()) throw new Error("Sundering authority changed before item destruction.");
      const existing = actor.items?.get?.(offer.itemId) ?? Array.from(actor.items ?? []).find(item => item.id === offer.itemId);
      if (existing) {
        const eligible = (await sunderingItems(actor)).some(item => item.id === offer.itemId);
        if (!eligible) {
          offer.status = "declined";
          await refreshTarget(target);
          await saveState();
          continue;
        }
        if (!isAuthority()) throw new Error("Sundering authority changed before item destruction.");
        await actor.deleteEmbeddedDocuments("Item", [offer.itemId]);
        if (actor.items?.get?.(offer.itemId) ?? Array.from(actor.items ?? []).find(item => item.id === offer.itemId)) {
          throw new Error("The Sundering item was not destroyed; damage remains pending.");
        }
      }
      // A missing Item after persisted destruction intent is a completed deletion on retry.
      await refreshTarget(target);
      offer.status = "destroyed";
      target.afterHp = target.beforeHp;
      target.appliedAmount = 0;
      target.effectiveAmount = 0;
      target.propertyNames = [];
      target.traitMode = null;
      await saveState();
    }
  }
  return working;
}

function handleChat(message) {
  receiveResponse(message);
  void showOffer(message);
}

globalThis.Hooks?.once?.("init", () => {
  const mod = globalThis.game?.modules?.get?.(MODULE_ID);
  if (mod) {
    mod.api ??= {};
    mod.api.sundering = { createOffer, isMeleeWeaponAttack, resolvePlan };
  }
});
globalThis.Hooks?.on?.("createChatMessage", handleChat);
globalThis.Hooks?.on?.("updateChatMessage", handleChat);
globalThis.Hooks?.once?.("ready", () => {
  for (const message of globalThis.game?.messages ?? []) void showOffer(message);
});

export { createOffer, decisionUser, handleChat, isMeleeWeaponAttack, promptForItem, resolvePlan, responseChoice, showOffer, sunderingItems };
