import test from "node:test";
import assert from "node:assert/strict";

import {
  STAGING_SOURCE_FLAG,
  STAGING_TOKEN_FLAG,
  buildEncounterStagingPreview,
  deployEncounterStaging,
  encounterDistanceOffsetCells,
  formationCenters,
  normalizeStagingOptions,
  resolveEncounterStagingActor,
  tokenDispositionValue,
} from "../scripts/encounter-engine/staging.js";

function makeTokenPrototype({ width = 1, height = 1 } = {}) {
  return {
    width,
    height,
    toObject() {
      return {
        name: "Creature",
        actorId: "source",
        width,
        height,
        x: 0,
        y: 0,
        hidden: false,
        disposition: 0,
        flags: {},
      };
    },
  };
}

function makeActor({
  id = "goblin",
  uuid = "Actor.goblin",
  name = "Goblin",
  compendium = false,
  sourceFlag = "",
} = {}) {
  const flags = {
    "mk-shadowdark": sourceFlag
      ? { [STAGING_SOURCE_FLAG]: sourceFlag }
      : {},
  };

  return {
    id,
    uuid,
    name,
    documentName: "Actor",
    inCompendium: compendium,
    pack: compendium ? "test.monsters" : null,
    compendium: compendium ? { collection: "test.monsters" } : null,
    flags,
    getFlag(scope, key) {
      return flags?.[scope]?.[key];
    },
    async setFlag(scope, key, value) {
      flags[scope] ??= {};
      flags[scope][key] = value;
      return value;
    },
    async getTokenDocument() {
      return makeTokenPrototype();
    },
  };
}

function makeScene({ createSpy = null, tokens = [] } = {}) {
  return {
    id: "scene-1",
    name: "Dungeon",
    grid: { size: 100 },
    dimensions: {
      sceneX: 0,
      sceneY: 0,
      sceneWidth: 2000,
      sceneHeight: 1600,
    },
    tokens,
    async createEmbeddedDocuments(type, data) {
      if (createSpy) createSpy(type, data);
      return data.map((entry, index) => ({
        ...structuredClone(entry),
        id: `token-${index + 1}`,
      }));
    },
  };
}

function makeActorsCollection(initial = [], importActor = null) {
  const actors = [...initial];
  actors.importFromCompendium = async (...args) => {
    if (!importActor) throw new Error("unexpected import");
    const actor = await importActor(...args);
    actors.push(actor);
    return actor;
  };
  return actors;
}

function installRuntime({
  sourceActor = null,
  worldActors = [],
  scene = makeScene(),
  importActor = null,
  combatSpy = null,
  groupActor = null,
} = {}) {
  const previous = {
    foundry: globalThis.foundry,
    game: globalThis.game,
    canvas: globalThis.canvas,
    fromUuid: globalThis.fromUuid,
    CONST: globalThis.CONST,
    CONFIG: globalThis.CONFIG,
    ui: globalThis.ui,
  };

  const actors = makeActorsCollection(
    groupActor ? [...worldActors, groupActor] : worldActors,
    importActor
  );

  globalThis.foundry = {
    utils: {
      deepClone: value => structuredClone(value),
      randomID: () => "deployment-id",
    },
  };
  globalThis.CONST = {
    TOKEN_DISPOSITIONS: {
      HOSTILE: -1,
      NEUTRAL: 0,
      FRIENDLY: 1,
    },
  };
  globalThis.CONFIG = {
    Token: {
      documentClass: {
        async createCombatants(tokens) {
          if (combatSpy) combatSpy(tokens);
          return tokens.map((token, index) => ({ id: `combatant-${index + 1}`, tokenId: token.id }));
        },
      },
    },
  };
  globalThis.game = {
    user: { isGM: true },
    actors,
    packs: new Map([["test.monsters", { collection: "test.monsters" }]]),
  };
  globalThis.canvas = {
    scene,
    grid: { size: 100 },
    dimensions: scene.dimensions,
    tokens: { controlled: [] },
  };
  globalThis.fromUuid = async uuid => {
    if (sourceActor && uuid === sourceActor.uuid) return sourceActor;
    if (groupActor && uuid === groupActor.uuid) return groupActor;
    return actors.find(actor => actor.uuid === uuid) ?? null;
  };
  globalThis.ui = {
    notifications: {
      warn: () => {},
      info: () => {},
    },
  };

  return {
    actors,
    restore() {
      Object.assign(globalThis, previous);
    },
  };
}

