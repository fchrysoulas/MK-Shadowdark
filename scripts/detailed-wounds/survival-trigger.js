import { confirmGmDialog } from "../libs/dialog-v2.js";
import { isPlayerAtZeroCon } from "../death-timer/con-death.js";
import {
  ENDURING_WOUNDS_FAILURE,
  drawEnduringWound
} from "./enduring-wounds.js";
import {
  SURVIVAL_WOUND_PROFILES,
  normalizeSurvivalWoundProfile,
  survivalWoundProfileEnabled,
  survivalWoundProfileLabel
} from "./survival-profile-core.js";
import {
  SURVIVAL_TRIGGER_MODES,
  SURVIVAL_WOUND_DC,
  getConModifier,
  survivalTriggerAction
} from "./survival-trigger-core.js";

const MODULE_ID = "mk-shadowdark";
const SUBMODULE = "Detailed Wounds Survival";
const SETTING_ENABLED = "detailedWoundsEnabled";
const SETTING_PROFILE = "detailedWoundsSurvivalProfile";
const SETTING_TRIGGER = "detailedWoundsSurvivalTrigger";
const SETTING_ENDURING_TABLE = "enduringWoundsTableUuid";
const DEATH_TIMER_STATUS_ID = "mk-death-timer";
const pendingActors = new WeakSet();

function isPlayerActor(actor) {
  return actor?.documentName === "Actor" && actor.type === "Player";
}

function getSetting(key, fallback) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (_error) {
    return fallback;
  }
}

