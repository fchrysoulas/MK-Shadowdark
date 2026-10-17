import { getDtp } from "../libs/downtime-resources.js";
import { BASTION_ACTOR_TYPE } from "../bastion-sheet/constants.js";
import {
  CAROUSING_OUTCOMES, getCarousingOutcome, getCarousingDtpRequirement, normalizeCarousingBonus
} from "./outcomes.js";

const MODULE_ID = "mk-shadowdark";
let eventInProgress = false;

function localize(key, data = {}) {
  return globalThis.game?.i18n?.format?.(`MK_SHADOWDARK.carousing.${key}`, data) ?? key;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function canRunCarousing() {
  return globalThis.game?.system?.id === "shadowdark" && globalThis.game?.user?.isGM === true;
}

function isCarousingCharacter(actor) {
  return actor?.type === "Player"
    && !(actor.getFlag?.(MODULE_ID, "isGroup") ?? actor.flags?.[MODULE_ID]?.isGroup);
}

function getCarousingLocation({ bastionId = "", sanctuary = "" } = {}) {
  if (!bastionId) {
    const name = String(sanctuary).trim();
    return name ? { name, brewery: 0, bastionId: null } : null;
  }
  const bastion = globalThis.game?.actors?.get?.(bastionId);
  if (bastion?.type !== BASTION_ACTOR_TYPE) return null;
  const built = bastion.getFlag?.(MODULE_ID, "bastion")?.upgrades;
  const upgrades = Array.isArray(built) ? built : [];
  return upgrades.includes("tavern")
    ? { name: bastion.name, brewery: upgrades.includes("brewery") ? 1 : 0, bastionId }
    : null;
}

function validateCarousingEvent(event) {
  const location = getCarousingLocation(event ?? {});
  const bonus = normalizeCarousingBonus(event?.bonus);
  const cost = Number(event?.cost);
  const days = Number(event?.days);
  const seconds = days * 86400;
  if (!location || bonus === null || !Number.isSafeInteger(cost) || cost < 1
    || !Number.isFinite(days) || days <= 0 || !Number.isSafeInteger(seconds)
    || !["individual", "group"].includes(event?.mode)) return { error: "invalid" };
  if (location.bastionId && cost > 100) return { error: "tavernLimit" };
  const requiredDtp = getCarousingDtpRequirement(bonus, location.brewery);
  if (!Array.isArray(event?.participants) || !event.participants.length) return { error: "participantsRequired" };
  const seen = new Set();
  const participants = [];
  for (const participant of event.participants) {
    const actor = globalThis.game?.actors?.get?.(participant?.actorId);
    const contribution = Number(participant?.contribution);
    if (!isCarousingCharacter(actor) || seen.has(actor.id)
      || !Number.isSafeInteger(contribution) || contribution < 1) return { error: "invalid" };
    const gp = Number(actor.system?.coins?.gp);
    const xp = Number(actor.system?.level?.xp);
    if (!Number.isSafeInteger(gp) || gp < contribution || !Number.isSafeInteger(getDtp(actor)) || getDtp(actor) < requiredDtp
      || !Number.isSafeInteger(xp) || xp < 0 || !Number.isSafeInteger(xp + 6)) return { error: "resources", actor: actor.name, dtp: requiredDtp };
    participants.push({ actor, contribution });
    seen.add(actor.id);
  }
  const total = participants.reduce((sum, participant) => sum + participant.contribution, 0);
  if (!Number.isSafeInteger(total) || total !== cost) return { error: "contributions" };
  const roller = event.mode === "group" ? participants.find(participant => participant.actor.id === event.rollerId) : null;
  if (event.mode === "group" && !roller) return { error: "rollerRequired" };
  return { location, bonus, cost, days, seconds, requiredDtp, participants, roller, mode: event.mode };
}

function buildCarousingTable() {
  return `<table class="mk-carousing-outcomes"><thead><tr>
    <th>${escapeHtml(localize("result"))}</th><th>${escapeHtml(localize("description"))}</th>
    <th>${escapeHtml(localize("benefits"))}</th><th>${escapeHtml(localize("dtpCost"))}</th>
    </tr></thead><tbody>${CAROUSING_OUTCOMES.map(outcome => `<tr>
      <td>${outcome.result === 14 ? "14+" : outcome.result}</td><td>${escapeHtml(outcome.description)}</td>
      <td>${outcome.xp} XP${outcome.benefit ? ` + ${escapeHtml(outcome.benefit)}` : ""}</td><td>${outcome.dtp}</td>
    </tr>`).join("")}</tbody></table>`;
}

function buildCarousingMenu(actor) {
  const actors = Array.from(globalThis.game?.actors ?? []);
  const players = actors.filter(entry => isCarousingCharacter(entry) && entry.visible !== false);
  const bastions = actors.filter(entry => entry.type === BASTION_ACTOR_TYPE && entry.visible !== false);
  const disabled = canRunCarousing() ? "" : " disabled";
  return `<div class="mk-dtp-menu mk-carousing-menu">
    <p>${escapeHtml(localize("rules"))}</p>
    <p class="mk-dtp-note">${escapeHtml(localize("gmResolution"))}</p>
    <div class="mk-carousing-fields">
      <label>${escapeHtml(localize("location"))}<select name="bastionId"${disabled}>
        <option value="">${escapeHtml(localize("otherSanctuary"))}</option>
        ${bastions.map(bastion => `<option value="${escapeHtml(bastion.id)}">${escapeHtml(bastion.name)}</option>`).join("")}
      </select></label>
      <label>${escapeHtml(localize("sanctuary"))}<input type="text" name="sanctuary"${disabled}></label>
      <label>${escapeHtml(localize("eventCost"))}<input type="number" name="cost" min="1" step="1" value="100" required${disabled}></label>
      <label>${escapeHtml(localize("bonus"))}<input type="text" name="bonus" value="0" placeholder="0 / 1d6" required${disabled}></label>
      <label>${escapeHtml(localize("days"))}<input type="number" name="days" min="0.001" step="any" required${disabled}></label>
      <label>${escapeHtml(localize("mode"))}<select name="mode"${disabled}>
        <option value="individual">${escapeHtml(localize("individual"))}</option>
        <option value="group">${escapeHtml(localize("group"))}</option>
      </select></label>
      <label>${escapeHtml(localize("roller"))}<select name="rollerId"${disabled}>
        ${players.map(player => `<option value="${escapeHtml(player.id)}"${player.id === actor?.id ? " selected" : ""}>${escapeHtml(player.name)}</option>`).join("")}
      </select></label>
    </div>
    <p class="mk-dtp-note">${escapeHtml(localize("availability"))}</p>
    <p class="mk-dtp-note">${escapeHtml(localize("balanceRule"))}</p>
    <fieldset class="mk-carousing-participants"><legend>${escapeHtml(localize("participants"))}</legend>
      ${players.map(player => `<label class="mk-carousing-participant">
        <input type="checkbox" name="participant-${escapeHtml(player.id)}"${player.id === actor?.id ? " checked" : ""}${disabled}>
        <span>${escapeHtml(player.name)}<small>${getDtp(player)} DTP · ${Number(player.system?.coins?.gp) || 0} gp</small></span>
        <input type="number" name="contribution-${escapeHtml(player.id)}" min="0" step="1" value="${player.id === actor?.id ? 100 : 0}" aria-label="${escapeHtml(localize("contribution", { actor: player.name }))}"${disabled}>
        <span>gp</span>
      </label>`).join("")}
    </fieldset>
    <details><summary>${escapeHtml(localize("outcomeTable"))}</summary>${buildCarousingTable()}</details>
  </div>`;
}

function readCarousingForm(form) {
  const value = name => form?.elements?.namedItem?.(name)?.value ?? form?.elements?.[name]?.value;
  const checked = name => form?.elements?.namedItem?.(name)?.checked ?? form?.elements?.[name]?.checked;
  return {
    bastionId: value("bastionId"), sanctuary: value("sanctuary"), bonus: value("bonus"),
    cost: value("cost"), days: value("days"), mode: value("mode"), rollerId: value("rollerId"),
    participants: Array.from(globalThis.game?.actors ?? [])
      .filter(actor => isCarousingCharacter(actor) && checked(`participant-${actor.id}`))
      .map(actor => ({ actorId: actor.id, contribution: value(`contribution-${actor.id}`) }))
  };
}

function warnInvalidEvent(validation) {
  globalThis.ui?.notifications?.warn?.(localize(validation.error, validation));
}

function buildCarousingReport(validated, results) {
  return `<div class="mk-dtp-result mk-carousing-result">
    <strong class="mk-dtp-result-title">Carousing*</strong>
    <p>${escapeHtml(validated.location.name)} · ${validated.cost} gp · ${validated.days} ${escapeHtml(localize("dayUnit"))}</p>
    <p>${escapeHtml(localize(validated.mode))} · 1d8 + ${escapeHtml(validated.bonus)}${validated.location.brewery ? " + 1 (Brewery)" : ""}</p>
    ${results.map(({ actor, contribution, roll, outcome }) => `<section>
      <h4>${escapeHtml(actor.name)} · ${roll.total >= 14 ? "14+" : roll.total}</h4>
      <p>${escapeHtml(outcome.description)}</p>
      <p><strong>${outcome.xp} XP${outcome.benefit ? ` + ${escapeHtml(outcome.benefit)}` : ""}</strong></p>
      <p class="mk-dtp-result-cost">${escapeHtml(localize("cost", { dtp: outcome.dtp, gold: contribution }))}</p>
    </section>`).join("")}
    <p class="mk-dtp-note">${escapeHtml(localize("consequences"))}</p>
    <p class="mk-carousing-status">${escapeHtml(localize("pending"))}</p>
  </div>`;
}

function getCarousingUpdate({ actor, contribution, outcome }) {
  const update = {
    _id: actor.id,
    [`flags.${MODULE_ID}.dtp`]: getDtp(actor) - outcome.dtp,
    "system.coins.gp": Number(actor.system.coins.gp) - contribution,
    "system.level.xp": Number(actor.system.level.xp) + outcome.xp
  };
  if (outcome.luck) {
    let pulp = false;
    try { pulp = Boolean(globalThis.game?.settings?.get?.("shadowdark", "usePulpMode")); } catch { /* Default luck rules. */ }
    update["system.luck.available"] = true;
    update["system.luck.remaining"] = pulp ? Math.max(0, Number(actor.system.luck?.remaining) || 0) + 1 : 1;
  }
  return update;
}

async function performCarousing(event, { confirmed = false } = {}) {
  if (!canRunCarousing() || !confirmed || eventInProgress) return false;
  const validated = validateCarousingEvent(event);
  if (validated.error) { warnInvalidEvent(validated); return false; }
  if (typeof globalThis.Roll !== "function" || typeof globalThis.Actor?.updateDocuments !== "function"
    || typeof globalThis.ChatMessage?.create !== "function" || typeof globalThis.game?.time?.advance !== "function") {
    globalThis.ui?.notifications?.error?.(localize("unavailable"));
    return false;
  }
  eventInProgress = true;
  let message;
  try {
    const formula = `1d8 + ${validated.bonus} + ${validated.location.brewery}`;
    const rollers = validated.mode === "group" ? [validated.roller] : validated.participants;
    const rolls = [];
    for (const participant of rollers) {
      const roll = await new globalThis.Roll(formula, participant.actor.getRollData?.() ?? {}).evaluate();
      if (!getCarousingOutcome(roll.total)) throw new Error("Invalid carousing roll");
      rolls.push(roll);
    }
    // Recheck every participant and the hosting upgrades after async dice evaluation.
    const current = validateCarousingEvent(event);
    if (current.error) { warnInvalidEvent(current); return false; }
    if (current.location.brewery !== validated.location.brewery) {
      warnInvalidEvent({ error: "invalid" });
      return false;
    }
    const results = current.participants.map((participant, index) => {
      const roll = rolls[validated.mode === "group" ? 0 : index];
      return { ...participant, roll, outcome: getCarousingOutcome(roll.total) };
    });
    const report = buildCarousingReport(current, results);
    message = await globalThis.ChatMessage.create({
      speaker: globalThis.ChatMessage.getSpeaker?.({ actor: (validated.roller ?? validated.participants[0]).actor }),
      content: report, rolls,
      flags: { [MODULE_ID]: { carousing: {
        status: "pending", location: current.location, cost: current.cost, days: current.days,
        bonus: current.bonus, mode: current.mode, rollerId: current.roller?.actor.id ?? null,
        results: results.map(({ actor, contribution, roll, outcome }) => ({
          actorId: actor.id, contribution, total: roll.total, result: outcome.result, xp: outcome.xp,
          dtp: outcome.dtp, itemRange: outcome.itemRange ?? null
        }))
      } } }
    });
    if (!message?.update) throw new Error("Carousing report was not saved");
    // Save the rolled outcomes before applying any costs, so a failed update remains reviewable.
    const saved = await globalThis.Actor.updateDocuments(results.map(getCarousingUpdate));
    if (saved?.length !== results.length) throw new Error("Not all carousing participants were updated");
    await message.update({ [`flags.${MODULE_ID}.carousing.status`]: "timePending" });
    await globalThis.game.time.advance(current.seconds);
    await message.update({
      [`flags.${MODULE_ID}.carousing.status`]: "complete",
      content: report.replace(escapeHtml(localize("pending")), escapeHtml(localize("complete")))
    });
    return true;
  } catch (error) {
    if (message?.update) {
      try {
        await message.update({
          [`flags.${MODULE_ID}.carousing.status`]: "needsReview",
          content: `${message.content ?? ""}<p>${escapeHtml(localize("review"))}</p>`
        });
      } catch { /* Preserve the original failure and its already saved dice. */ }
    }
    globalThis.ui?.notifications?.error?.(localize(message ? "review" : "failed"));
    console.error(`${MODULE_ID} | Carousing | event failed`, error);
    return false;
  } finally {
    eventInProgress = false;
  }
}

async function openCarousingMenu(actor) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (globalThis.game?.system?.id !== "shadowdark" || !isCarousingCharacter(actor) || typeof DialogV2?.wait !== "function") return;
  const event = await DialogV2.wait({
    window: { title: "Carousing*" }, position: { width: 760 }, classes: ["mk-dtp-dialog"],
    content: buildCarousingMenu(actor),
    buttons: [
      { action: "prepare", label: localize("prepare"), icon: "fa-solid fa-wine-glass", disabled: !canRunCarousing(),
        callback: (_event, button) => readCarousingForm(button.form) },
      { action: "cancel", label: localize("close"), callback: () => false }
    ], rejectClose: false, close: () => null
  });
  if (!event || !canRunCarousing()) return;
  const validated = validateCarousingEvent(event);
  if (validated.error) { warnInvalidEvent(validated); return; }
  const confirmed = await DialogV2.wait({
    window: { title: localize("confirmTitle") },
    content: `<div class="mk-carousing-confirm"><p>${escapeHtml(localize("confirm", {
      location: validated.location.name, cost: validated.cost, days: validated.days,
      bonus: validated.bonus, brewery: validated.location.brewery, dtp: validated.requiredDtp
    }))}</p><p>${escapeHtml(localize(validated.mode))}</p>
      <ul>${validated.participants.map(({ actor, contribution }) => `<li>${escapeHtml(actor.name)}: ${contribution} gp</li>`).join("")}</ul>
      ${validated.roller ? `<p>${escapeHtml(localize("roller"))}: ${escapeHtml(validated.roller.actor.name)}</p>` : ""}
      <p>${escapeHtml(localize("confirmTime"))}</p></div>`,
    buttons: [
      { action: "roll", label: localize("roll"), icon: "fa-solid fa-dice", callback: () => true },
      { action: "cancel", label: localize("close"), callback: () => false }
    ], rejectClose: false, close: () => false
  });
  if (confirmed) await performCarousing(event, { confirmed: true });
}

export {
  buildCarousingMenu, buildCarousingTable, canRunCarousing, getCarousingLocation,
  getCarousingUpdate, openCarousingMenu, performCarousing, readCarousingForm, validateCarousingEvent
};
