import { CARD_SELECTOR, CHAT_FLAG, MODULE_ID, SETTINGS } from "./constants.js";
import { activeGmIds, deepClone, error, escapeHtml, getProfile, getRootElement, setting } from "./helpers.js";
import {
  buildEncounterData,
  buildMoraleInfo,
  deriveDisposition,
  drawEncounterResult,
  evaluateRoll,
  rollMappedOutcome,
  rollOptionalSurprise,
  rollReaction,
  rollTotal,
  rollTreasure,
} from "./resolver.js";
import { openEncounterStagingDialog } from "./staging.js";

function encounterDisplay(data) {
  const encounter = data.encounter ?? {};
  const actorLink = encounter.actorUuid
    ? `<a class="content-link" data-uuid="${escapeHtml(encounter.actorUuid)}"><i class="fas fa-user"></i>${escapeHtml(encounter.label)}</a>`
    : escapeHtml(encounter.label ?? "Unknown Encounter");

  const formula = encounter.numberFormula && encounter.numberFormula !== String(encounter.count)
    ? `<span class="mk-sd-encounter-formula">${escapeHtml(encounter.numberFormula)}</span>`
    : "";

  return `<strong>${escapeHtml(encounter.count)}</strong> ${actorLink} ${formula}`;
}

function row(label, value, field, { publicCard = false, detail = "" } = {}) {
  const reroll = publicCard || !field
    ? ""
    : `<button type="button" class="mk-sd-encounter-icon-button" data-action="reroll-field" data-field="${escapeHtml(field)}" title="Reroll ${escapeHtml(label)}"><i class="fas fa-rotate"></i></button>`;

  return `
    <div class="mk-sd-encounter-row" data-field-row="${escapeHtml(field ?? "")}">
      <span class="mk-sd-encounter-label">${escapeHtml(label)}</span>
      <span class="mk-sd-encounter-value">${value}${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</span>
      ${reroll}
    </div>
  `;
}

function stagingSummary(data, { publicCard = false } = {}) {
  const staging = data?.staging;
  if (publicCard || !staging?.deployed) return "";

  return `
    <div class="mk-sd-encounter-context">
      <span><i class="fas fa-location-dot"></i> Staged ${escapeHtml(staging.count ?? 0)} in ${escapeHtml(staging.sceneName ?? "Scene")}</span>
      <span><i class="fas fa-people-group"></i> ${escapeHtml(staging.formation ?? "cluster")}</span>
      <span><i class="fas ${staging.hidden ? "fa-eye-slash" : "fa-eye"}"></i> ${staging.hidden ? "Hidden" : "Visible"}</span>
      ${staging.combat ? '<span><i class="fas fa-swords"></i> Added to Combat</span>' : ""}
    </div>
  `;
}