function encounterData(actorUuid = "Actor.goblin") {
  return {
    schema: 2,
    generatedAt: 1000,
    disposition: "hostile",
    distance: { label: "Near" },
    encounter: {
      actorUuid,
      label: "Goblin",
      count: 4,
    },
  };
}

test("staging defaults preserve resolved count and disposition semantics", () => {
  const data = encounterData();
  const options = normalizeStagingOptions(data, {});

  assert.equal(options.count, 4);
  assert.equal(options.formation, "cluster");
  assert.equal(options.visibility, "hidden");
  assert.equal(tokenDispositionValue("hostile"), -1);
  assert.equal(tokenDispositionValue("neutral"), 0);
  assert.equal(tokenDispositionValue("friendly"), 1);
  assert.equal(encounterDistanceOffsetCells({ distance: { label: "Close" } }), 2);
  assert.equal(encounterDistanceOffsetCells({ distance: { label: "Near" } }), 6);
  assert.equal(encounterDistanceOffsetCells({ distance: { label: "Far" } }), 12);
});

test("formation geometry is deterministic for cluster, line, and ring", () => {
  const anchor = { x: 500, y: 500 };

  assert.deepEqual(formationCenters({
    anchor,
    count: 3,
    formation: "line",
    spacingPx: 100,
  }), [
    { x: 400, y: 500 },
    { x: 500, y: 500 },
    { x: 600, y: 500 },
  ]);

  assert.deepEqual(formationCenters({
    anchor,
    count: 4,
    formation: "cluster",
    spacingPx: 100,
  }), [
    { x: 450, y: 450 },
    { x: 550, y: 450 },
    { x: 450, y: 550 },
    { x: 550, y: 550 },
  ]);

  const ring = formationCenters({
    anchor,
    count: 4,
    formation: "ring",
    spacingPx: 100,
  });
  assert.equal(ring.length, 4);
  assert.equal(Math.round(ring[0].x), 500);
  assert.equal(Math.round(ring[0].y), 400);
});

test("Compendium Actor preview creates no world Actor, Token, or Combat document", async () => {
  const sourceActor = makeActor({
    id: "goblin",
    uuid: "Compendium.test.monsters.Actor.goblin",
    compendium: true,
  });
  let imports = 0;
  let tokenCreates = 0;
  let combatCreates = 0;
  const scene = makeScene({
    createSpy: () => { tokenCreates += 1; },
  });
  const runtime = installRuntime({
    sourceActor,
    scene,
    importActor: async () => {
      imports += 1;
      return makeActor({ uuid: "Actor.imported" });
    },
    combatSpy: () => { combatCreates += 1; },
  });

  try {
    const preview = await buildEncounterStagingPreview(
      encounterData(sourceActor.uuid),
      {
        count: 3,
        reference: "scene",
        direction: "center",
        formation: "line",
        visibility: "hidden",
        addToCombat: true,
      },
      { scene }
    );

    assert.equal(preview.canDeploy, true);
    assert.equal(preview.actorResolution.status, "compendium");
    assert.equal(preview.positions.length, 3);
    assert.equal(imports, 0);
    assert.equal(tokenCreates, 0);
    assert.equal(combatCreates, 0);
  } finally {
    runtime.restore();
  }
});

