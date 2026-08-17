import { MODULE_ID } from "./constants.js";
import {
  deepClone,
  escapeHtml,
  readDialogForm,
  resolveUuid,
} from "./helpers.js";

const STAGING_SOURCE_FLAG = "encounterStagingSourceUuid";
const STAGING_TOKEN_FLAG = "encounterStaging";
const STAGING_FORMATIONS = Object.freeze(["cluster", "line", "ring"]);
const STAGING_REFERENCES = Object.freeze(["group", "selected", "scene"]);
const STAGING_DIRECTIONS = Object.freeze(["center", "north", "east", "south", "west"]);
const STAGING_VISIBILITIES = Object.freeze(["visible", "hidden"]);
const DISTANCE_OFFSET_CELLS = Object.freeze({
  close: 2,
  near: 6,
  far: 12,
});

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, fallback = 1) {
  const number = Math.floor(finiteNumber(value, fallback));
  return Math.max(1, number);
}

function normalizeChoice(value, allowed, fallback) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function tokenDispositionValue(disposition) {
  const values = globalThis.CONST?.TOKEN_DISPOSITIONS ?? {};
  const normalized = String(disposition ?? "neutral").toLowerCase();
  if (normalized === "hostile") return values.HOSTILE ?? -1;
  if (normalized === "friendly") return values.FRIENDLY ?? 1;
  return values.NEUTRAL ?? 0;
}

function normalizeStagingOptions(data, options = {}) {
  const resolvedCount = positiveInteger(data?.encounter?.count, 1);
  return {
    count: positiveInteger(options.count, resolvedCount),
    reference: normalizeChoice(options.reference, STAGING_REFERENCES, "scene"),
    direction: normalizeChoice(options.direction, STAGING_DIRECTIONS, "east"),
    formation: normalizeChoice(options.formation, STAGING_FORMATIONS, "cluster"),
    visibility: normalizeChoice(options.visibility, STAGING_VISIBILITIES, "hidden"),
    spacingCells: Math.max(0.5, finiteNumber(options.spacingCells, 1.5)),
    useDistance: options.useDistance !== false,
    addToCombat: Boolean(options.addToCombat),
  };
}

function encounterDistanceOffsetCells(data) {
  const label = String(data?.distance?.label ?? "").trim().toLowerCase();
  return DISTANCE_OFFSET_CELLS[label] ?? 0;
}

function rawFlag(document, key) {
  return document?._source?.flags?.[MODULE_ID]?.[key]
    ?? document?.flags?.[MODULE_ID]?.[key];
}

function documentFlag(document, key) {
  try {
    return document?.getFlag?.(MODULE_ID, key) ?? rawFlag(document, key);
  } catch (_error) {
    return rawFlag(document, key);
  }
}

function isActorDocument(document) {
  return Boolean(document && document.documentName === "Actor");
}

function isCompendiumActor(actor) {
  return Boolean(actor?.inCompendium || actor?.pack || actor?.compendium);
}

function findImportedStagingActor(sourceUuid) {
  if (!sourceUuid) return null;
  return Array.from(globalThis.game?.actors ?? []).find(actor => (
    documentFlag(actor, STAGING_SOURCE_FLAG) === sourceUuid
  )) ?? null;
}

function findUniqueWorldActorByName(name) {
  const normalized = String(name ?? "").trim().toLowerCase();
  if (!normalized) return null;

  const matches = Array.from(globalThis.game?.actors ?? []).filter(actor => (
    String(actor?.name ?? "").trim().toLowerCase() === normalized
  ));
  return matches.length === 1 ? matches[0] : null;
}

