import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/detailed-wounds/detailed-wounds.js";
let source = await readFile(path, "utf8");

function replaceExact(from, to, label) {
  if (!source.includes(from)) throw new Error(`Expected Detailed Wounds block not found: ${label}`);
  source = source.replace(from, to);
}

replaceExact(
'import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";\n',
`import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";\nimport {\n  WOUND_MIGRATION_VERSION,\n  migrateLegacyWoundData,\n  normalizeCurrentWoundData\n} from "./detailed-wounds-migration.js";\n`,
"migration imports"
);

replaceExact(
`  const SETTING_ENABLED = "detailedWoundsEnabled";\n  const FLAG_KEY = "detailedWounds";\n`,
`  const SETTING_ENABLED = "detailedWoundsEnabled";\n  const SETTING_MIGRATION_VERSION = "detailedWoundsMigrationVersion";\n  const FLAG_KEY = "detailedWounds";\n`,
"migration setting key"
);

replaceExact(
`    if (!game.settings.settings.has(\`${"${MODULE_ID}"}.${"${SETTING_ENABLED}"}\`)) {\n      game.settings.register(MODULE_ID, SETTING_ENABLED, {\n        name: "Detailed Wounds | Enabled",\n        hint: "Adds a Wounds tab to Shadowdark player character sheets for tracking body-location status.",\n        scope: "world",\n        config: true,\n        type: Boolean,\n        default: true,\n        onChange: refreshOpenActorSheets\n      });\n    }\n\n    log("initialized");\n`,
`    if (!game.settings.settings.has(\`${"${MODULE_ID}"}.${"${SETTING_ENABLED}"}\`)) {\n      game.settings.register(MODULE_ID, SETTING_ENABLED, {\n        name: "Detailed Wounds | Enabled",\n        hint: "Adds a Wounds tab to Shadowdark player character sheets for tracking body-location status.",\n        scope: "world",\n        config: true,\n        type: Boolean,\n        default: true,\n        onChange: refreshOpenActorSheets\n      });\n    }\n\n    if (!game.settings.settings.has(\`${"${MODULE_ID}"}.${"${SETTING_MIGRATION_VERSION}"}\`)) {\n      game.settings.register(MODULE_ID, SETTING_MIGRATION_VERSION, {\n        name: "Detailed Wounds Migration Version",\n        scope: "world",\n        config: false,\n        type: Number,\n        default: 0\n      });\n    }\n\n    log("initialized");\n`,
"hidden migration setting registration"
);

replaceExact(
`        flavor: \`Random Wound: ${"${escapeHtml(actor.name)}"} — ${"${locationRoll}"}. ${"${escapeHtml(location.label)}"} / ${"${severity.label}"} (severity ${"${severityResult}"})\`\n`,
`        flavor: \`Random Wound: ${"${escapeHtml(actor.name)}"} - ${"${locationRoll}"}. ${"${escapeHtml(location.label)}"} / ${"${severity.label}"} (severity ${"${severityResult}"})\`\n`,
"module-generated em dash"
);

replaceExact(
`  function normalizeData(raw) {\n    const source = foundry.utils.deepClone(raw ?? {});\n    const data = { version: 2, locations: {} };\n\n    for (const location of LOCATIONS) {\n      data.locations[location.key] = normalizeLocation(source.locations?.[location.key]);\n    }\n\n    // Version 1 had a separate abdomen location. Preserve its most serious\n    // status when migrating to the consolidated torso location.\n    const abdomen = normalizeLocation(source.locations?.abdomen);\n    const torso = data.locations.torso;\n    const abdomenStatus = getStatus(abdomen.status);\n    const torsoStatus = getLocationStatus(data, "torso");\n    data.locations.torso = {\n      status: (abdomenStatus.rank > torsoStatus.rank ? abdomenStatus : torsoStatus).key,\n      hits: torso.hits + abdomen.hits\n    };\n\n    return data;\n  }\n\n  function normalizeLocation(value) {\n    const status = getLegacyStatus(value);\n    const hits = Array.isArray(value)\n      ? value.length\n      : Math.max(0, Number(value?.hits) || (status.key === "ok" ? 0 : 1));\n\n    return { status: status.key, hits };\n  }\n\n  function getLegacyStatus(value) {\n    if (value && !Array.isArray(value) && typeof value === "object" && getStatus(value.status)) {\n      return getStatus(value.status);\n    }\n\n    if (!Array.isArray(value) || !value.length) return STATUSES[0];\n\n    const severityRanks = { minor: 2, moderate: 2, severe: 3, critical: 3 };\n    const highestRank = value.reduce((rank, wound) => Math.max(rank, severityRanks[wound?.severity] ?? 1), 1);\n    return STATUSES.find(status => status.rank === highestRank) ?? STATUSES[0];\n  }\n`,
`  function normalizeData(raw) {\n    return normalizeCurrentWoundData(raw);\n  }\n`,
"bounded read normalization"
);

