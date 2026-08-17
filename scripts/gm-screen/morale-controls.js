import { PREDEFINED_EFFECT_KEYS } from "../libs/predefined-effects.js";
import { APP_ID, refreshGmScreen } from "./gm-screen.js";

const MODULE_ID = "mk-shadowdark";
const FLEEING_STATUS_ID = "mk-shadowdark-fleeing";

function gmScreenApplication(application) {
  return Boolean(
    application
    && (
      application.id === APP_ID
      || application.options?.id === APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === APP_ID
    )
  );
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return [...collection.values()];
  return [];
}

function moraleApi() {
  return globalThis.game?.modules?.get?.(MODULE_ID)?.api?.morale ?? null;
}

function isNpc(actor) {
  return String(actor?.type ?? "").toLowerCase() === "npc";
}

function isHostile(combatant) {
  if (!combatant || !isNpc(combatant.actor)) return false;
  const hostile = Number(globalThis.CONST?.TOKEN_DISPOSITIONS?.HOSTILE ?? -1);
  const disposition = Number(combatant.token?.disposition);
  return Number.isFinite(disposition) ? disposition === hostile : true;
}

function defeated(combatant) {
  if (!combatant) return true;
  if (combatant.defeated === true || combatant.isDefeated === true) return true;
  const hp = Number(combatant.actor?.system?.attributes?.hp?.value);
  return Number.isFinite(hp) && hp <= 0;
}

function tokenMoraleData(token) {
  try {
    return token?.getFlag?.(MODULE_ID, "morale") ?? {};
  } catch (_error) {
    return token?.flags?.[MODULE_ID]?.morale ?? {};
  }
}

function moraleImmune(actor) {
  try {
    const flag = actor?.getFlag?.(MODULE_ID, "encounter.moraleImmune");
    if (flag !== undefined) return flag === true;
  } catch (_error) {
    // Fall through to prepared/source data.
  }

  return actor?.flags?.[MODULE_ID]?.encounter?.moraleImmune === true
    || actor?.system?.[PREDEFINED_EFFECT_KEYS.MORALE_IMMUNE] === true;
}

function effectStatuses(effect) {
  if (effect?.statuses instanceof Set) return [...effect.statuses].map(String);
  if (Array.isArray(effect?.statuses)) return effect.statuses.map(String);
  const id = effect?.flags?.core?.statusId;
  return id ? [String(id)] : [];
}

function fleeing(actor) {
  return collectionValues(actor?.effects).some(effect => (
    effect?.disabled !== true
    && effect?.isSuppressed !== true
    && effectStatuses(effect).includes(FLEEING_STATUS_ID)
  ));
}

function combatantMoraleView(combatant) {
  return {
    id: String(combatant?.id ?? ""),
    name: String(combatant?.name ?? combatant?.actor?.name ?? "Enemy"),
    token: combatant?.token ?? null,
    leader: tokenMoraleData(combatant?.token).leader === true,
    immune: moraleImmune(combatant?.actor),
    fleeing: fleeing(combatant?.actor),
    defeated: defeated(combatant),
  };
}

function resultSummary(result) {
  if (!result) return "Not resolved";
  if (result.mode === "none") return "Resolved · no morale-eligible survivors";

  const entries = Array.isArray(result.entries) ? result.entries : [];
  const failed = entries.filter(entry => entry.success === false).length;
  if (result.mode === "leader") {
    const entry = entries[0];
    if (!entry) return "Leader check resolved";
    return `Leader ${entry.name}: ${entry.total} · ${entry.success ? "held" : "failed"}`;
  }
  if (result.mode === "individual") {
    return `${entries.length - failed} held · ${failed} failed`;
  }
  return "Resolved";
}

