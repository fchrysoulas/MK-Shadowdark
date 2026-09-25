import { resolveActorFromUuid } from "../group-sheet/actors.js";
import { getGroupData } from "../group-sheet/activities.js";
import { waitForGmDialog } from "../libs/dialog-v2.js";
import {
  parseLabeledResultText,
  rollImportedSourceTable,
  tableResultText,
} from "../source-tables/source-table-service.js";
import {
  getSceneMonsterGeneratorTables,
  MONSTER_GENERATOR_TABLE_KEYS,
  MONSTER_GENERATOR_TABLE_LABELS,
  monsterGeneratorTableStatus,
} from "./monster-generator-settings.js";
import { resolveGmScreenGroup } from "./view-model.js";
import { pinDocument } from "./pinned-documents.js";

const MODULE_ID = "mk-shadowdark";
const DEFAULT_MONSTER_NAME = "Generated Monster";
const DEFAULT_MONSTER_ATTACK_NAME = "Attack";
const MONSTER_ATTACK_DAMAGE_FORMULA = "1d8";
const MONSTER_ATTACK_COUNT_FORMULA = "1d4";
const MONSTER_ATTACK_RANGE = "close";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function dialogRoot(html) {
  if (html?.form?.querySelector) return html.form;
  if (html?.querySelector) return html;
  if (html?.[0]?.querySelector) return html[0];
  return null;
}

function dialogName(html) {
  const root = dialogRoot(html);
  const direct = root?.querySelector?.('[name="name"]')?.value;
  if (direct !== undefined) return String(direct ?? "").trim();
  return String(html?.find?.('[name="name"]')?.val?.() ?? "").trim();
}

function configuredDocumentClass(baseClass) {
  return baseClass?.implementation ?? baseClass ?? null;
}

function currentScene() {
  return globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null;
}

function currentGmScreenGroupUuid() {
  return String(
    globalThis.game?.modules?.get?.(MODULE_ID)?.api?.gmScreen?.application?.groupActorUuid
      ?? "",
  ).trim();
}