replaceExact(
`  function getSetting(key, fallback) {\n    try {\n      return game.settings.get(MODULE_ID, key);\n    } catch (_err) {\n      return fallback;\n    }\n  }\n\n  function refreshOpenActorSheets() {\n`,
`  function getSetting(key, fallback) {\n    try {\n      return game.settings.get(MODULE_ID, key);\n    } catch (_err) {\n      return fallback;\n    }\n  }\n\n  function isMigrationAuthority() {\n    const activeGms = (game.users ?? [])\n      .filter(user => user.active && user.isGM)\n      .sort((left, right) => String(left.id).localeCompare(String(right.id)));\n    const authority = activeGms[0];\n    return authority ? game.user?.id === authority.id : game.user?.isGM === true;\n  }\n\n  async function migrateDetailedWounds() {\n    if (!isMigrationAuthority()) return { migrated: 0, errors: 0, skipped: true };\n\n    const currentVersion = Number(getSetting(SETTING_MIGRATION_VERSION, 0)) || 0;\n    if (currentVersion >= WOUND_MIGRATION_VERSION) {\n      return { migrated: 0, errors: 0, skipped: true };\n    }\n\n    let migrated = 0;\n    let errors = 0;\n\n    for (const actor of game.actors ?? []) {\n      try {\n        if (!isPlayerActor(actor)) {\n          await syncWoundPenaltyEffect(actor);\n          continue;\n        }\n\n        const raw = actor.getFlag(MODULE_ID, FLAG_KEY);\n        const { data, needsWrite } = migrateLegacyWoundData(raw);\n        const hasStoredData = raw !== undefined && raw !== null;\n\n        if (hasStoredData && needsWrite) {\n          await actor.setFlag(MODULE_ID, FLAG_KEY, data);\n          migrated += 1;\n        }\n\n        await syncWoundPenaltyEffect(actor, data);\n      } catch (error) {\n        errors += 1;\n        console.error(\`${"${MODULE_ID}"} v${"${getModuleVersion()}"} | ${"${SUBMODULE}"} | migration error\`, actor?.name, error);\n      }\n    }\n\n    if (errors === 0) {\n      await game.settings.set(MODULE_ID, SETTING_MIGRATION_VERSION, WOUND_MIGRATION_VERSION);\n      if (migrated > 0) log(\`migrated ${"${migrated}"} actor wound record(s)\`);\n    }\n\n    return { migrated, errors, skipped: false };\n  }\n\n  function refreshOpenActorSheets() {\n`,
"versioned world migration"
);

replaceExact(
`  Hooks.once("ready", () => {\n    const mod = game.modules.get(MODULE_ID);\n`,
`  Hooks.once("ready", async () => {\n    await migrateDetailedWounds();\n\n    const mod = game.modules.get(MODULE_ID);\n`,
"ready migration invocation"
);

replaceExact(
`        rollRandom: actor => rollRandomWound(actor)\n      };\n    }\n\n    if (game.user?.isGM) {\n      for (const actor of game.actors ?? []) {\n        syncWoundPenaltyEffect(actor).catch(error => {\n          console.error(\`${"${MODULE_ID}"} v${"${getModuleVersion()}"} | ${"${SUBMODULE}"} | penalty sync error\`, error);\n        });\n      }\n    }\n`,
`        rollRandom: actor => rollRandomWound(actor),\n        migrateLegacyData: () => migrateDetailedWounds()\n      };\n    }\n`,
"remove repeated ready penalty scan"
);

await writeFile(path, source, "utf8");
console.log("Detailed Wounds migration refactor applied.");