function buildMoraleView(combat = globalThis.game?.combat) {
  const api = moraleApi();
  if (!combat || !api) {
    return {
      available: false,
      members: [],
      leader: null,
      immune: [],
      fleeing: [],
      state: null,
      resultLabel: "Unavailable",
      thresholdLabel: "—",
    };
  }

  const members = collectionValues(combat.combatants)
    .filter(isHostile)
    .map(combatantMoraleView);
  const state = typeof api.getState === "function" ? api.getState(combat) : null;
  const force = state?.force ?? null;
  const living = members.filter(member => !member.defeated);
  const leader = living.find(member => member.leader) ?? null;
  const immune = living.filter(member => member.immune);
  const fleeingMembers = living.filter(member => member.fleeing);
  const threshold = force?.threshold;
  const thresholdReached = Boolean(
    force
    && force.checked !== true
    && Number(force.initialCount ?? 0) > 1
    && living.length > 0
    && Number.isFinite(Number(threshold))
    && living.length <= Number(threshold)
  );

  return {
    available: true,
    members,
    living,
    leader,
    immune,
    fleeing: fleeingMembers,
    state,
    initialCount: Number(force?.initialCount ?? members.length),
    livingCount: living.length,
    checked: Boolean(force?.checked),
    threshold,
    thresholdReached,
    enemyTurnStart: typeof api.isEnemyTurnStart === "function" ? Boolean(api.isEnemyTurnStart(combat)) : false,
    resultLabel: resultSummary(force?.result),
    thresholdLabel: Number(force?.initialCount ?? 0) <= 1
      ? "Half HP (solo)"
      : Number.isFinite(Number(threshold)) ? `${threshold} enemies` : "—",
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function names(entries) {
  return entries.length ? entries.map(entry => entry.name).join(", ") : "None";
}

function renderMoraleDetails(view) {
  return `
    <dl class="mk-gm-data-list" data-mk-gm-morale-details>
      <div><dt>Enemy Force</dt><dd>${view.livingCount}/${view.initialCount} living</dd></div>
      <div><dt>Threshold</dt><dd>${escapeHtml(view.thresholdLabel)}${view.thresholdReached ? " · reached" : ""}</dd></div>
      <div><dt>Morale Leader</dt><dd>${escapeHtml(view.leader?.name ?? "None")}</dd></div>
      <div><dt>Immune</dt><dd>${escapeHtml(names(view.immune))}</dd></div>
      <div><dt>Fleeing</dt><dd>${escapeHtml(names(view.fleeing))}</dd></div>
      <div><dt>Status</dt><dd>${view.checked ? "Resolved" : "Watching"}${view.enemyTurnStart ? " · enemy turn start" : ""}</dd></div>
      <div><dt>Result</dt><dd>${escapeHtml(view.resultLabel)}</dd></div>
    </dl>
  `;
}

function leaderOptions(view) {
  return view.living
    .filter(member => !member.immune)
    .map(member => `<option value="${escapeHtml(member.id)}" ${member.leader ? "selected" : ""}>${escapeHtml(member.name)}</option>`)
    .join("");
}

async function chooseLeader(view, combat) {
  const api = moraleApi();
  if (!api?.setLeader) return null;
  const eligible = view.living.filter(member => !member.immune);
  if (!eligible.length) {
    globalThis.ui?.notifications?.warn?.("No living morale-eligible hostile combatants are available.");
    return null;
  }

  const value = await Dialog.wait({
    title: "Morale Leader",
    content: `
      <form>
        <div class="form-group">
          <label>Leader</label>
          <select name="leader">${leaderOptions(view)}</select>
        </div>
        <p class="hint">Only one hostile morale leader is active at a time.</p>
      </form>
    `,
    buttons: {
      set: {
        icon: '<i class="fas fa-crown"></i>',
        label: "Set Leader",
        callback: html => html?.querySelector?.('[name="leader"]')?.value
          ?? html?.[0]?.querySelector?.('[name="leader"]')?.value
          ?? html?.find?.('[name="leader"]')?.val?.()
          ?? null,
      },
      cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => null },
    },
    default: "set",
    close: () => null,
  });
  if (!value) return null;

  const combatant = combat.combatants?.get?.(value)
    ?? collectionValues(combat.combatants).find(entry => String(entry?.id ?? "") === String(value));
  if (!combatant?.token) return null;
  return api.setLeader(combatant.token, true);
}

async function clearLeader(view) {
  const api = moraleApi();
  if (!view.leader?.token || !api?.setLeader) return null;
  return api.setLeader(view.leader.token, false);
}

async function evaluateMorale(combat) {
  const api = moraleApi();
  if (!api?.evaluate) return null;
  const result = await api.evaluate(combat);
  if (!result) {
    globalThis.ui?.notifications?.info?.("No morale check is due, or morale has already been resolved.");
  }
  return result;
}

async function resetMorale(combat) {
  const api = moraleApi();
  if (!api?.reset) return null;
  const confirmed = await Dialog.confirm({
    title: "Reset Morale State",
    content: "<p>Re-snapshot the hostile force for this Combat? Use this only for GM correction; it resets the morale threshold/check state.</p>",
    yes: () => true,
    no: () => false,
    defaultYes: false,
  });
  if (!confirmed) return null;
  return api.reset(combat);
}

function ensureActions(panel) {
  let actions = panel.querySelector(":scope > .mk-gm-panel-actions");
  if (actions) return actions;
  actions = document.createElement("div");
  actions.className = "mk-gm-panel-actions";
  panel.append(actions);
  return actions;
}

function actionButton(action, label, icon) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.mkMoraleAction = action;
  button.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
  return button;
}

