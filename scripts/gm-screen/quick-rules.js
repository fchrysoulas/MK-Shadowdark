import {
  getExplorationTurnSeconds,
} from "../group-sheet/exploration-encounters.js";
import {
  REST_TOTAL_TURNS,
  REST_TURN_SECONDS,
} from "../group-sheet/rest-encounters.js";
import {
  normalizeDangerDefinition,
  resolveSceneEnvironmentContext,
} from "../libs/environment-context.js";
import { APP_ID } from "./gm-screen.js";

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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function durationLabel(seconds) {
  const total = Math.max(1, Math.floor(Number(seconds) || 1));
  if (total % 3600 === 0) {
    const hours = total / 3600;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  if (total % 60 === 0) {
    const minutes = total / 60;
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  return `${total} ${total === 1 ? "second" : "seconds"}`;
}

function rollResultsLabel(values = []) {
  const normalized = [...new Set((Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite))]
    .sort((left, right) => left - right);
  return normalized.length ? normalized.join(", ") : "—";
}

function rangeLabel(result) {
  const min = Number(result?.min);
  const max = Number(result?.max);
  const label = String(result?.label ?? "Result");

  if (!Number.isFinite(min) || !Number.isFinite(max)) return label;
  if (min <= -90) return `≤${max}: ${label}`;
  if (max >= 90) return `≥${min}: ${label}`;
  if (min === max) return `${min}: ${label}`;
  return `${min}–${max}: ${label}`;
}

function outcomeRule(profile, key, {
  enabled = true,
} = {}) {
  const source = profile?.outcomes?.[key] ?? null;
  const results = Array.isArray(source?.results) ? source.results : [];

  return {
    key,
    enabled: Boolean(enabled && source),
    formula: String(source?.formula ?? ""),
    summary: results.map(rangeLabel).join("; "),
  };
}

function dangerRules(profile) {
  return Object.keys(profile?.dangerLevels ?? {}).map(id => {
    const danger = normalizeDangerDefinition(profile, id);
    return {
      id,
      label: danger.label,
      interval: danger.interval,
      intervalUnit: danger.interval === 1 ? "turn" : "turns",
      formula: danger.formula,
      encounterOn: rollResultsLabel(danger.encounterOn),
    };
  });
}

function buildQuickRules(context = resolveSceneEnvironmentContext()) {
  const profile = context?.profile ?? {};
  const explorationSeconds = getExplorationTurnSeconds(context);
  const activeDanger = normalizeDangerDefinition(profile, context?.dangerLevel ?? profile.defaultDangerLevel ?? "unsafe");
  const optional = profile.optionalProcedures ?? {};
  const morale = profile.morale ?? {};

  return {
    terrain: String(context?.terrain ?? profile.defaultTerrain ?? "Default"),
    period: String(context?.period ?? "day"),
    exploration: {
      turnSeconds: explorationSeconds,
      turnLabel: durationLabel(explorationSeconds),
    },
    rest: {
      turnSeconds: REST_TURN_SECONDS,
      turnLabel: durationLabel(REST_TURN_SECONDS),
      totalTurns: REST_TOTAL_TURNS,
      totalLabel: durationLabel(REST_TURN_SECONDS * REST_TOTAL_TURNS),
    },
    dangers: dangerRules(profile),
    activeDanger: {
      label: activeDanger.label,
      interval: activeDanger.interval,
      intervalUnit: activeDanger.interval === 1 ? "turn" : "turns",
      formula: activeDanger.formula,
      encounterOn: rollResultsLabel(activeDanger.encounterOn),
    },
    distance: outcomeRule(profile, "distance"),
    activity: outcomeRule(profile, "activity"),
    reaction: outcomeRule(profile, "reaction"),
    intent: outcomeRule(profile, "intent", { enabled: optional.intent === true }),
    treasure: outcomeRule(profile, "treasure"),
    surprise: {
      enabled: optional.surpriseDice === true,
      formula: String(profile?.surprise?.formula ?? ""),
      surprisedOn: rollResultsLabel(profile?.surprise?.surprisedOn),
    },
    morale: {
      dc: Math.max(1, Math.floor(Number(morale.dc ?? 15) || 15)),
      ability: String(morale.ability ?? "wis").toUpperCase(),
    },
  };
}

function ruleLine(label, rule) {
  if (!rule?.enabled) return `<li><strong>${escapeHtml(label)}:</strong> disabled.</li>`;
  const formula = rule.formula ? `<strong>${escapeHtml(rule.formula)}</strong>` : "configured mapping";
  const summary = rule.summary ? ` · ${escapeHtml(rule.summary)}` : "";
  return `<li><strong>${escapeHtml(label)}:</strong> ${formula}${summary}</li>`;
}

function renderQuickRules(rules) {
  const dangerItems = rules.dangers.length
    ? rules.dangers.map(danger => `
      <li><strong>${escapeHtml(danger.label)}:</strong> every ${danger.interval} ${danger.intervalUnit} · ${escapeHtml(danger.formula)} · encounter on ${escapeHtml(danger.encounterOn)}</li>
    `).join("")
    : "<li>No danger levels are defined.</li>";

  return `
    <div class="mk-gm-panel-grid two-col" data-mk-gm-quick-rules>
      <article class="mk-gm-panel">
        <header><i class="fas fa-book"></i><span>Procedure Timing</span></header>
        <ul class="mk-gm-rules-list">
          <li><strong>Scene context:</strong> ${escapeHtml(rules.terrain)} · ${escapeHtml(rules.period)}</li>
          <li><strong>Exploration turn:</strong> ${escapeHtml(rules.exploration.turnLabel)}</li>
          <li><strong>Resting turn:</strong> ${escapeHtml(rules.rest.turnLabel)} · ${rules.rest.totalTurns} turns / ${escapeHtml(rules.rest.totalLabel)}</li>
        </ul>
      </article>

      <article class="mk-gm-panel">
        <header><i class="fas fa-skull-crossbones"></i><span>Danger / Encounter Checks</span></header>
        <ul class="mk-gm-rules-list">
          <li><strong>Active danger:</strong> ${escapeHtml(rules.activeDanger.label)} · every ${rules.activeDanger.interval} ${rules.activeDanger.intervalUnit} · ${escapeHtml(rules.activeDanger.formula)} · encounter on ${escapeHtml(rules.activeDanger.encounterOn)}</li>
          ${dangerItems}
        </ul>
      </article>

      <article class="mk-gm-panel">
        <header><i class="fas fa-dice-d20"></i><span>Active Encounter Outcomes</span></header>
        <ul class="mk-gm-rules-list">
          ${ruleLine("Distance", rules.distance)}
          ${ruleLine("Activity", rules.activity)}
          ${ruleLine("Reaction", rules.reaction)}
          ${ruleLine("Intent", rules.intent)}
          ${ruleLine("Treasure", rules.treasure)}
          <li><strong>Expanded surprise dice:</strong> ${rules.surprise.enabled ? `${escapeHtml(rules.surprise.formula)} · surprised on ${escapeHtml(rules.surprise.surprisedOn)}` : "disabled"}.</li>
        </ul>
      </article>

      <article class="mk-gm-panel">
        <header><i class="fas fa-shield-halved"></i><span>Fixed MK / Shadowdark Workflow</span></header>
        <ul class="mk-gm-rules-list">
          <li>Encounter intervals are measured in <strong>procedure turns</strong>.</li>
          <li>Morale check guidance: <strong>DC ${rules.morale.dc} ${escapeHtml(rules.morale.ability)}</strong>; group/solo threshold behavior is owned by Morale Automation.</li>
          <li>Encounter staging is <strong>preview-first</strong>; Scene documents are created only after Deploy.</li>
          <li>Rest encounter checks resolve <strong>before</strong> rest benefits.</li>
          <li>An encounter pauses an active rest; rations and benefits finalize only after successful completion.</li>
        </ul>
      </article>
    </div>
  `;
}

function injectQuickRules(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  const workspace = root?.querySelector?.('[data-workspace-panel="rules"]');
  if (!workspace) return false;

  const context = resolveSceneEnvironmentContext();
  workspace.innerHTML = renderQuickRules(buildQuickRules(context));
  return true;
}

function registerGmScreenQuickRules() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    injectQuickRules(application, element);
  });
}

registerGmScreenQuickRules();

export {
  gmScreenApplication,
  durationLabel,
  rollResultsLabel,
  rangeLabel,
  outcomeRule,
  dangerRules,
  buildQuickRules,
  renderQuickRules,
  injectQuickRules,
  registerGmScreenQuickRules,
};