async function resolveEncounterStagingActor(data) {
  const sourceUuid = String(data?.encounter?.actorUuid ?? "").trim();
  let sourceActor = sourceUuid ? await resolveUuid(sourceUuid) : null;
  if (!isActorDocument(sourceActor)) sourceActor = null;

  if (!sourceActor) {
    const matched = findUniqueWorldActorByName(data?.encounter?.label);
    if (matched) {
      return {
        status: "world-name-match",
        sourceUuid: String(matched.uuid ?? ""),
        sourceActor: matched,
        worldActor: matched,
        previewActor: matched,
        canDeploy: true,
        label: matched.name ?? data?.encounter?.label ?? "Encounter",
      };
    }

    return {
      status: "unresolved",
      sourceUuid,
      sourceActor: null,
      worldActor: null,
      previewActor: null,
      canDeploy: false,
      label: data?.encounter?.label ?? "Unresolved encounter",
    };
  }

  if (!isCompendiumActor(sourceActor)) {
    return {
      status: "world",
      sourceUuid: sourceActor.uuid ?? sourceUuid,
      sourceActor,
      worldActor: sourceActor,
      previewActor: sourceActor,
      canDeploy: true,
      label: sourceActor.name ?? data?.encounter?.label ?? "Encounter",
    };
  }

  const imported = findImportedStagingActor(sourceActor.uuid ?? sourceUuid);
  if (imported) {
    return {
      status: "reused-import",
      sourceUuid: sourceActor.uuid ?? sourceUuid,
      sourceActor,
      worldActor: imported,
      previewActor: imported,
      canDeploy: true,
      label: imported.name ?? sourceActor.name ?? data?.encounter?.label ?? "Encounter",
    };
  }

  return {
    status: "compendium",
    sourceUuid: sourceActor.uuid ?? sourceUuid,
    sourceActor,
    worldActor: null,
    previewActor: sourceActor,
    canDeploy: true,
    label: sourceActor.name ?? data?.encounter?.label ?? "Encounter",
  };
}

async function ensureWorldStagingActor(resolution) {
  if (resolution?.worldActor) return resolution.worldActor;
  if (resolution?.status !== "compendium" || !resolution.sourceActor) return null;

  const sourceUuid = String(resolution.sourceUuid ?? resolution.sourceActor.uuid ?? "");
  const existing = findImportedStagingActor(sourceUuid);
  if (existing) return existing;

  const sourceActor = resolution.sourceActor;
  const pack = sourceActor.compendium
    ?? globalThis.game?.packs?.get?.(sourceActor.pack)
    ?? null;
  if (!pack || typeof globalThis.game?.actors?.importFromCompendium !== "function") {
    throw new Error(`Cannot import Compendium Actor for staging: ${sourceUuid || sourceActor.name}`);
  }

  const imported = await globalThis.game.actors.importFromCompendium(pack, sourceActor.id);
  if (!imported) throw new Error(`Compendium Actor import failed: ${sourceActor.name}`);

  if (typeof imported.setFlag === "function") {
    await imported.setFlag(MODULE_ID, STAGING_SOURCE_FLAG, sourceUuid);
  }
  return imported;
}

function sceneGridSize(scene) {
  return Math.max(
    1,
    finiteNumber(
      scene?.grid?.size
      ?? globalThis.canvas?.grid?.size
      ?? globalThis.canvas?.dimensions?.size,
      100
    )
  );
}

function sceneBounds(scene) {
  const dimensions = scene?.dimensions ?? globalThis.canvas?.dimensions ?? {};
  const gridSize = sceneGridSize(scene);
  const x = finiteNumber(dimensions.sceneX, 0);
  const y = finiteNumber(dimensions.sceneY, 0);
  const width = Math.max(
    gridSize,
    finiteNumber(
      dimensions.sceneWidth
      ?? scene?.width
      ?? dimensions.width,
      gridSize * 20
    )
  );
  const height = Math.max(
    gridSize,
    finiteNumber(
      dimensions.sceneHeight
      ?? scene?.height
      ?? dimensions.height,
      gridSize * 20
    )
  );

  return { x, y, width, height, gridSize };
}

function tokenCenter(token, gridSize) {
  if (!token) return null;
  const width = Math.max(1, finiteNumber(token.width, 1)) * gridSize;
  const height = Math.max(1, finiteNumber(token.height, 1)) * gridSize;
  return {
    x: finiteNumber(token.x, 0) + (width / 2),
    y: finiteNumber(token.y, 0) + (height / 2),
  };
}

async function groupReferenceToken(data, scene) {
  const groupUuid = String(data?.groupContext?.groupActorUuid ?? "");
  if (!groupUuid) return null;
  const groupActor = await resolveUuid(groupUuid);
  if (!groupActor?.id) return null;

  const tokens = Array.from(scene?.tokens ?? []);
  return tokens.find(token => token.actorId === groupActor.id || token.actor?.id === groupActor.id) ?? null;
}