function getPrimaryActiveGM() {
  return game.users
    ?.filter(user => user.active && user.isGM)
    ?.sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

function isPrimaryActiveGM() {
  const gm = getPrimaryActiveGM();
  return Boolean(gm && game.user?.id === gm.id);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getProperty(object, path) {
  if (object && Object.prototype.hasOwnProperty.call(object, path)) return object[path];
  return globalThis.foundry?.utils?.getProperty?.(object, path);
}

function getHpValue(actor) {
  const paths = [
    "system.attributes.hp.value",
    "system.attributes.hp.current",
    "system.hp.value",
    "system.hp.current",
    "system.hp"
  ];

  for (const path of paths) {
    const value = numberOrNull(getProperty(actor, path));
    if (value !== null) return value;
  }
  return null;
}

function getChangedHpValue(change) {
  const paths = [
    "system.attributes.hp.value",
    "system.attributes.hp.current",
    "system.hp.value",
    "system.hp.current",
    "system.hp"
  ];

  for (const path of paths) {
    const value = numberOrNull(getProperty(change, path));
    if (value !== null) return value;
  }
  return null;
}

function effectHasStatus(effect, statusId) {
  if (effect?.statuses?.has?.(statusId)) return true;
  if (Array.isArray(effect?.statuses) && effect.statuses.includes(statusId)) return true;
  if (effect?.getFlag?.("core", "statusId") === statusId) return true;
  return effect?.flags?.core?.statusId === statusId;
}

function hasDeathTimerState(actor) {
  if (actor?.getFlag?.(MODULE_ID, "deathTimer")) return true;
  return Array.from(actor?.effects ?? []).some(effect => (
    effect?.getFlag?.(MODULE_ID, "isDeathTimer") === true
    || effectHasStatus(effect, DEATH_TIMER_STATUS_ID)
    || (typeof effect?.name === "string" && effect.name.startsWith("Death Timer ("))
  ));
}

function hasDeadState(actor) {
  return Array.from(actor?.effects ?? []).some(effect => (
    effectHasStatus(effect, "dead")
    || effect?.getFlag?.(MODULE_ID, "isDeadCondition") === true
    || String(effect?.name ?? "").toUpperCase() === "DEAD"
  ));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForResolvedSurvival(actor, attempts = 40, delayMs = 25) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const hp = getHpValue(actor);
    if (
      hp !== null
      && hp > 0
      && !isPlayerAtZeroCon(actor)
      && !hasDeathTimerState(actor)
      && !hasDeadState(actor)
    ) return true;
    await sleep(delayMs);
  }
  return false;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function getSurvivalProfile() {
  return normalizeSurvivalWoundProfile(
    getSetting(SETTING_PROFILE, SURVIVAL_WOUND_PROFILES.MK_DETAILED_WOUNDS)
  );
}

async function confirmSurvivalCheck(actor, profile) {
  const profileLabel = survivalWoundProfileLabel(profile);
  const confirmed = await confirmGmDialog({
    title: `${profileLabel} - Survived 0 HP`,
    content: `<p><strong>${escapeHtml(actor.name)}</strong> survived the dying state. Roll a DC ${SURVIVAL_WOUND_DC} CON check for an enduring wound?</p>`,
    yes: { label: "Roll CON" },
    no: { label: "Skip" }
  });
  return confirmed === true;
}

async function rollSurvivalCheck(actor) {
  const modifier = getConModifier(actor);
  const roll = new Roll("1d20 + @con", { con: modifier });
  await roll.evaluate();

  const total = Number(roll.total) || 0;
  const success = total >= SURVIVAL_WOUND_DC;
  const publicMode = globalThis.CONST?.DICE_ROLL_MODES?.PUBLIC ?? "publicroll";
  await roll.toMessage(
    {
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `Enduring Wound Check: ${escapeHtml(actor.name)} rolls CON ${total} vs DC ${SURVIVAL_WOUND_DC} - ${success ? "Success" : "Failure"}`
    },
    { rollMode: publicMode }
  );

  return { roll, total, success };
}

function notifyEnduringFailure(actor, reason) {
  let message = `Enduring Wounds could not draw a result for ${actor.name}.`;
  if (reason === ENDURING_WOUNDS_FAILURE.MISSING_TABLE) {
    message = "Configure an Enduring Wounds RollTable UUID before using the Enduring Wounds profile.";
  } else if (reason === ENDURING_WOUNDS_FAILURE.INVALID_TABLE) {
    message = "The configured Enduring Wounds UUID does not resolve to a valid RollTable.";
  } else if (reason === ENDURING_WOUNDS_FAILURE.EMPTY_TABLE) {
    message = "The configured Enduring Wounds RollTable returned no result.";
  }
  ui.notifications?.warn?.(message);
}

async function resolveFailedSurvival(actor, profile) {
  if (profile === SURVIVAL_WOUND_PROFILES.ENDURING_WOUNDS_ROLLTABLE) {
    const result = await drawEnduringWound(getSetting(SETTING_ENDURING_TABLE, ""));
    if (result.reason) notifyEnduringFailure(actor, result.reason);
    return {
      profile,
      type: "rolltable",
      result
    };
  }

  const wound = await game.modules.get(MODULE_ID)?.api?.wounds?.rollRandom?.(actor) ?? null;
  if (!wound) {
    ui.notifications?.warn?.(`Detailed Wounds could not apply a random wound to ${actor.name}.`);
  }
  return {
    profile,
    type: "mk-detailed-wounds",
    result: wound
  };
}

async function resolveSurvivalTrigger(actor) {
  const profile = getSurvivalProfile();
  const enabled = survivalWoundProfileEnabled(profile, {
    detailedWoundsEnabled: getSetting(SETTING_ENABLED, true)
  });
  const action = survivalTriggerAction({
    enabled,
    mode: getSetting(SETTING_TRIGGER, SURVIVAL_TRIGGER_MODES.PROMPT),
    wasDying: true,
    zeroCon: isPlayerAtZeroCon(actor),
    hp: getHpValue(actor),
    isGm: isPrimaryActiveGM()
  });

  if (action === "none") return { triggered: false, action, profile };
  if (action === "prompt" && !(await confirmSurvivalCheck(actor, profile))) {
    return { triggered: false, action, profile, skipped: true };
  }

  const check = await rollSurvivalCheck(actor);
  const resolution = check.success
    ? null
    : await resolveFailedSurvival(actor, profile);

  return { triggered: true, action, profile, check, resolution };
}

async function processSurvival(actor) {
  if (pendingActors.has(actor)) return;
  pendingActors.add(actor);
  try {
    const resolved = await waitForResolvedSurvival(actor);
    if (!resolved) return;
    await resolveSurvivalTrigger(actor);
  } catch (error) {
    console.error(`${MODULE_ID} | ${SUBMODULE} | survival trigger error`, actor?.name, error);
  } finally {
    pendingActors.delete(actor);
  }
}

Hooks.on("updateActor", (actor, change) => {
  if (game.system?.id !== "shadowdark" || !isPlayerActor(actor) || !isPrimaryActiveGM()) return;

  const changedHp = getChangedHpValue(change);
  if (changedHp === null || changedHp <= 0) return;

  // This module is loaded before Death Timer, so its update hook sees the
  // still-active dying state before Death Timer clears it on the same HP update.
  if (!hasDeathTimerState(actor)) return;

  void processSurvival(actor);
});

export {
  getChangedHpValue,
  getHpValue,
  getSurvivalProfile,
  hasDeathTimerState,
  notifyEnduringFailure,
  resolveFailedSurvival,
  resolveSurvivalTrigger,
  waitForResolvedSurvival
};