test("world Actor deployment creates exact tokens with visibility, disposition, staging flags, and optional combat", async () => {
  const sourceActor = makeActor();
  const tokenCalls = [];
  const combatCalls = [];
  const scene = makeScene({
    createSpy: (type, data) => tokenCalls.push({ type, data }),
  });
  const runtime = installRuntime({
    sourceActor,
    worldActors: [sourceActor],
    scene,
    combatSpy: tokens => combatCalls.push(tokens),
  });

  try {
    const result = await deployEncounterStaging(encounterData(), {
      count: 3,
      reference: "scene",
      direction: "center",
      formation: "cluster",
      visibility: "hidden",
      addToCombat: true,
    }, {
      scene,
      sourceMessageId: "message-1",
    });

    assert.equal(result.deployed, true);
    assert.equal(result.summary.count, 3);
    assert.equal(result.summary.combat, true);
    assert.equal(tokenCalls.length, 1);
    assert.equal(tokenCalls[0].type, "Token");
    assert.equal(tokenCalls[0].data.length, 3);
    assert.equal(combatCalls.length, 1);
    assert.equal(combatCalls[0].length, 3);

    for (const token of tokenCalls[0].data) {
      assert.equal(token.hidden, true);
      assert.equal(token.disposition, -1);
      assert.equal(token.flags["mk-shadowdark"][STAGING_TOKEN_FLAG].sourceMessageId, "message-1");
      assert.equal(token.flags["mk-shadowdark"][STAGING_TOKEN_FLAG].deploymentId, "deployment-id");
    }
  } finally {
    runtime.restore();
  }
});

test("Compendium Actors import only on confirmed deployment and are reused by source UUID", async () => {
  const sourceActor = makeActor({
    id: "goblin",
    uuid: "Compendium.test.monsters.Actor.goblin",
    compendium: true,
  });
  let imports = 0;
  const imported = makeActor({
    id: "imported-goblin",
    uuid: "Actor.imported-goblin",
    name: "Goblin",
  });
  const scene = makeScene();
  const runtime = installRuntime({
    sourceActor,
    scene,
    importActor: async () => {
      imports += 1;
      return imported;
    },
  });

  try {
    const data = encounterData(sourceActor.uuid);
    const first = await deployEncounterStaging(data, {
      count: 1,
      reference: "scene",
      direction: "center",
    }, { scene });

    assert.equal(first.deployed, true);
    assert.equal(imports, 1);
    assert.equal(imported.getFlag("mk-shadowdark", STAGING_SOURCE_FLAG), sourceActor.uuid);

    const resolution = await resolveEncounterStagingActor(data);
    assert.equal(resolution.status, "reused-import");
    assert.equal(resolution.worldActor, imported);

    const second = await deployEncounterStaging(data, {
      count: 1,
      reference: "scene",
      direction: "center",
    }, { scene });

    assert.equal(second.deployed, true);
    assert.equal(imports, 1);
  } finally {
    runtime.restore();
  }
});

test("unresolved encounter Actor degrades to manual staging without Scene mutation", async () => {
  let tokenCreates = 0;
  const scene = makeScene({
    createSpy: () => { tokenCreates += 1; },
  });
  const runtime = installRuntime({ scene });

  try {
    const data = encounterData("Actor.missing");
    data.encounter.label = "Unknown Beast";

    const preview = await buildEncounterStagingPreview(data, {
      count: 2,
      reference: "scene",
      direction: "center",
    }, { scene });
    assert.equal(preview.manualStaging, true);
    assert.equal(preview.canDeploy, false);

    const deployment = await deployEncounterStaging(data, {
      count: 2,
      reference: "scene",
      direction: "center",
    }, { scene });
    assert.equal(deployment.deployed, false);
    assert.equal(deployment.reason, "unresolved-actor");
    assert.equal(tokenCreates, 0);
  } finally {
    runtime.restore();
  }
});

test("originating Group token can anchor distance-informed staging when Group context exists", async () => {
  const sourceActor = makeActor();
  const groupActor = makeActor({
    id: "group-1",
    uuid: "Actor.group-1",
    name: "Group",
  });
  const scene = makeScene({
    tokens: [{
      id: "group-token",
      actorId: groupActor.id,
      x: 100,
      y: 200,
      width: 1,
      height: 1,
    }],
  });
  const runtime = installRuntime({
    sourceActor,
    worldActors: [sourceActor],
    groupActor,
    scene,
  });

  try {
    const data = encounterData();
    data.groupContext = {
      groupActorUuid: groupActor.uuid,
      procedure: "exploration",
    };

    const preview = await buildEncounterStagingPreview(data, {
      count: 1,
      reference: "group",
      direction: "east",
      useDistance: true,
    }, { scene });

    assert.equal(preview.reference.resolved, "group");
    assert.deepEqual(preview.reference.point, { x: 150, y: 250 });
    assert.deepEqual(preview.anchor, { x: 750, y: 250 });
  } finally {
    runtime.restore();
  }
});