function selectedReferenceToken(scene) {
  const controlled = Array.from(globalThis.canvas?.tokens?.controlled ?? []);
  const placeable = controlled.find(token => token?.document?.parent?.id === scene?.id)
    ?? controlled[0]
    ?? null;
  return placeable?.document ?? placeable ?? null;
}

async function getStagingReferenceAvailability(data, scene = globalThis.canvas?.scene) {
  const groupToken = await groupReferenceToken(data, scene);
  const selectedToken = selectedReferenceToken(scene);
  return {
    group: Boolean(groupToken),
    selected: Boolean(selectedToken),
    scene: Boolean(scene),
  };
}

async function resolveStagingReferencePoint(data, options, scene) {
  const bounds = sceneBounds(scene);
  let token = null;
  let requested = options.reference;

  if (requested === "group") token = await groupReferenceToken(data, scene);
  else if (requested === "selected") token = selectedReferenceToken(scene);

  if (token) {
    return {
      requested,
      resolved: requested,
      label: requested === "group" ? "Originating Group token" : "Selected token",
      point: tokenCenter(token, bounds.gridSize),
      tokenId: token.id ?? "",
    };
  }

  if (requested !== "scene") requested = "scene";
  return {
    requested: options.reference,
    resolved: "scene",
    label: "Scene center",
    point: {
      x: bounds.x + (bounds.width / 2),
      y: bounds.y + (bounds.height / 2),
    },
    tokenId: "",
  };
}

function directionVector(direction) {
  switch (direction) {
    case "north": return { x: 0, y: -1 };
    case "south": return { x: 0, y: 1 };
    case "west": return { x: -1, y: 0 };
    case "east": return { x: 1, y: 0 };
    default: return { x: 0, y: 0 };
  }
}

function stagingAnchor(referencePoint, data, options, gridSize) {
  const vector = directionVector(options.direction);
  const offsetCells = options.useDistance ? encounterDistanceOffsetCells(data) : 0;
  return {
    x: referencePoint.x + (vector.x * offsetCells * gridSize),
    y: referencePoint.y + (vector.y * offsetCells * gridSize),
  };
}

function formationCenters({
  anchor,
  count,
  formation,
  spacingPx,
}) {
  if (count <= 1) return [{ x: anchor.x, y: anchor.y }];

  if (formation === "line") {
    const start = -((count - 1) * spacingPx) / 2;
    return Array.from({ length: count }, (_unused, index) => ({
      x: anchor.x + start + (index * spacingPx),
      y: anchor.y,
    }));
  }

  if (formation === "ring") {
    const radius = Math.max(spacingPx, (count * spacingPx) / (2 * Math.PI));
    return Array.from({ length: count }, (_unused, index) => {
      const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / count);
      return {
        x: anchor.x + (Math.cos(angle) * radius),
        y: anchor.y + (Math.sin(angle) * radius),
      };
    });
  }

  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const left = -((columns - 1) * spacingPx) / 2;
  const top = -((rows - 1) * spacingPx) / 2;

  return Array.from({ length: count }, (_unused, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      x: anchor.x + left + (column * spacingPx),
      y: anchor.y + top + (row * spacingPx),
    };
  });
}