function normalizeLabel(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function numericValue(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerValue(value, fallback = 0, minimum = 0) {
  const number = numericValue(value);
  return number === null ? fallback : Math.max(minimum, Math.trunc(number));
}

function roundedPartyLevel(value) {
  const number = numericValue(value);
  return number === null ? 1 : Math.max(1, Math.round(number));
}

function monsterResultValue(draw, label) {
  const text = tableResultText(draw?.result ?? draw?.results?.[0]);
  const fields = parseLabeledResultText(text);
  const wanted = normalizeLabel(label);
  const match = Object.entries(fields).find(([field]) => normalizeLabel(field) === wanted);
  return String(match?.[1] ?? text).trim();
}

function monsterTableSource(table) {
  return {
    tableId: String(table?.id ?? table?._id ?? ""),
    tableUuid: String(table?.uuid ?? ""),
    tableName: String(table?.name ?? ""),
  };
}

function monsterCombatStats(combatResult, partyLevel) {
  const text = String(combatResult ?? "").trim();
  const explicitLevel = text.match(/\b(?:lv|level)\s*[:=]?\s*([+-]?\d+)/i);
  const signedValue = text.match(/(?:^|[^\d])([+-]\s*\d+)/);
  const anyValue = text.match(/-?\d+/);
  const combatValue = numericValue(
    (signedValue?.[1] ?? anyValue?.[0] ?? "").replace(/\s+/g, ""),
  ) ?? 0;
  const attackBonus = integerValue(combatValue, 0, 0);
  const level = integerValue(explicitLevel?.[1] ?? attackBonus, attackBonus, 0);
  const resolvedPartyLevel = roundedPartyLevel(partyLevel);

  return {
    partyLevel: resolvedPartyLevel,
    ac: resolvedPartyLevel + 10,
    attackBonus,
    level,
  };
}

function partyLevelSummary(value) {
  if (value && typeof value === "object") {
    const average = numericValue(value.average ?? value.value);
    if (average === null) return null;
    return {
      average,
      value: roundedPartyLevel(value.value ?? average),
      memberCount: integerValue(value.memberCount, 0, 0),
    };
  }

  const average = numericValue(value);
  if (average === null) return null;
  return {
    average,
    value: roundedPartyLevel(average),
    memberCount: 0,
  };
}

async function getActivePartyLevel({
  groupActor = null,
  groupActorUuid = currentGmScreenGroupUuid(),
  actors = globalThis.game?.actors,
  groupData = null,
  resolveGroup = resolveGmScreenGroup,
  resolveActor = resolveActorFromUuid,
} = {}) {
  const group = groupActor ?? (groupData ? null : await resolveGroup(groupActorUuid, actors));
  if (!group && !groupData) return null;

  const data = groupData ?? getGroupData(group);
  const activeMembers = Array.isArray(data?.activeMembers) ? data.activeMembers : [];
  const levels = [];

  for (const actorUuid of activeMembers) {
    const actor = await resolveActor(actorUuid);
    if (!actor || (actor.type && actor.type !== "Player")) continue;

    const level = numericValue(
      actor.system?.level?.value
        ?? actor.system?.details?.level?.value
        ?? actor.system?.details?.level,
    );
    if (level !== null) levels.push(level);
  }

  if (!levels.length) return null;

  const average = levels.reduce((total, level) => total + level, 0) / levels.length;
  return {
    average,
    value: roundedPartyLevel(average),
    memberCount: levels.length,
  };
}

function fallbackFormulaTotal(formula) {
  const match = String(formula ?? "").trim().match(/^(\d+)d(\d+)$/i);
  if (!match) return 1;

  const count = Math.max(1, Number(match[1]));
  const faces = Math.max(1, Number(match[2]));
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += Math.floor(Math.random() * faces) + 1;
  }
  return total;
}

async function rollMonsterFormula(formula, rollFormula = null) {
  if (typeof rollFormula === "function") {
    const value = await rollFormula(formula);
    const total = numericValue(value?.total ?? value);
    return integerValue(total, 1, 1);
  }

  const RollClass = globalThis.Roll ?? globalThis.foundry?.dice?.Roll;
  if (typeof RollClass === "function") {
    const roll = new RollClass(formula);
    const evaluated = await roll.evaluate({ async: true });
    return integerValue(evaluated?.total, 1, 1);
  }

  return fallbackFormulaTotal(formula);
}

async function rollMonsterTable(table, rollTable = rollImportedSourceTable) {
  const draw = await rollTable(table);
  return {
    roll: draw?.total ?? null,
    value: monsterResultValue(draw, ""),
    result: draw?.result ?? draw?.results?.[0] ?? null,
  };
}

async function rollMonsterFromSource({
  tables = globalThis.game?.tables,
  scene = currentScene(),
  status = null,
  partyLevel = null,
  rollTable = rollImportedSourceTable,
  rollFormula = null,
} = {}) {
  const source = status ?? monsterGeneratorTableStatus(getSceneMonsterGeneratorTables(scene), tables);
  if (!source.available) {
    return {
      mode: "missing-linked-tables",
      missing: [...source.missing],
      unavailable: [...source.unavailable],
    };
  }

  const resolvedPartyLevel = partyLevelSummary(partyLevel);
  if (!resolvedPartyLevel) {
    return { mode: "missing-active-party" };
  }

  const results = {};
  const rolls = {};
  const sources = {};
  for (const key of MONSTER_GENERATOR_TABLE_KEYS) {
    const table = source.tables[key];
    const draw = await rollTable(table);
    results[key] = String(monsterResultValue(draw, MONSTER_GENERATOR_TABLE_LABELS[key])).trim();
    rolls[key] = draw?.total ?? null;
    sources[key] = monsterTableSource(table);
  }

  const combat = monsterCombatStats(results.combat, resolvedPartyLevel.value);
  const attackCount = await rollMonsterFormula(MONSTER_ATTACK_COUNT_FORMULA, rollFormula);

  return {
    mode: "generated",
    sourceMode: "linked",
    name: DEFAULT_MONSTER_NAME,
    results,
    rolls,
    sources,
    sourceBookTitle: "Scene-linked RollTables",
    partyLevel: resolvedPartyLevel,
    combat,
    attackCount,
    attackCountFormula: MONSTER_ATTACK_COUNT_FORMULA,
    damageFormula: MONSTER_ATTACK_DAMAGE_FORMULA,
  };
}

function monsterGeneratorDialogContent(result) {
  const rows = MONSTER_GENERATOR_TABLE_KEYS.map(key => `
        <div><dt>${escapeHtml(MONSTER_GENERATOR_TABLE_LABELS[key])}</dt><dd>${escapeHtml(result?.results?.[key] || "Not available")}</dd></div>
  `).join("");
  const combat = result?.combat ?? {};
  return `
    <div class="mk-gm-create-document-form mk-gm-monster-generator-form">
      <div class="form-group">
        <label>Monster Name</label>
        <input type="text" name="name" value="${escapeHtml(result?.name || DEFAULT_MONSTER_NAME)}" required autofocus autocomplete="off">
      </div>
      <p class="mk-gm-secondary">Results generated from the linked Scene RollTables.</p>
      <dl class="mk-gm-data-list mk-gm-monster-stat-list">
        <div><dt>Party Level</dt><dd>${escapeHtml(result?.partyLevel?.average ?? combat.partyLevel ?? "Not available")}</dd></div>
        <div><dt>Armor Class</dt><dd>${escapeHtml(combat.ac ?? "Not available")}</dd></div>
        <div><dt>Level</dt><dd>${escapeHtml(combat.level ?? "Not available")}</dd></div>
        <div><dt>Attack Bonus</dt><dd>${escapeHtml(combat.attackBonus ?? "Not available")}</dd></div>
        <div><dt>Attacks</dt><dd>${escapeHtml(result?.attackCount ?? "Not available")} (${MONSTER_ATTACK_COUNT_FORMULA})</dd></div>
        <div><dt>Damage</dt><dd>${MONSTER_ATTACK_DAMAGE_FORMULA}</dd></div>
      </dl>
      <dl class="mk-gm-data-list">
        ${rows}
      </dl>
    </div>
  `;
}

async function promptForGeneratedMonster({
  rollMonster = rollMonsterFromSource,
  sourceStatus = null,
  partyLevel = null,
  tables = globalThis.game?.tables,
  scene = currentScene(),
  rollFormula = null,
} = {}) {
  let result = await rollMonster({
    status: sourceStatus,
    partyLevel,
    tables,
    scene,
    rollFormula,
  });
  if (!result || result.mode !== "generated") return result ?? { mode: "missing-linked-tables" };

  while (true) {
    const choice = await waitForGmDialog({
      title: "Create Shadowdark Monster NPC",
      content: monsterGeneratorDialogContent(result),
      buttons: [
        {
          action: "create",
          icon: '<i class="fas fa-user-plus"></i>',
          label: "Create",
          default: true,
          callback: (_event, button) => ({ action: "create", name: dialogName(button.form) }),
        },
        {
          action: "reroll",
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Roll Again",
          callback: () => ({ action: "reroll" }),
        },
        {
          action: "cancel",
          icon: '<i class="fas fa-xmark"></i>',
          label: "Cancel",
          callback: () => ({ action: "cancel" }),
        },
      ],
      close: () => ({ action: "cancel" }),
    });

    if (!choice || choice.action === "cancel") return null;
    if (choice.action === "reroll") {
      result = await rollMonster({
        status: sourceStatus,
        partyLevel,
        tables: globalThis.game?.tables ?? tables,
        scene,
        rollFormula,
      });
      if (!result || result.mode !== "generated") return result ?? { mode: "missing-linked-tables" };
      continue;
    }

    return {
      mode: "generated",
      result,
      name: String(choice.name ?? "").trim() || DEFAULT_MONSTER_NAME,
    };
  }
}

function monsterActorNotes(result, name) {
  const rows = MONSTER_GENERATOR_TABLE_KEYS.map(key => (
    `<li><strong>${escapeHtml(MONSTER_GENERATOR_TABLE_LABELS[key])}:</strong> ${escapeHtml(result?.results?.[key] || "Not available")}</li>`
  )).join("");
  const combat = result?.combat ?? {};
  const partyLevel = result?.partyLevel?.average ?? combat.partyLevel ?? "Not available";
  const attackCount = result?.attackCount ?? "Not available";

  return `
    <h2>${escapeHtml(name)}</h2>
    <p>Generated from the linked Scene RollTables.</p>
    <h2>Monster Statistics</h2>
    <ul>
      <li><strong>Party Level:</strong> ${escapeHtml(partyLevel)}</li>
      <li><strong>Armor Class:</strong> ${escapeHtml(combat.ac ?? "Not available")}</li>
      <li><strong>Level:</strong> ${escapeHtml(combat.level ?? "Not available")}</li>
      <li><strong>Attack Bonus:</strong> ${escapeHtml(combat.attackBonus ?? "Not available")}</li>
      <li><strong>Attacks:</strong> ${escapeHtml(attackCount)} (${MONSTER_ATTACK_COUNT_FORMULA})</li>
      <li><strong>Damage:</strong> ${MONSTER_ATTACK_DAMAGE_FORMULA}</li>
    </ul>
    <h2>Monster Traits</h2>
    <ul>${rows}</ul>
  `.trim();
}

function buildMonsterAttackData(result) {
  const combat = result?.combat ?? {};
  return {
    name: DEFAULT_MONSTER_ATTACK_NAME,
    type: "NPC Attack",
    system: {
      attackType: "physical",
      attack: {
        num: integerValue(result?.attackCount, 1, 1),
      },
      ranges: [MONSTER_ATTACK_RANGE],
      bonuses: {
        attackBonus: integerValue(combat.attackBonus, 0, 0),
        damageBonus: 0,
        critical: {
          failureThreshold: 1,
          multiplier: 2,
          successThreshold: 20,
        },
      },
      damage: {
        numDice: 1,
        value: MONSTER_ATTACK_DAMAGE_FORMULA,
        special: "",
      },
    },
  };
}

function buildMonsterActorData(options = {}, legacyResult = null) {
  const config = options && typeof options === "object" && !Array.isArray(options)
    ? options
    : { name: options, result: legacyResult };
  const resolvedName = String(config.name ?? "").trim() || DEFAULT_MONSTER_NAME;
  const result = config.result ?? {};
  const combat = result.combat ?? monsterCombatStats(result.results?.combat, result.partyLevel?.value ?? 1);

  return {
    name: resolvedName,
    type: "NPC",
    system: {
      attributes: {
        ac: { value: integerValue(combat.ac, 11, 0) },
      },
      level: { value: integerValue(combat.level, 0, 0) },
      notes: monsterActorNotes({ ...result, combat }, resolvedName),
    },
    items: [buildMonsterAttackData({ ...result, combat })],
  };
}

async function createMonsterActor({ name, result = null } = {}) {
  const ActorClass = configuredDocumentClass(globalThis.Actor);
  if (!ActorClass?.create) {
    globalThis.ui?.notifications?.error?.("Foundry Actor creation is unavailable.");
    return null;
  }

  const actor = await ActorClass.create(buildMonsterActorData({ name, result }));
  await pinDocument(actor);
  actor?.sheet?.render?.(true);
  return actor ?? null;
}

async function createSourceDrivenMonster({
  tables = globalThis.game?.tables,
  scene = currentScene(),
  groupActorUuid = currentGmScreenGroupUuid(),
  partyLevel = null,
  resolvePartyLevel = getActivePartyLevel,
  promptGenerated = promptForGeneratedMonster,
} = {}) {
  if (!globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can create Monsters.");
    return null;
  }

  const sourceStatus = monsterGeneratorTableStatus(getSceneMonsterGeneratorTables(scene), tables);
  if (!sourceStatus.available) {
    const missing = [...sourceStatus.missing, ...sourceStatus.unavailable];
    globalThis.ui?.notifications?.warn?.(
      `Assign all Monster Generator RollTables in GM Screen Settings${missing.length ? `: ${missing.join(", ")}` : "."}`,
    );
    return null;
  }

  const resolvedPartyLevel = partyLevelSummary(
    partyLevel ?? await resolvePartyLevel({ groupActorUuid }),
  );
  if (!resolvedPartyLevel) {
    globalThis.ui?.notifications?.warn?.(
      "Select a Group with active character members before creating a Monster.",
    );
    return null;
  }

  const generated = await promptGenerated({
    sourceStatus,
    partyLevel: resolvedPartyLevel,
    tables: globalThis.game?.tables ?? tables,
    scene,
  });
  if (!generated || generated.mode !== "generated") return null;
  return createMonsterActor({ name: generated.name, result: generated.result });
}

export {
  DEFAULT_MONSTER_NAME,
  DEFAULT_MONSTER_ATTACK_NAME,
  MONSTER_ATTACK_DAMAGE_FORMULA,
  MONSTER_ATTACK_COUNT_FORMULA,
  currentScene,
  currentGmScreenGroupUuid,
  escapeHtml,
  dialogRoot,
  dialogName,
  configuredDocumentClass,
  monsterResultValue,
  monsterCombatStats,
  partyLevelSummary,
  getActivePartyLevel,
  fallbackFormulaTotal,
  rollMonsterFormula,
  rollMonsterTable,
  rollMonsterFromSource,
  monsterGeneratorDialogContent,
  promptForGeneratedMonster,
  monsterActorNotes,
  buildMonsterAttackData,
  buildMonsterActorData,
  createMonsterActor,
  createSourceDrivenMonster,
};
