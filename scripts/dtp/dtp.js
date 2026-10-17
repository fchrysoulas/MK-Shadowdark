import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";
import { getDtp } from "../libs/downtime-resources.js";
import { openCarousingMenu } from "../carousing/carousing.js";
import { canSpendDtp, getGold, getPartyGroups, getSkillTeachers, getPersonalSpendUpdate, getDowntimePayment, payDowntime } from "./payments.js";
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

function canEditDtp(app) {
  return globalThis.game?.user?.isGM === true && app?.isEditable !== false;
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
  const expected = getPersonalSpendUpdate(actor, entry);
  if (!expected) return false;
  const actual = flattenUpdate(change);
  if (actual._id === actor.id) delete actual._id;
  // Foundry injects the current subtype before preUpdateActor, even for flag-only updates.
  if (actual.type === actor.type) delete actual.type;
  return Object.keys(actual).length === Object.keys(expected).length
    && Object.entries(expected).every(([path, value]) => actual[path] === value);
}

async function spendDtp(actor, entry, options = {}) {
  return Boolean(await payDowntime(actor, entry, options));
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

function buildDowntimeBalance(actor, groupUuid = "") {
  const groups = getPartyGroups(actor);
  const group = groupUuid ? groups.find(group => group.uuid === groupUuid) : groups.length === 1 ? groups[0] : null;
  const party = group ? `<br>${escapeHtml(localize("partyBalance", { group: group.name, gold: getGold(group) ?? "?" }))}` : "";
  return `<strong>${escapeHtml(actor.name)}</strong> · ${getDtp(actor)} DTP · ${Number(actor.system?.coins?.gp) || 0} gp${party}`;
}

function buildSkillTeacherSelector(actor) {
  return `<label class="mk-dtp-ability">${escapeHtml(localize("skillTeacher"))}
    <select name="skillTeacher"${!canSpendDtp(actor) ? " disabled" : ""}>
      <option value="">${escapeHtml(localize("paidTrainer"))}</option>
      ${getSkillTeachers(actor).map(teacher => `<option value="${escapeHtml(teacher.uuid)}"${getDtp(teacher) < 1 ? " disabled" : ""}>${escapeHtml(localize("teacherOption", {
        teacher: teacher.name, dtp: getDtp(teacher)
      }))}</option>`).join("")}
    </select></label><p class="mk-dtp-note">${escapeHtml(localize("teachingRules"))}</p>`;
}

function downtimeCostLabel(actor, entry, groupUuid = "", teacherUuid = "") {
  const learning = entry.id === "skills-int-learn" && teacherUuid;
  const gold = getDowntimeGoldCost(actor, entry);
  const payment = getDowntimePayment(actor, entry, { groupUuid, teacherUuid: learning ? teacherUuid : "" });
  return (learning ? localize("teachingCost") : localize("cost", { gold: gold ?? "?" }))
    + (payment?.group ? ` · ${localize("partySource", { group: payment.group.name })}` : "")
    + (!payment ? ` · ${localize("insufficient")}` : "");
}

function refreshDowntimeMenu(actor, profile, form) {
  const groupUuid = form.elements.partyGroup?.value ?? "";
  const teacherUuid = form.elements.skillTeacher?.value ?? "";
  const teachers = new Map(getSkillTeachers(actor).map(teacher => [teacher.uuid, teacher]));
  for (const option of form.elements.skillTeacher?.options ?? []) {
    if (!option.value) continue;
    const teacher = teachers.get(option.value);
    option.disabled = !teacher || getDtp(teacher) < 1;
    option.textContent = teacher ? localize("teacherOption", { teacher: teacher.name, dtp: getDtp(teacher) }) : localize("teacherUnavailable");
  }
  const balance = form.querySelector(".mk-dtp-balance");
  if (balance) balance.innerHTML = buildDowntimeBalance(actor, groupUuid);
  for (const input of form.querySelectorAll('input[name="activity"]')) {
    const entry = getDowntimeOption(input.value);
    if (!entry) continue;
    const unavailable = !isDowntimeEligible(entry, profile) || !getDowntimePayment(actor, entry, {
      groupUuid, teacherUuid: entry.id === "skills-int-learn" ? teacherUuid : ""
    });
    input.disabled = !canSpendDtp(actor) || unavailable;
    if (input.disabled) input.checked = false;
    const row = input.closest(".mk-dtp-option");
    row.classList.toggle("is-unavailable", unavailable);
    row.querySelector("small").textContent = downtimeCostLabel(actor, entry, groupUuid, teacherUuid);
  }
}

function buildDowntimeMenu(actor, profile) {
  const canSpend = canSpendDtp(actor);
  const groups = getPartyGroups(actor);
  return `<div class="mk-dtp-menu">
    <p class="mk-dtp-balance">${buildDowntimeBalance(actor)}</p>
    ${groups.length > 1 ? `<label class="mk-dtp-ability">${escapeHtml(localize("partyGroup"))}
      <select name="partyGroup"><option value="">${escapeHtml(localize("chooseParty"))}</option>
        ${groups.map(group => `<option value="${escapeHtml(group.uuid)}">${escapeHtml(group.name)}</option>`).join("")}
      </select></label>` : ""}
    <p>${escapeHtml(localize("rules"))}</p>
    <p class="mk-dtp-note">${escapeHtml(localize("outcomes"))}</p>
    <details><summary>Carousing* <span>Tavern</span></summary>
      <label class="mk-dtp-option"><input type="radio" name="activity" value="carousing" required>
        <span><strong>Carousing*</strong><span>${escapeHtml(localize("carousingRules"))}</span></span>
      </label>
    </details>
    ${DOWNTIME_ACTIVITIES.map(activity => `<details>
      <summary>${escapeHtml(activity.title)} <span>${escapeHtml(activity.facility)}</span></summary>
      <p>${escapeHtml(activity.description)}</p>
      ${activity.id === "skills" ? buildSkillTeacherSelector(actor) : ""}
      ${activity.groups.map(group => {
        const entries = DOWNTIME_OPTIONS.filter(entry => entry.activity === activity && entry.group === group);
        const eligible = isDowntimeEligible(entries[0], profile);
        return `<section class="mk-dtp-group"><h4>${escapeHtml(group.label)}</h4>
          ${!eligible ? `<p class="mk-dtp-note">${escapeHtml(localize("classRequired"))}</p>` : ""}
          ${group.abilities.length > 1 ? `<label class="mk-dtp-ability">${escapeHtml(localize("ability"))}
            <select name="ability-${activity.id}-${group.id}">${group.abilities.map(ability => `<option value="${ability}">${ability.toUpperCase()}</option>`).join("")}</select></label>` : ""}
          ${entries.map(entry => {
            const affordable = Boolean(getDowntimePayment(actor, entry));
            return `<label class="mk-dtp-option${!eligible || !affordable ? " is-unavailable" : ""}">
              <input type="radio" name="activity" value="${entry.id}" required${!canSpend || !eligible || !affordable ? " disabled" : ""}>
              <span><strong>DC ${entry.dc}${entry.starred ? "*" : ""} · ${escapeHtml(entry.label)}</strong>
                <span>${escapeHtml(entry.description)}</span>
                <small>${escapeHtml(downtimeCostLabel(actor, entry))}</small></span>
            </label>`;
          }).join("")}</section>`;
      }).join("")}
    </details>`).join("")}
  </div>`;
}

async function performDowntime(actor, activityId, ability, { groupUuid = "", teacherUuid = "" } = {}) {
  const entry = getDowntimeOption(activityId);
  const key = actor?.uuid ?? actor?.id ?? actor;
  if (!canSpendDtp(actor) || !entry || !entry.group.abilities.includes(ability) || activeAttempts.has(key)) return false;
  activeAttempts.add(key);
  let paid = false;
  try {
    if (!isDowntimeEligible(entry, await getDowntimeProfile(actor))) return false;
    if (!getDowntimePayment(actor, entry, { groupUuid, teacherUuid })) {
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
    // Recheck current resources after the native prompt. Closing it never spends anything.
    const payment = await payDowntime(actor, entry, { groupUuid, teacherUuid });
    if (!payment) {
      globalThis.ui?.notifications?.warn?.(localize("insufficient"));
      return false;
    }
    const gold = payment.gold;
    paid = true;
    const success = roll.criticalSuccess === true
      || (roll.criticalFailure !== true && (roll.success ?? roll.total >= entry.dc));
    // Use the native roll template without the system roll-card reroll/luck controls.
    await roll.toMessage({
      speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }),
      flavor: `<div class="mk-dtp-result">
        <p class="mk-dtp-result-activity">${escapeHtml(entry.activity.title)}</p>
        <strong class="mk-dtp-result-title">${escapeHtml(entry.label)}</strong>
        <p class="mk-dtp-result-check"><strong>${escapeHtml(localize(success ? "success" : "failure"))}</strong><span>${ability.toUpperCase()} · DC ${entry.dc}</span></p>
        ${success ? `<p>${escapeHtml(entry.description)}</p>` : ""}
        <p class="mk-dtp-result-cost">${escapeHtml(localize(payment.teacherUuid ? "spentWithTeacher" : payment.groupUuid ? "spentFromParty" : gold > 0 ? "spentWithGold" : "spent", {
          gold, remaining: getDtp(actor), group: payment.groupName, teacher: payment.teacherName, teacherRemaining: payment.teacherRemaining
        }))}</p>
      </div>`,
      flags: { [MODULE_ID]: { downtime: {
        activityId: entry.id, dc: entry.dc, gold, success, groupUuid: payment.groupUuid, teacherUuid: payment.teacherUuid ?? null
      } } }
    }, { rollMode: config.rollMode });
    return true;
  } catch (error) {
    globalThis.ui?.notifications?.error?.(localize(error.partyPaymentReview ? "paymentReview" : paid ? "reportFailed" : "attemptFailed"));
    console.error(`${MODULE_ID} | DTP | attempt failed`, error);
    return false;
  } finally {
    activeAttempts.delete(key);
  }
}