function clampTokenPosition(center, tokenWidthUnits, tokenHeightUnits, bounds) {
  const widthPx = Math.max(1, tokenWidthUnits) * bounds.gridSize;
  const heightPx = Math.max(1, tokenHeightUnits) * bounds.gridSize;
  const minX = bounds.x;
  const minY = bounds.y;
  const maxX = bounds.x + bounds.width - widthPx;
  const maxY = bounds.y + bounds.height - heightPx;

  return {
    x: Math.min(Math.max(center.x - (widthPx / 2), minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(center.y - (heightPx / 2), minY), Math.max(minY, maxY)),
    centerX: center.x,
    centerY: center.y,
  };
}

async function buildEncounterStagingPreview(data, rawOptions = {}, {
  scene = globalThis.canvas?.scene,
} = {}) {
  if (!scene) throw new Error("An active Scene is required to preview encounter staging.");

  const options = normalizeStagingOptions(data, rawOptions);
  const actorResolution = await resolveEncounterStagingActor(data);
  const bounds = sceneBounds(scene);
  const reference = await resolveStagingReferencePoint(data, options, scene);
  const disposition = tokenDispositionValue(data?.disposition);
  const hidden = options.visibility === "hidden";

  let widthUnits = 1;
  let heightUnits = 1;
  if (actorResolution.previewActor?.getTokenDocument) {
    try {
      const prototype = await actorResolution.previewActor.getTokenDocument({
        hidden,
        disposition,
      });
      widthUnits = Math.max(1, finiteNumber(prototype?.width, 1));
      heightUnits = Math.max(1, finiteNumber(prototype?.height, 1));
    } catch (_error) {
      // Preview remains available with conservative 1x1 geometry.
    }
  }

  const anchor = stagingAnchor(reference.point, data, options, bounds.gridSize);
  const spacingPx = bounds.gridSize * Math.max(
    options.spacingCells,
    widthUnits + 0.5,
    heightUnits + 0.5
  );
  const centers = formationCenters({
    anchor,
    count: options.count,
    formation: options.formation,
    spacingPx,
  });
  const positions = centers.map(center => (
    clampTokenPosition(center, widthUnits, heightUnits, bounds)
  ));

  return {
    canDeploy: actorResolution.canDeploy,
    manualStaging: !actorResolution.canDeploy,
    actorResolution,
    actorLabel: actorResolution.label,
    options,
    sceneId: scene.id ?? "",
    sceneName: scene.name ?? "",
    bounds,
    reference,
    anchor,
    disposition: String(data?.disposition ?? "neutral").toLowerCase(),
    dispositionValue: disposition,
    hidden,
    distanceLabel: String(data?.distance?.label ?? "Unknown"),
    distanceOffsetCells: options.useDistance ? encounterDistanceOffsetCells(data) : 0,
    tokenWidthUnits: widthUnits,
    tokenHeightUnits: heightUnits,
    positions,
  };
}

function mergeStagingTokenFlags(tokenData, stagingMetadata) {
  const data = tokenData;
  data.flags ??= {};
  data.flags[MODULE_ID] ??= {};
  data.flags[MODULE_ID][STAGING_TOKEN_FLAG] = deepClone(stagingMetadata);
  return data;
}

function randomId() {
  return globalThis.foundry?.utils?.randomID?.()
    ?? `stage-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function addTokensToCombat(tokens) {
  if (!tokens?.length) return [];

  const TokenClass = globalThis.CONFIG?.Token?.documentClass
    ?? globalThis.TokenDocument
    ?? tokens[0]?.constructor;
  if (typeof TokenClass?.createCombatants === "function") {
    return TokenClass.createCombatants(tokens);
  }

  const combatants = [];
  for (const token of tokens) {
    if (typeof token?.toggleCombatant !== "function") {
      throw new Error("Foundry Token combat API is unavailable.");
    }
    await token.toggleCombatant({ active: true });
    if (token.combatant) combatants.push(token.combatant);
  }
  return combatants;
}

async function deployEncounterStaging(data, rawOptions = {}, {
  scene = globalThis.canvas?.scene,
  sourceMessageId = "",
  user = globalThis.game?.user,
} = {}) {
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can stage encounters.");
    return null;
  }
  if (!scene?.createEmbeddedDocuments) {
    throw new Error("An active Scene is required to deploy encounter tokens.");
  }

  const preview = await buildEncounterStagingPreview(data, rawOptions, { scene });
  if (!preview.canDeploy) {
    return {
      deployed: false,
      manualStaging: true,
      reason: "unresolved-actor",
      preview,
      summary: null,
    };
  }

  const actor = await ensureWorldStagingActor(preview.actorResolution);
  if (!actor?.getTokenDocument) {
    throw new Error(`Encounter Actor could not be prepared for deployment: ${preview.actorLabel}`);
  }

  const prototype = await actor.getTokenDocument({
    hidden: preview.hidden,
    disposition: preview.dispositionValue,
  });
  const prototypeData = typeof prototype?.toObject === "function"
    ? prototype.toObject()
    : deepClone(prototype ?? {});
  const deploymentId = randomId();
  const stagingMetadata = {
    deploymentId,
    sourceMessageId: String(sourceMessageId ?? ""),
    sourceActorUuid: String(preview.actorResolution.sourceUuid ?? data?.encounter?.actorUuid ?? ""),
    groupActorUuid: String(data?.groupContext?.groupActorUuid ?? ""),
    procedure: String(data?.groupContext?.procedure ?? ""),
    encounterGeneratedAt: Number(data?.generatedAt ?? 0) || null,
  };

  const tokenData = preview.positions.map(position => {
    const token = deepClone(prototypeData);
    token.x = position.x;
    token.y = position.y;
    token.hidden = preview.hidden;
    token.disposition = preview.dispositionValue;
    delete token._id;
    return mergeStagingTokenFlags(token, stagingMetadata);
  });

  const createdTokens = await scene.createEmbeddedDocuments("Token", tokenData);
  const combatants = preview.options.addToCombat
    ? await addTokensToCombat(createdTokens)
    : [];

  const summary = {
    deployed: true,
    deploymentId,
    sceneId: String(scene.id ?? ""),
    sceneName: String(scene.name ?? ""),
    actorUuid: String(actor.uuid ?? ""),
    sourceActorUuid: String(stagingMetadata.sourceActorUuid),
    count: createdTokens.length,
    tokenIds: createdTokens.map(token => token.id).filter(Boolean),
    hidden: preview.hidden,
    disposition: preview.disposition,
    formation: preview.options.formation,
    reference: preview.reference.resolved,
    distanceLabel: preview.distanceLabel,
    combat: Boolean(preview.options.addToCombat),
    combatantIds: combatants.map(combatant => combatant?.id).filter(Boolean),
    stagedAt: Date.now(),
  };

  return {
    deployed: true,
    manualStaging: false,
    reason: "",
    preview,
    actor,
    createdTokens,
    combatants,
    summary,
  };
}

function stagingReferenceOptions(availability, selected) {
  const entries = [
    ["group", "Originating Group token"],
    ["selected", "Selected token"],
    ["scene", "Scene center"],
  ];

  return entries
    .filter(([value]) => value === "scene" || availability[value])
    .map(([value, label]) => `
      <option value="${value}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>
    `)
    .join("");
}

function stagingOptionsContent(data, availability, defaults) {
  const count = positiveInteger(defaults.count, data?.encounter?.count ?? 1);
  const distance = String(data?.distance?.label ?? "Unknown");
  return `
    <form class="mk-sd-staging-options">
      <p class="notes">Stage the resolved encounter without rerolling it. Distance is a placement suggestion only; walls and tactical geometry are not interpreted.</p>
      <div class="form-group"><label>Encounter</label><div>${escapeHtml(data?.encounter?.label ?? "Unknown")} × ${escapeHtml(data?.encounter?.count ?? 1)}</div></div>
      <div class="form-group"><label>Resolved distance</label><div>${escapeHtml(distance)}</div></div>
      <div class="form-group"><label>Count to stage</label><input type="number" name="count" min="1" max="100" step="1" value="${count}"></div>
      <div class="form-group"><label>Reference</label><select name="reference">${stagingReferenceOptions(availability, defaults.reference)}</select></div>
      <div class="form-group">
        <label>Direction from reference</label>
        <select name="direction">
          ${STAGING_DIRECTIONS.map(value => `<option value="${value}" ${value === defaults.direction ? "selected" : ""}>${value[0].toUpperCase() + value.slice(1)}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label>Formation</label>
        <select name="formation">
          <option value="cluster" ${defaults.formation === "cluster" ? "selected" : ""}>Compact cluster</option>
          <option value="line" ${defaults.formation === "line" ? "selected" : ""}>Line</option>
          <option value="ring" ${defaults.formation === "ring" ? "selected" : ""}>Ring</option>
        </select>
      </div>
      <div class="form-group"><label>Spacing (grid cells)</label><input type="number" name="spacingCells" min="0.5" max="10" step="0.5" value="${escapeHtml(defaults.spacingCells)}"></div>
      <div class="form-group">
        <label>Visibility</label>
        <select name="visibility">
          <option value="hidden" ${defaults.visibility === "hidden" ? "selected" : ""}>Hidden</option>
          <option value="visible" ${defaults.visibility === "visible" ? "selected" : ""}>Visible</option>
        </select>
      </div>
      <div class="form-group"><label>Use distance offset</label><input type="checkbox" name="useDistance" ${defaults.useDistance ? "checked" : ""}></div>
      <div class="form-group"><label>Add deployed tokens to Combat</label><input type="checkbox" name="addToCombat" ${defaults.addToCombat ? "checked" : ""}></div>
    </form>
  `;
}

function parseStagingOptions(html, data) {
  const form = readDialogForm(html);
  return normalizeStagingOptions(data, {
    count: form.count,
    reference: form.reference,
    direction: form.direction,
    formation: form.formation,
    visibility: form.visibility,
    spacingCells: form.spacingCells,
    useDistance: Boolean(form.useDistance),
    addToCombat: Boolean(form.addToCombat),
  });
}

function previewSvg(preview) {
  const points = [preview.reference.point, preview.anchor, ...preview.positions.map(position => ({
    x: position.x + ((preview.tokenWidthUnits * preview.bounds.gridSize) / 2),
    y: position.y + ((preview.tokenHeightUnits * preview.bounds.gridSize) / 2),
  }))];
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const spanX = Math.max(preview.bounds.gridSize * 2, maxX - minX);
  const spanY = Math.max(preview.bounds.gridSize * 2, maxY - minY);
  const padding = 24;
  const width = 420;
  const height = 220;
  const scale = Math.min(
    (width - (padding * 2)) / spanX,
    (height - (padding * 2)) / spanY
  );
  const mapPoint = point => ({
    x: padding + ((point.x - minX) * scale),
    y: padding + ((point.y - minY) * scale),
  });
  const reference = mapPoint(preview.reference.point);
  const anchor = mapPoint(preview.anchor);
  const tokenPoints = preview.positions.map(position => mapPoint({
    x: position.x + ((preview.tokenWidthUnits * preview.bounds.gridSize) / 2),
    y: position.y + ((preview.tokenHeightUnits * preview.bounds.gridSize) / 2),
  }));

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Encounter formation preview" style="width:100%;max-width:${width}px;height:${height}px;border:1px solid var(--color-border-light-tertiary,#777);background:rgba(0,0,0,.08)">
      <line x1="${reference.x}" y1="${reference.y}" x2="${anchor.x}" y2="${anchor.y}" stroke="currentColor" stroke-dasharray="5 5" opacity=".5"></line>
      <circle cx="${reference.x}" cy="${reference.y}" r="7" fill="none" stroke="currentColor" stroke-width="2"></circle>
      <circle cx="${anchor.x}" cy="${anchor.y}" r="4" fill="currentColor" opacity=".45"></circle>
      ${tokenPoints.map((point, index) => `<g><circle cx="${point.x}" cy="${point.y}" r="10" fill="currentColor" opacity=".78"></circle><text x="${point.x}" y="${point.y + 4}" text-anchor="middle" font-size="10" fill="white">${index + 1}</text></g>`).join("")}
    </svg>
  `;
}

function actorResolutionLabel(resolution) {
  switch (resolution.status) {
    case "world": return "World Actor (reused directly)";
    case "world-name-match": return "World Actor matched by unique name";
    case "reused-import": return "Previously imported staging Actor (reused)";
    case "compendium": return "Compendium Actor (imports only after Deploy)";
    default: return "Actor unresolved — manual staging required";
  }
}

function stagingPreviewContent(data, preview) {
  const positions = preview.positions
    .map((position, index) => `#${index + 1} (${Math.round(position.x)}, ${Math.round(position.y)})`)
    .join(" · ");

  return `
    <div class="mk-sd-staging-preview">
      <p><strong>${escapeHtml(preview.actorLabel)}</strong> × ${escapeHtml(preview.options.count)}</p>
      <p>${escapeHtml(actorResolutionLabel(preview.actorResolution))}</p>
      <p>Disposition: <strong>${escapeHtml(preview.disposition)}</strong> · ${preview.hidden ? "Hidden" : "Visible"} · Formation: <strong>${escapeHtml(preview.options.formation)}</strong></p>
      <p>Reference: <strong>${escapeHtml(preview.reference.label)}</strong> · Distance: <strong>${escapeHtml(preview.distanceLabel)}</strong>${preview.distanceOffsetCells ? ` (${preview.distanceOffsetCells} grid-cell staging suggestion)` : ""}</p>
      <p>Combat handoff: <strong>${preview.options.addToCombat ? "Yes" : "No"}</strong></p>
      ${previewSvg(preview)}
      <p class="hint">Approximate token top-left coordinates: ${escapeHtml(positions)}</p>
      ${preview.manualStaging ? `<p class="notification warning">The encounter Actor cannot be resolved safely. No tokens will be created; keep this preview as a manual staging reference.</p>` : ""}
    </div>
  `;
}

async function chooseStagingOptions(data, defaults, availability) {
  return Dialog.wait({
    title: "Stage Encounter — Options",
    content: stagingOptionsContent(data, availability, defaults),
    buttons: {
      preview: {
        icon: '<i class="fas fa-eye"></i>',
        label: "Preview",
        callback: html => parseStagingOptions(html, data),
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel",
        callback: () => null,
      },
    },
    default: "preview",
    close: () => null,
  }, { width: 560 });
}

async function confirmStagingPreview(data, preview) {
  const buttons = {
    back: {
      icon: '<i class="fas fa-arrow-left"></i>',
      label: "Back",
      callback: () => "back",
    },
  };

  if (preview.canDeploy) {
    buttons.deploy = {
      icon: '<i class="fas fa-location-dot"></i>',
      label: "Deploy",
      callback: () => "deploy",
    };
  } else {
    buttons.close = {
      icon: '<i class="fas fa-check"></i>',
      label: "Close",
      callback: () => "close",
    };
  }

  buttons.cancel = {
    icon: '<i class="fas fa-times"></i>',
    label: "Cancel",
    callback: () => null,
  };

  return Dialog.wait({
    title: `Stage Encounter — ${preview.canDeploy ? "Confirm Preview" : "Manual Preview"}`,
    content: stagingPreviewContent(data, preview),
    buttons,
    default: preview.canDeploy ? "deploy" : "close",
    close: () => null,
  }, { width: 620 });
}

async function openEncounterStagingDialog(data, {
  sourceMessageId = "",
  scene = globalThis.canvas?.scene,
} = {}) {
  if (!globalThis.game?.user?.isGM) return null;
  if (!scene) {
    globalThis.ui?.notifications?.warn?.("Activate a Scene before staging an encounter.");
    return null;
  }

  const availability = await getStagingReferenceAvailability(data, scene);
  let options = normalizeStagingOptions(data, {
    reference: availability.group ? "group" : availability.selected ? "selected" : "scene",
    direction: availability.group || availability.selected ? "east" : "center",
    formation: "cluster",
    visibility: "hidden",
    useDistance: true,
    addToCombat: false,
  });

  while (true) {
    const chosen = await chooseStagingOptions(data, options, availability);
    if (!chosen) return null;
    options = chosen;

    const preview = await buildEncounterStagingPreview(data, options, { scene });
    const action = await confirmStagingPreview(data, preview);
    if (!action || action === "close") {
      return preview.manualStaging
        ? { deployed: false, manualStaging: true, reason: "unresolved-actor", preview, summary: null }
        : null;
    }
    if (action === "back") continue;

    const deployment = await deployEncounterStaging(data, options, {
      scene,
      sourceMessageId,
    });

    if (deployment?.deployed) {
      globalThis.ui?.notifications?.info?.(
        `Staged ${deployment.summary.count} ${preview.actorLabel}${deployment.summary.combat ? " and added them to Combat" : ""}.`
      );
    }
    return deployment;
  }
}

export {
  STAGING_SOURCE_FLAG,
  STAGING_TOKEN_FLAG,
  STAGING_FORMATIONS,
  STAGING_REFERENCES,
  STAGING_DIRECTIONS,
  STAGING_VISIBILITIES,
  DISTANCE_OFFSET_CELLS,
  tokenDispositionValue,
  normalizeStagingOptions,
  encounterDistanceOffsetCells,
  findImportedStagingActor,
  resolveEncounterStagingActor,
  ensureWorldStagingActor,
  sceneBounds,
  getStagingReferenceAvailability,
  resolveStagingReferencePoint,
  stagingAnchor,
  formationCenters,
  clampTokenPosition,
  buildEncounterStagingPreview,
  addTokensToCombat,
  deployEncounterStaging,
  openEncounterStagingDialog,
};