export function renderEncounterCard(data, { publicCard = false } = {}) {
  const periodLabel = data.period === "night" ? "Night" : "Day";
  const disposition = String(data.disposition ?? "neutral");
  const reactionDetail = data.reaction?.actorName
    ? `${data.reaction.actorName} ${Number(data.reaction.chaModifier ?? 0) >= 0 ? "+" : ""}${Number(data.reaction.chaModifier ?? 0)} CHA; presence revealed`
    : data.reaction?.fixed
      ? "Attitude already clear"
      : data.reaction?.skipped
        ? "GM determines attitude from the fiction"
        : "No CHA modifier";
  const moraleDetail = data.morale?.immune
    ? data.morale.trigger
    : `${data.morale?.trigger ?? "At half strength"}; ${Number(data.morale?.modifier ?? 0) >= 0 ? "+" : ""}${Number(data.morale?.modifier ?? 0)} ${String(data.morale?.ability ?? "wis").toUpperCase()}`;

  const controls = publicCard ? "" : `
    <div class="mk-sd-encounter-controls">
      <button type="button" data-action="stage"><i class="fas fa-location-dot"></i> ${data.staging?.deployed ? "Stage Again" : "Stage Encounter"}</button>
      <button type="button" data-action="reveal"><i class="fas fa-eye"></i> Reveal to Players</button>
      <button type="button" data-action="reroll-field" data-field="number"><i class="fas fa-users"></i> Reroll Number</button>
      <button type="button" data-action="reroll-field" data-field="encounter"><i class="fas fa-rotate"></i> Reroll Creature</button>
      <button type="button" data-action="reroll-all"><i class="fas fa-dice-d20"></i> Reroll All</button>
    </div>
  `;

  return `
    <section class="mk-sd-encounter-card ${publicCard ? "is-public" : "is-gm"}" data-encounter-schema="${Number(data.schema ?? 2)}">
      <header class="mk-sd-encounter-header">
        <div>
          <span class="mk-sd-encounter-kicker">Encounter</span>
          <h3>${encounterDisplay(data)}</h3>
        </div>
        <span class="mk-sd-encounter-disposition is-${escapeHtml(disposition)}">${escapeHtml(disposition)}</span>
      </header>

      <div class="mk-sd-encounter-context">
        <span><i class="fas fa-mountain-sun"></i> ${escapeHtml(data.terrain)}</span>
        <span><i class="fas fa-skull-crossbones"></i> ${escapeHtml(data.dangerLabel ?? data.dangerLevel ?? "Unsafe")}</span>
        <span><i class="fas ${data.period === "night" ? "fa-moon" : "fa-sun"}"></i> ${periodLabel}</span>
        <span><i class="fas fa-table-list"></i> ${escapeHtml(data.tableName)}</span>
      </div>

      <div class="mk-sd-encounter-grid">
        ${row("Distance", escapeHtml(data.distance?.label ?? "Unknown"), "distance", { publicCard })}
        ${row("Activity", escapeHtml(data.activity?.label ?? "Unknown"), "activity", { publicCard })}
        ${row("Awareness", escapeHtml(data.awareness?.label ?? "Determine during play"), data.awareness?.optional ? "awareness" : null, {
          publicCard,
          detail: data.awareness?.optional ? "Optional expanded surprise dice" : "Use the fiction, hiding and detection checks",
        })}
        ${row("Reaction", escapeHtml(data.reaction?.label ?? "Not determined"), "reaction", { publicCard, detail: reactionDetail })}
        ${data.intent ? row("Intent", escapeHtml(data.intent.label ?? "Unknown"), "intent", { publicCard, detail: "Optional expanded procedure" }) : ""}
        ${row("Treasure", escapeHtml(data.treasure?.label ?? "No treasure"), "treasure", { publicCard, detail: "50% chance for wandering encounters" })}
        ${publicCard ? "" : row("Morale", escapeHtml(data.morale?.label ?? "DC 15 WIS"), null, { publicCard, detail: moraleDetail })}
      </div>

      ${stagingSummary(data, { publicCard })}
      ${controls}

      <footer class="mk-sd-encounter-footer">
        ${escapeHtml(data.profileName)}${data.sceneName ? ` - ${escapeHtml(data.sceneName)}` : ""}
      </footer>
    </section>
  `;
}

export async function createEncounterMessage(data, options = {}) {
  const whisperSetting = options.whisper ?? setting(SETTINGS.whisper, true);
  const whisper = whisperSetting ? activeGmIds() : [];

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    style: globalThis.CONST?.CHAT_MESSAGE_STYLES?.OTHER ?? globalThis.CONST?.CHAT_MESSAGE_TYPES?.OTHER ?? 0,
    content: renderEncounterCard(data),
    whisper,
    flags: { [MODULE_ID]: { [CHAT_FLAG]: data } },
  });
}

export async function updateEncounterMessage(message, data) {
  if (!message?.update || !data) return null;
  await message.update({
    content: renderEncounterCard(data),
    [`flags.${MODULE_ID}.${CHAT_FLAG}`]: data,
  });
  return message;
}

export async function revealEncounterMessage(message, data = undefined) {
  if (!message) return null;
  const encounterData = data ?? message.getFlag?.(MODULE_ID, CHAT_FLAG);
  if (!encounterData) return null;

  return ChatMessage.create({
    speaker: message.speaker ?? ChatMessage.getSpeaker(),
    style: globalThis.CONST?.CHAT_MESSAGE_STYLES?.OTHER ?? globalThis.CONST?.CHAT_MESSAGE_TYPES?.OTHER ?? 0,
    content: renderEncounterCard(encounterData, { publicCard: true }),
    whisper: [],
    flags: {
      [MODULE_ID]: {
        encounterEnginePublic: { sourceMessageId: message.id, schema: encounterData.schema ?? 2 },
      },
    },
  });
}

