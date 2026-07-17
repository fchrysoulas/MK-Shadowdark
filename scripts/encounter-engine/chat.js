import { CARD_SELECTOR, CHAT_FLAG, MODULE_ID, SETTINGS } from "./constants.js";
import { activeGmIds, deepClone, error, escapeHtml, getProfile, getRootElement, setting } from "./helpers.js";
import {
  buildEncounterData,
  deriveDisposition,
  drawEncounterResult,
  evaluateRoll,
  rollMappedOutcome,
  rollMorale,
  rollSurprise,
  rollTotal,
} from "./resolver.js";

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

export function renderEncounterCard(data, { publicCard = false } = {}) {
  const periodLabel = data.period === "night" ? "Night" : "Day";
  const disposition = String(data.disposition ?? "neutral");
  const moraleDetail = data.morale?.immune
    ? "Does not make morale checks"
    : "2d6 equal to or below this score to hold";

  const controls = publicCard ? "" : `
    <div class="mk-sd-encounter-controls">
      <button type="button" data-action="reveal"><i class="fas fa-eye"></i> Reveal to Players</button>
      <button type="button" data-action="reroll-field" data-field="number"><i class="fas fa-users"></i> Reroll Number</button>
      <button type="button" data-action="reroll-field" data-field="encounter"><i class="fas fa-rotate"></i> Reroll Creature</button>
      <button type="button" data-action="reroll-all"><i class="fas fa-dice-d20"></i> Reroll All</button>
    </div>
  `;

  return `
    <section class="mk-sd-encounter-card ${publicCard ? "is-public" : "is-gm"}" data-encounter-schema="${Number(data.schema ?? 1)}">
      <header class="mk-sd-encounter-header">
        <div>
          <span class="mk-sd-encounter-kicker">Encounter</span>
          <h3>${encounterDisplay(data)}</h3>
        </div>
        <span class="mk-sd-encounter-disposition is-${escapeHtml(disposition)}">${escapeHtml(disposition)}</span>
      </header>

      <div class="mk-sd-encounter-context">
        <span><i class="fas fa-mountain-sun"></i> ${escapeHtml(data.terrain)}</span>
        <span><i class="fas ${data.period === "night" ? "fa-moon" : "fa-sun"}"></i> ${periodLabel}</span>
        <span><i class="fas fa-table-list"></i> ${escapeHtml(data.tableName)}</span>
      </div>

      <div class="mk-sd-encounter-grid">
        ${row("Distance", escapeHtml(data.distance?.label ?? "Unknown"), "distance", { publicCard })}
        ${row("Activity", escapeHtml(data.activity?.label ?? "Unknown"), "activity", { publicCard })}
        ${row("Reaction", escapeHtml(data.reaction?.label ?? "Unknown"), "reaction", { publicCard })}
        ${row("Intent", escapeHtml(data.intent?.label ?? "Unknown"), "intent", { publicCard })}
        ${row("Surprise", escapeHtml(data.surprise?.label ?? "Unknown"), "surprise", { publicCard })}
        ${publicCard ? "" : row("Morale", escapeHtml(data.morale?.label ?? "Unknown"), "morale", { publicCard, detail: moraleDetail })}
      </div>

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
    style: CONST?.CHAT_MESSAGE_STYLES?.OTHER ?? CONST?.CHAT_MESSAGE_TYPES?.OTHER ?? 0,
    content: renderEncounterCard(data),
    whisper,
    flags: { [MODULE_ID]: { [CHAT_FLAG]: data } },
  });
}

async function updateEncounterMessage(message, data) {
  await message.update({
    content: renderEncounterCard(data),
    [`flags.${MODULE_ID}.${CHAT_FLAG}`]: data,
  });
  return message;
}

async function revealEncounter(message, data) {
  return ChatMessage.create({
    speaker: message.speaker ?? ChatMessage.getSpeaker(),
    style: CONST?.CHAT_MESSAGE_STYLES?.OTHER ?? CONST?.CHAT_MESSAGE_TYPES?.OTHER ?? 0,
    content: renderEncounterCard(data, { publicCard: true }),
    whisper: [],
    flags: {
      [MODULE_ID]: {
        encounterEnginePublic: { sourceMessageId: message.id, schema: data.schema ?? 1 },
      },
    },
  });
}

export async function rerollEncounterField(message, field) {
  const data = deepClone(message.getFlag(MODULE_ID, CHAT_FLAG));
  if (!data) return null;

  const profileRef = getProfile(data.profileId);
  const profile = profileRef.data;

  switch (field) {
    case "encounter": {
      const draw = await drawEncounterResult(data.tableUuid, profile, data.period);
      data.encounter = draw.encounter;
      data.activity = data.encounter.metadata?.activity
        ? { label: String(data.encounter.metadata.activity), formula: "Encounter result", total: null }
        : await rollMappedOutcome(profile, "activity");
      data.intent = data.encounter.metadata?.intent
        ? { label: String(data.encounter.metadata.intent), formula: "Encounter result", total: null }
        : await rollMappedOutcome(profile, "intent");
      data.morale = await rollMorale(profile, data.encounter);
      break;
    }
    case "number": {
      const numberRoll = await evaluateRoll(data.encounter.numberFormula || "1", "Number Appearing");
      data.encounter.numberTotal = rollTotal(numberRoll, 1);
      data.encounter.count = Math.max(1, Math.floor(data.encounter.numberTotal));
      break;
    }
    case "distance":
    case "activity":
    case "reaction":
    case "intent":
      data[field] = await rollMappedOutcome(profile, field);
      if (field === "reaction") data.disposition = deriveDisposition(data.reaction);
      break;
    case "surprise":
      data.surprise = await rollSurprise(profile);
      break;
    case "morale":
      data.morale = await rollMorale(profile, data.encounter);
      break;
    default:
      return null;
  }

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
    requestedPeriod: oldData.requestedPeriod,
    period: oldData.period,
    tableUuid: oldData.tableUuid,
    tableName: oldData.tableName,
    draw,
  });

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
      const data = message.getFlag(MODULE_ID, CHAT_FLAG);

      if (action === "reveal") await revealEncounter(message, data);
      else if (action === "reroll-all") await rerollEntireEncounter(message);
      else if (action === "reroll-field") await rerollEncounterField(message, button.dataset.field);
    } catch (actionError) {
      error("Encounter chat action failed", actionError);
      ui.notifications.error(`Encounter action failed: ${actionError.message}`);
    } finally {
      button.disabled = false;
    }
  });
}
