import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";
import {
  DOWNTIME_ACTIVITIES, DOWNTIME_OPTIONS, getDowntimeOption,
  getDowntimeGoldCost, getDowntimeProfile, isDowntimeEligible
} from "./activities.js";

const MODULE_ID = "mk-shadowdark";
const FLAG_KEY = "dtp";
const FLAG_PATH = `flags.${MODULE_ID}.${FLAG_KEY}`;
const activeAttempts = new Set();

function localize(key, data = {}) {
  return globalThis.game?.i18n?.format?.(`MK_SHADOWDARK.dtp.${key}`, data) ?? key;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function getDtp(actor) {
  const value = Number(actor?.getFlag?.(MODULE_ID, FLAG_KEY) ?? actor?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function canEditDtp(app) {
  return globalThis.game?.user?.isGM === true && app?.isEditable !== false;
}

function canSpendDtp(actor) {
  return globalThis.game?.system?.id === "shadowdark" && actor?.type === "Player"
    && (globalThis.game?.user?.isGM === true || actor.isOwner === true);
}

function getSpendUpdate(actor, entry) {
  const gold = getDowntimeGoldCost(actor, entry);
  if (!entry || getDtp(actor) < 1 || gold === null) return null;
  const gp = Number(actor?.system?.coins?.gp ?? 0);
  if (gold > 0 && (!Number.isSafeInteger(gp) || gp < gold)) return null;
  return { [FLAG_PATH]: getDtp(actor) - 1, ...(gold > 0 ? { "system.coins.gp": gp - gold } : {}) };
}

function flattenUpdate(change, prefix = "", result = {}) {
  for (const [key, value] of Object.entries(change ?? {})) {
    const path = [prefix, key].filter(Boolean).join(".");
    if (value && typeof value === "object" && !Array.isArray(value)) flattenUpdate(value, path, result);
    else result[path] = value;
  }
  return result;
}

function isDtpSpend(actor, change, options) {
  if (!canSpendDtp(actor)) return false;
  const entry = getDowntimeOption(options?.mkShadowdarkDtp?.activityId);
  const expected = getSpendUpdate(actor, entry);
  if (!expected) return false;
  const actual = flattenUpdate(change);
  if (actual._id === actor.id) delete actual._id;
  return Object.keys(actual).length === Object.keys(expected).length
    && Object.entries(expected).every(([path, value]) => actual[path] === value);
}

async function spendDtp(actor, entry) {
  if (!canSpendDtp(actor) || getDowntimeOption(entry?.id) !== entry) return false;
  const update = getSpendUpdate(actor, entry);
  if (!update) return false;
  // One document update keeps the point and starred activity's gold payment together.
  const saved = await actor.update(update, { mkShadowdarkDtp: { activityId: entry.id } });
  return Boolean(saved);
}

async function saveDtp(actor, value) {
  if (globalThis.game?.user?.isGM !== true || actor?.type !== "Player") return false;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return false;
  await actor.setFlag(MODULE_ID, FLAG_KEY, number);
  return true;
}

function changesDtp(change, { recursive = true } = {}, prefix = "") {
  if (!change || typeof change !== "object") return false;
  return Object.entries(change).some(([key, value]) => {
    const deletion = key.split(".").some(part => part.startsWith("-="));
    const path = [prefix, key].filter(Boolean).join(".").replace(/(^|\.)-=/g, "$1");
    if (path === FLAG_PATH || path.startsWith(`${FLAG_PATH}.`)) return true;
    if (!FLAG_PATH.startsWith(`${path}.`)) return false;
    if (deletion || !recursive || !value || typeof value !== "object") return true;
    return changesDtp(value, { recursive }, path);
  });
}

function guardDtpUpdate(actor, change, options) {
  if (globalThis.game?.system?.id !== "shadowdark" || actor?.type !== "Player") return;
  if (globalThis.game?.user?.isGM === true || !changesDtp(change, options)) return;
  if (options?.recursive !== false && isDtpSpend(actor, change, options)) return;
  return false;
}

function buildDowntimeMenu(actor, profile) {
  const canSpend = canSpendDtp(actor);
  return `<div class="mk-dtp-menu">
    <p class="mk-dtp-balance"><strong>${escapeHtml(actor.name)}</strong> · ${getDtp(actor)} DTP · ${Number(actor.system?.coins?.gp) || 0} gp</p>
    <p>${escapeHtml(localize("rules"))}</p>
    <p class="mk-dtp-note">${escapeHtml(localize("outcomes"))}</p>
    <label class="mk-dtp-requirements"><input type="checkbox" name="requirements" required> ${escapeHtml(localize("requirements"))}</label>
    ${DOWNTIME_ACTIVITIES.map((activity, index) => `<details${index === 0 ? " open" : ""}>
      <summary>${escapeHtml(activity.title)} <span>${escapeHtml(activity.facility)}</span></summary>
      <p>${escapeHtml(activity.description)}</p>
      ${activity.groups.map(group => {
        const entries = DOWNTIME_OPTIONS.filter(entry => entry.activity === activity && entry.group === group);
        const eligible = isDowntimeEligible(entries[0], profile);
        return `<section class="mk-dtp-group"><h4>${escapeHtml(group.label)}</h4>
          ${!eligible ? `<p class="mk-dtp-note">${escapeHtml(localize("classRequired"))}</p>` : ""}
          ${group.abilities.length > 1 ? `<label class="mk-dtp-ability">${escapeHtml(localize("ability"))}
            <select name="ability-${activity.id}-${group.id}">${group.abilities.map(ability => `<option value="${ability}">${ability.toUpperCase()}</option>`).join("")}</select></label>` : ""}
          ${entries.map(entry => {
            const gold = getDowntimeGoldCost(actor, entry);
            const affordable = Boolean(getSpendUpdate(actor, entry));
            return `<label class="mk-dtp-option${!eligible || !affordable ? " is-unavailable" : ""}">
              <input type="radio" name="activity" value="${entry.id}" required${!canSpend || !eligible || !affordable ? " disabled" : ""}>
              <span><strong>DC ${entry.dc}${entry.starred ? "*" : ""} · ${escapeHtml(entry.label)}</strong>
                <span>${escapeHtml(entry.description)}</span>
                <small>${escapeHtml(localize("cost", { gold: gold ?? "?" }))}${!affordable ? ` · ${escapeHtml(localize("insufficient"))}` : ""}</small></span>
            </label>`;
          }).join("")}</section>`;
      }).join("")}
    </details>`).join("")}
  </div>`;
}

async function performDowntime(actor, activityId, ability, { requirementsMet = false } = {}) {
  const entry = getDowntimeOption(activityId);
  const key = actor?.uuid ?? actor?.id ?? actor;
  if (!canSpendDtp(actor) || !entry || !requirementsMet || !entry.group.abilities.includes(ability) || activeAttempts.has(key)) return false;
  activeAttempts.add(key);
  let paid = false;
  try {
    if (!isDowntimeEligible(entry, await getDowntimeProfile(actor))) return false;
    if (!getSpendUpdate(actor, entry)) {
      globalThis.ui?.notifications?.warn?.(localize("insufficient"));
      return false;
    }
    const dice = globalThis.shadowdark?.dice;
    if (typeof actor.system?.rollConfigGenerators?.check !== "function"
      || typeof dice?.rollDialog !== "function" || typeof dice?.roll !== "function") {
      globalThis.ui?.notifications?.error?.(localize("rollUnavailable"));
      return false;
    }
    const config = {
      actorUuid: actor.uuid, check: { stat: ability }, skipPrompt: false,
      title: entry.activity.title,
      heading: `${entry.activity.title}: ${entry.label} · ${ability.toUpperCase()} DC ${entry.dc} · ${localize("noLuck")}`,
      mainRoll: { dc: entry.dc }
    };
    await actor.system.rollConfigGenerators.check(config);
    if (!await dice.rollDialog(config)) return false;
    if (globalThis.Hooks?.call?.("SD-Stat-Check", config) === false) return false;
    config.mainRoll.dc = entry.dc;
    config.mainRoll.type = "main";
    const roll = await dice.roll(config.mainRoll, actor.getRollData?.() ?? {});
    if (!roll || !Number.isFinite(roll.total)) return false;
    const gold = getDowntimeGoldCost(actor, entry);
    // Recheck current resources after the native prompt. Closing it never spends anything.
    if (!await spendDtp(actor, entry)) {
      globalThis.ui?.notifications?.warn?.(localize("insufficient"));
      return false;
    }
    paid = true;
    const success = roll.criticalSuccess === true
      || (roll.criticalFailure !== true && (roll.success ?? roll.total >= entry.dc));
    // Use the native roll template without the system roll-card reroll/luck controls.
    await roll.toMessage({
      speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }),
      flavor: `<div class="mk-dtp-result"><strong>${escapeHtml(entry.activity.title)}: ${escapeHtml(entry.label)}</strong>
        <p>${ability.toUpperCase()} DC ${entry.dc} · ${escapeHtml(localize(success ? "success" : "failure"))}</p>
        ${success ? `<p>${escapeHtml(entry.description)}</p>` : ""}
        <p>${escapeHtml(localize("spent", { gold, remaining: getDtp(actor) }))}</p>
        <p>${escapeHtml(localize("noLuck"))}</p></div>`,
      flags: { [MODULE_ID]: { downtime: { activityId: entry.id, dc: entry.dc, gold, success } } }
    }, { rollMode: config.rollMode });
    return true;
  } catch (error) {
    globalThis.ui?.notifications?.error?.(localize(paid ? "reportFailed" : "attemptFailed"));
    console.error(`${MODULE_ID} | DTP | attempt failed`, error);
    return false;
  } finally {
    activeAttempts.delete(key);
  }
}

async function openDowntimeMenu(actor) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (actor?.type !== "Player" || typeof DialogV2?.wait !== "function") return;
  const profile = await getDowntimeProfile(actor);
  const choice = await DialogV2.wait({
    window: { title: localize("menuTitle") },
    position: { width: 720 },
    classes: ["mk-dtp-dialog"],
    content: buildDowntimeMenu(actor, profile),
    buttons: [
      { action: "attempt", label: localize("attempt"), icon: "fa-solid fa-dice-d20",
        disabled: !canSpendDtp(actor),
        callback: (_event, button) => {
          const form = button.form;
          const entry = getDowntimeOption(form.elements.activity?.value);
          if (!entry || !form.elements.requirements?.checked) return null;
          return {
            activityId: entry.id, requirementsMet: true,
            ability: form.elements[`ability-${entry.activity.id}-${entry.group.id}`]?.value ?? entry.group.abilities[0]
          };
        } },
      { action: "cancel", label: localize("close"), callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
  if (choice) await performDowntime(actor, choice.activityId, choice.ability, choice);
}

function renderDtp(app, html) {
  const actor = app?.actor ?? app?.object;
  const root = html?.[0] ?? html;
  if (globalThis.game?.system?.id !== "shadowdark" || actor?.type !== "Player" || !root?.querySelector) return;

  const grid = root.querySelector(".tab-details .background-grid-a");
  if (!grid) return;
  const languages = [...grid.children].find(child => child.querySelector('[for="system.languages"], .tags'));
  if (!languages) return;

  let box = grid.querySelector(".mk-dtp-box");
  if (!box) {
    const document = grid.ownerDocument;
    box = document.createElement("div");
    box.className = "SD-box mk-dtp-box";
    const header = document.createElement("div");
    header.className = "header";
    const label = document.createElement("button");
    label.type = "button";
    label.className = "mk-dtp-open";
    label.textContent = globalThis.game?.i18n?.localize?.("MK_SHADOWDARK.dtp.label") ?? "DTP";
    label.title = localize("openMenu");
    const openMenu = event => {
      event.preventDefault();
      event.stopPropagation();
      void openDowntimeMenu(actor).catch(error => {
        globalThis.ui?.notifications?.error?.(localize("attemptFailed"));
        console.error(`${MODULE_ID} | DTP | menu failed`, error);
      });
    };
    label.addEventListener("click", openMenu);
    const input = document.createElement("input");
    input.type = "number";
    input.className = "ability-score";
    input.min = "0";
    input.step = "1";
    input.placeholder = "0";
    input.setAttribute("aria-label", label.textContent);
    input.addEventListener("click", event => { if (input.readOnly) openMenu(event); });
    // The GM-owned flag is saved separately from ordinary sheet form submissions.
    input.addEventListener("change", async event => {
      event.stopPropagation();
      if (!canEditDtp(app) || !input.validity.valid) {
        input.value = String(getDtp(actor));
        return;
      }
      try {
        if (!await saveDtp(actor, input.value)) input.value = String(getDtp(actor));
      } catch (error) {
        input.value = String(getDtp(actor));
        globalThis.ui?.notifications?.error?.(globalThis.game?.i18n?.localize?.("MK_SHADOWDARK.dtp.saveFailed") ?? "Could not save DTP.");
        console.error(`${MODULE_ID} | DTP | save failed`, error);
      }
    });
    const content = document.createElement("div");
    content.className = "content centered";
    content.append(input);
    const caption = document.createElement("label");
    caption.append(label);
    header.append(caption, document.createElement("span"));
    box.append(header, content);
    grid.insertBefore(box, languages);
  }

  const input = box.querySelector("input");
  input.value = String(getDtp(actor));
  input.readOnly = !canEditDtp(app);
  input.title = input.readOnly ? localize("openMenu")
    : globalThis.game?.i18n?.localize?.("MK_SHADOWDARK.dtp.gmOnly") ?? "Only the GM can edit DTP.";
  // Preserve the native Patron column even when an observer has no edit links.
  languages.dataset.mkDtpColumns ??= String(Math.max(1,
    Number(languages.style.gridColumn.match(/span\s+(\d+)/)?.[1] ?? 3) - 1));
  languages.style.gridColumn = `span ${languages.dataset.mkDtpColumns}`;
}

onCharacterSheetRender("DTP", renderDtp, { priority: 15 });
globalThis.Hooks?.on?.("preUpdateActor", guardDtpUpdate);

export {
  buildDowntimeMenu, canEditDtp, canSpendDtp, changesDtp, getDtp,
  guardDtpUpdate, isDtpSpend, openDowntimeMenu, performDowntime, renderDtp, saveDtp, spendDtp
};