export async function stageEncounterMessage(message) {
  if (!message) return null;
  const data = message.getFlag?.(MODULE_ID, CHAT_FLAG);
  if (!data) return null;

  const deployment = await openEncounterStagingDialog(data, {
    sourceMessageId: String(message.id ?? ""),
  });

  if (deployment?.deployed && deployment.summary) {
    const nextData = deepClone(data);
    nextData.staging = deepClone(deployment.summary);
    await updateEncounterMessage(message, nextData);
  }

  return deployment;
}

export async function rerollEncounterField(message, field) {
  const data = deepClone(message.getFlag(MODULE_ID, CHAT_FLAG));
  if (!data) return null;

  const profileRef = getProfile(data.profileId);
  const profile = profileRef.data;
  const options = data.resolutionOptions ?? {};

  switch (field) {
    case "encounter": {
      const draw = await drawEncounterResult(data.tableUuid, profile, data.period);
      const rebuilt = await buildEncounterData({
        profileId: profileRef.id,
        profile,
        terrain: data.terrain,
        dangerLevel: data.dangerLevel,
        requestedPeriod: data.requestedPeriod,
        period: data.period,
        tableUuid: data.tableUuid,
        tableName: data.tableName,
        draw,
        options,
      });
      rebuilt.groupContext = deepClone(data.groupContext ?? null);
      await updateEncounterMessage(message, rebuilt);
      return rebuilt;
    }
    case "number": {
      const numberRoll = await evaluateRoll(data.encounter.numberFormula || "1", "Number Appearing");
      data.encounter.numberTotal = rollTotal(numberRoll, 1);
      data.encounter.count = Math.max(1, Math.floor(data.encounter.numberTotal));
      data.morale = await buildMoraleInfo(profile, data.encounter);
      break;
    }
    case "distance":
    case "activity":
    case "intent":
      data[field] = await rollMappedOutcome(profile, field);
      break;
    case "reaction":
      data.reaction = await rollReaction(profile, data.encounter, options);
      data.disposition = deriveDisposition(data.reaction);
      break;
    case "treasure":
      data.treasure = await rollTreasure(profile, data.encounter);
      break;
    case "awareness":
      if (!profile.optionalProcedures?.surpriseDice) return null;
      data.awareness = await rollOptionalSurprise(profile);
      break;
    default:
      return null;
  }

  delete data.staging;
  data.generatedAt = Date.now();
  await updateEncounterMessage(message, data);
  return data;
}

export async function rerollEntireEncounter(message) {
  const oldData = message.getFlag(MODULE_ID, CHAT_FLAG);
  if (!oldData) return null;

  const profileRef = getProfile(oldData.profileId);
  const profile = profileRef.data;
  const draw = await drawEncounterResult(oldData.tableUuid, profile, oldData.period);
  const data = await buildEncounterData({
    profileId: profileRef.id,
    profile,
    terrain: oldData.terrain,
    dangerLevel: oldData.dangerLevel,
    requestedPeriod: oldData.requestedPeriod,
    period: oldData.period,
    tableUuid: oldData.tableUuid,
    tableName: oldData.tableName,
    draw,
    options: oldData.resolutionOptions ?? {},
  });
  data.groupContext = deepClone(oldData.groupContext ?? null);

  await updateEncounterMessage(message, data);
  return data;
}

function messageFromApp(app) {
  return app?.document ?? app?.message ?? game.messages?.get(app?.id) ?? null;
}

export function bindEncounterCard(app, html) {
  const message = messageFromApp(app);
  if (!message || !message.getFlag(MODULE_ID, CHAT_FLAG)) return;

  const root = getRootElement(html);
  const card = root?.querySelector(CARD_SELECTOR);
  if (!card || card.dataset.mkBound === "true") return;
  card.dataset.mkBound = "true";

  card.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button || !card.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();

    if (!game.user?.isGM) return;
    button.disabled = true;

    try {
      const action = button.dataset.action;

      if (action === "reveal") await revealEncounterMessage(message);
      else if (action === "reroll-all") await rerollEntireEncounter(message);
      else if (action === "reroll-field") await rerollEncounterField(message, button.dataset.field);
      else if (action === "stage") await stageEncounterMessage(message);
    } catch (actionError) {
      error("Encounter chat action failed", actionError);
      ui.notifications.error(`Encounter action failed: ${actionError.message}`);
    } finally {
      button.disabled = false;
    }
  });
}