async function openDowntimeMenu(actor) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (actor?.type !== "Player" || typeof DialogV2 !== "function") return;
  const profile = await getDowntimeProfile(actor);
  const dialog = new DialogV2({
    window: { title: localize("menuTitle") },
    position: { width: 720 },
    classes: ["mk-dtp-dialog"],
    form: { closeOnSubmit: false },
    content: buildDowntimeMenu(actor, profile),
    buttons: [
      { action: "attempt", label: localize("attempt"), icon: "fa-solid fa-dice-d20",
        disabled: !canSpendDtp(actor),
        callback: async (_event, button) => {
          const form = button.form;
          try {
            if (form.elements.activity?.value === "carousing") await openCarousingMenu(actor);
            else {
              const entry = getDowntimeOption(form.elements.activity?.value);
              if (!entry) return;
              const ability = form.elements[`ability-${entry.activity.id}-${entry.group.id}`]?.value ?? entry.group.abilities[0];
              await performDowntime(actor, entry.id, ability, {
                groupUuid: form.elements.partyGroup?.value ?? "",
                teacherUuid: entry.id === "skills-int-learn" ? form.elements.skillTeacher?.value ?? "" : ""
              });
            }
          } finally {
            // Update resources in place so expanded categories, choices and scroll stay intact.
            refreshDowntimeMenu(actor, profile, form);
          }
        } },
      { action: "cancel", label: localize("close"), type: "button", callback: (_event, _button, dialog) => dialog.close() }
    ]
  });
  dialog.addEventListener("render", () => {
    const form = dialog.element.querySelector("form");
    form.elements.partyGroup?.addEventListener("change", () => refreshDowntimeMenu(actor, profile, form));
    form.elements.skillTeacher?.addEventListener("change", () => refreshDowntimeMenu(actor, profile, form));
  });
  return dialog.render({ force: true });
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