async function decorateMoralePanel(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  const combat = globalThis.game?.combat ?? null;
  if (!root || !combat) return false;

  const panel = root.querySelector('[data-workspace-panel="combat"] .mk-gm-panel');
  if (!panel) return false;

  const view = buildMoraleView(combat);
  panel.querySelector("[data-mk-gm-morale-details]")?.remove();
  const holder = document.createElement("div");
  holder.innerHTML = renderMoraleDetails(view);
  const details = holder.firstElementChild;
  const actions = ensureActions(panel);
  if (details) panel.insertBefore(details, actions);

  panel.querySelectorAll("[data-mk-morale-action]").forEach(button => button.remove());
  const buttons = [
    actionButton("leader", view.leader ? "Change Leader" : "Set Leader", "fa-crown"),
    actionButton("evaluate", "Evaluate Morale Now", "fa-dice-d20"),
    actionButton("reset", "Reset Morale", "fa-arrow-rotate-left"),
  ];
  if (view.leader) buttons.splice(1, 0, actionButton("clear-leader", "Clear Leader", "fa-crown"));

  for (const button of buttons) {
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        const current = buildMoraleView(combat);
        const action = button.dataset.mkMoraleAction;
        if (action === "leader") await chooseLeader(current, combat);
        else if (action === "clear-leader") await clearLeader(current);
        else if (action === "evaluate") await evaluateMorale(combat);
        else if (action === "reset") await resetMorale(combat);
        await application.render({ force: true });
      } catch (error) {
        console.error("mk-shadowdark | GM Screen Morale | Action failed", error);
        globalThis.ui?.notifications?.error?.(`Morale action failed: ${error.message}`);
      } finally {
        button.disabled = false;
      }
    });
    actions.prepend(button);
  }

  return true;
}

function combatContainsToken(tokenDocument, combat = globalThis.game?.combat) {
  const tokenId = String(tokenDocument?.id ?? "");
  if (!tokenId || !combat) return false;
  return collectionValues(combat.combatants).some(combatant => String(combatant?.token?.id ?? combatant?.tokenId ?? "") === tokenId);
}

function registerGmScreenMoraleControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    void decorateMoralePanel(application, element);
  });

  globalThis.Hooks?.on?.("updateToken", tokenDocument => {
    if (combatContainsToken(tokenDocument)) refreshGmScreen();
  });
}

registerGmScreenMoraleControls();

export {
  FLEEING_STATUS_ID,
  gmScreenApplication,
  tokenMoraleData,
  moraleImmune,
  fleeing,
  combatantMoraleView,
  resultSummary,
  buildMoraleView,
  renderMoraleDetails,
  combatContainsToken,
  decorateMoralePanel,
  registerGmScreenMoraleControls,
};
