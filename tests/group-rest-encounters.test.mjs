import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_ENVIRONMENT_PROFILES } from "../scripts/libs/environment-context.js";
import {
  REST_TOTAL_TURNS,
  REST_TURN_SECONDS,
  calculateRestCheckTurns,
  continueGroupRest,
  getGroupRestState,
  getGroupRestWorkflow,
  startGroupRest,
} from "../scripts/group-sheet/rest-encounters.js";

function makeMember({ uuid = "Actor.member-1", hp = 1, hpMax = 5, rations = 2 } = {}) {
  const ration = {
    id: "ration-1",
    name: "Ration",
    type: "Basic",
    system: {
      quantity: rations,
      lost: false,
    },
  };

  const actor = {
    id: uuid.split(".").at(-1),
    uuid,
    documentName: "Actor",
    name: "Resting Hero",
    type: "Player",
    system: {
      attributes: {
        hp: {
          value: hp,
          max: hpMax,
        },
      },
    },
    items: [ration],
    async update(change) {
      if (Object.prototype.hasOwnProperty.call(change, "system.attributes.hp.value")) {
        this.system.attributes.hp.value = Number(change["system.attributes.hp.value"]);
      }
    },
    async updateEmbeddedDocuments(_type, updates) {
      for (const update of updates) {
        const item = this.items.find(entry => entry.id === update._id);
        if (!item) continue;
        if (Object.prototype.hasOwnProperty.call(update, "system.quantity")) {
          item.system.quantity = Number(update["system.quantity"]);
        }
        if (Object.prototype.hasOwnProperty.call(update, "system.quantity.value")) {
          item.system.quantity = Number(update["system.quantity.value"]);
        }
      }
    },
  };

  return actor;
}

function makeGroupActor(member, { restingElapsed = 0 } = {}) {
  const flags = {
    "mk-shadowdark": {
      isGroup: true,
      group: {
        members: [member.uuid],
        activeMembers: [member.uuid],
        travel: { activities: {} },
        camping: { activities: {} },
        procedure: { state: "downtime" },
        time: {
          elapsed: {
            exploration: 0,
            resting: restingElapsed,
            combat: 0,
            downtime: 0,
          },
        },
      },
    },
  };

  return {
    id: "group-1",
    uuid: "Actor.group-1",
    name: "Test Group",
    flags,
    sheet: { render: () => {} },
    getFlag(scope, key) {
      return flags?.[scope]?.[key];
    },
    async update(change) {
      const group = flags["mk-shadowdark"].group;

      if (change["flags.mk-shadowdark.group.time"] !== undefined) {
        group.time = structuredClone(change["flags.mk-shadowdark.group.time"]);
      }
      if (change["flags.mk-shadowdark.group.procedure"] !== undefined) {
        group.procedure = structuredClone(change["flags.mk-shadowdark.group.procedure"]);
      }
      if (change["flags.mk-shadowdark.group.resting"] !== undefined) {
        group.resting = structuredClone(change["flags.mk-shadowdark.group.resting"]);
      }
    },
  };
}

function installRuntime({ member, group, tableConfigured = true } = {}) {
  const previous = {
    foundry: globalThis.foundry,
    game: globalThis.game,
    canvas: globalThis.canvas,
    fromUuid: globalThis.fromUuid,
    Hooks: globalThis.Hooks,
    ui: globalThis.ui,
    ChatMessage: globalThis.ChatMessage,
  };

  const sceneContext = {
    profileId: "default",
    terrain: "Default",
    dangerLevel: "unsafe",
    period: "day",
    tableUuid: tableConfigured ? "RollTable.rest" : "",
  };
  const scene = {
    id: "scene-1",
    uuid: "Scene.scene-1",
    name: "Camp",
    getFlag(scope, key) {
      if (scope === "mk-shadowdark" && key === "encounterContext") return sceneContext;
      return undefined;
    },
  };
  const settings = new Map([
    ["mk-shadowdark.encounterEngineEnabled", true],
    ["mk-shadowdark.encounterEngineProfiles", JSON.stringify(DEFAULT_ENVIRONMENT_PROFILES)],
    ["mk-shadowdark.encounterEngineDefaultProfile", "default"],
    ["mk-shadowdark.encounterEngineDefaultTableUuid", ""],
    ["mk-shadowdark.encounterEngineShowDice3d", false],
    ["mk-shadowdark.characterSheetTweaksRestMode", "normal"],
  ]);

  globalThis.foundry = {
    utils: {
      deepClone: value => structuredClone(value),
      getProperty: (object, path) => path.split(".").reduce((current, key) => current?.[key], object),
    },
  };
  globalThis.game = {
    user: { id: "gm", isGM: true },
    users: [{ id: "gm", isGM: true, active: true }],
    actors: {
      get(id) {
        if (member && [member.id, member.uuid, `Actor.${member.id}`].includes(id)) return member;
        if (group && [group.id, group.uuid, `Actor.${group.id}`].includes(id)) return group;
        return null;
      },
      [Symbol.iterator]: function* iterator() {
        if (group) yield group;
        if (member) yield member;
      },
    },
    time: {
      worldTime: 0,
      async advance(seconds) {
        this.worldTime += seconds;
        return this.worldTime;
      },
    },
    scenes: { current: scene },
    settings: {
      settings: new Map(Array.from(settings.keys(), key => [key, {}])),
      get: (_moduleId, key) => settings.get(`mk-shadowdark.${key}`),
    },
    dice3d: null,
    packs: new Map(),
  };
  globalThis.canvas = { scene };
  globalThis.fromUuid = async uuid => {
    if (member && uuid === member.uuid) return member;
    if (group && uuid === group.uuid) return group;
    if (uuid === "RollTable.rest" && tableConfigured) {
      return { uuid, name: "Rest Encounters", documentName: "RollTable" };
    }
    return null;
  };
  globalThis.Hooks = { callAll: () => {} };
  globalThis.ui = {
    notifications: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
  globalThis.ChatMessage = undefined;

  return {
    restore() {
      Object.assign(globalThis, previous);
    },
  };
}

test("rest procedure uses one-hour turns and eight total turns", () => {
  assert.equal(REST_TURN_SECONDS, 3600);
  assert.equal(REST_TOTAL_TURNS, 8);
});

test("danger intervals are interpreted as resting-turn counts", () => {
  assert.deepEqual(calculateRestCheckTurns(3), [3, 6]);
  assert.deepEqual(calculateRestCheckTurns(2), [2, 4, 6, 8]);
  assert.deepEqual(calculateRestCheckTurns(1), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("starting a rest resets the #45 resting timeline and snapshots the active participants", async () => {
  const member = makeMember();
  const group = makeGroupActor(member, { restingElapsed: 7200 });
  const runtime = installRuntime({ member, group });

  try {
    await startGroupRest(group, {
      plannedRations: 1,
      participants: [member],
      mode: "normal",
    });

    const workflow = getGroupRestWorkflow(group);
    assert.equal(workflow.status, "checking");
    assert.equal(workflow.plannedRations, 1);
    assert.deepEqual(workflow.participantUuids, [member.uuid]);
    assert.equal(workflow.rationsConsumed, false);
    assert.equal(group.flags["mk-shadowdark"].group.time.elapsed.resting, 0);
    assert.equal(group.flags["mk-shadowdark"].group.procedure.state, "resting");
  } finally {
    runtime.restore();
  }
});

test("an encounter interruption advances only to its check turn and consumes no ration or rest benefit", async () => {
  const member = makeMember({ hp: 1, hpMax: 5, rations: 2 });
  const group = makeGroupActor(member);
  const runtime = installRuntime({ member, group });

  try {
    await startGroupRest(group, {
      plannedRations: 1,
      participants: [member],
      mode: "normal",
    });

    const result = await continueGroupRest(group, {
      notify: false,
      encounterService: async () => ({
        check: { total: 1 },
        isEncounter: true,
        encounter: null,
        context: {},
        reason: "",
      }),
    });

    assert.equal(result.action, "interrupted");
    assert.equal(getGroupRestWorkflow(group).status, "interrupted");
    assert.equal(getGroupRestWorkflow(group).consumedChecks, 1);
    assert.equal(group.flags["mk-shadowdark"].group.time.elapsed.resting, 3 * 3600);
    assert.equal(globalThis.game.time.worldTime, 3 * 3600);
    assert.equal(member.items[0].system.quantity, 2);
    assert.equal(member.system.attributes.hp.value, 1);
  } finally {
    runtime.restore();
  }
});

test("resuming an interrupted Unsafe rest continues at turn 6 then completes at turn 8", async () => {
  const member = makeMember({ hp: 1, hpMax: 5, rations: 2 });
  const group = makeGroupActor(member);
  const runtime = installRuntime({ member, group });

  try {
    await startGroupRest(group, {
      plannedRations: 1,
      participants: [member],
      mode: "normal",
    });

    await continueGroupRest(group, {
      notify: false,
      encounterService: async () => ({
        isEncounter: true,
        encounter: null,
        reason: "",
      }),
    });

    const completed = await continueGroupRest(group, {
      notify: false,
      encounterService: async () => ({
        isEncounter: false,
        encounter: null,
        reason: "",
      }),
    });

    assert.equal(completed.action, "completed");
    assert.equal(getGroupRestWorkflow(group).status, "completed");
    assert.equal(getGroupRestWorkflow(group).consumedChecks, 2);
    assert.equal(group.flags["mk-shadowdark"].group.time.elapsed.resting, 8 * 3600);
    assert.equal(globalThis.game.time.worldTime, 8 * 3600);
    assert.equal(member.items[0].system.quantity, 1);
    assert.equal(member.system.attributes.hp.value, 5);
    assert.equal(group.flags["mk-shadowdark"].group.procedure.state, "downtime");
  } finally {
    runtime.restore();
  }
});

test("successful rest processes all required checks before consuming rations and benefits", async () => {
  const member = makeMember({ hp: 2, hpMax: 7, rations: 2 });
  const group = makeGroupActor(member);
  const runtime = installRuntime({ member, group });
  const order = [];

  const originalUpdateEmbedded = member.updateEmbeddedDocuments.bind(member);
  member.updateEmbeddedDocuments = async (...args) => {
    order.push("rations");
    return originalUpdateEmbedded(...args);
  };
  const originalUpdate = member.update.bind(member);
  member.update = async change => {
    if (Object.prototype.hasOwnProperty.call(change, "system.attributes.hp.value")) order.push("benefit");
    return originalUpdate(change);
  };

  try {
    await startGroupRest(group, {
      plannedRations: 1,
      participants: [member],
      mode: "normal",
    });

    let checks = 0;
    const result = await continueGroupRest(group, {
      notify: false,
      encounterService: async () => {
        checks += 1;
        order.push(`check-${checks}`);
        return {
          isEncounter: false,
          encounter: null,
          reason: "",
        };
      },
    });

    assert.equal(result.action, "completed");
    assert.equal(checks, 2);
    assert.deepEqual(order, ["check-1", "check-2", "rations", "benefit"]);
  } finally {
    runtime.restore();
  }
});

test("missing encounter table blocks rest before time, ration, or benefit mutation", async () => {
  const member = makeMember({ hp: 1, hpMax: 5, rations: 2 });
  const group = makeGroupActor(member);
  const runtime = installRuntime({ member, group, tableConfigured: false });

  try {
    await startGroupRest(group, {
      plannedRations: 1,
      participants: [member],
      mode: "normal",
    });

    const result = await continueGroupRest(group, { notify: false });
    assert.equal(result.action, "configuration-required");
    assert.equal(result.reason, "missing-table");
    assert.equal(group.flags["mk-shadowdark"].group.time.elapsed.resting, 0);
    assert.equal(globalThis.game.time.worldTime, 0);
    assert.equal(member.items[0].system.quantity, 2);
    assert.equal(member.system.attributes.hp.value, 1);
  } finally {
    runtime.restore();
  }
});

test("rest state exposes chronological check progress without another elapsed-time clock", async () => {
  const member = makeMember();
  const group = makeGroupActor(member, { restingElapsed: 4 * 3600 });
  group.flags["mk-shadowdark"].group.resting = {
    status: "checking",
    mode: "normal",
    plannedRations: 1,
    consumedChecks: 1,
    participantUuids: [member.uuid],
    completedMemberUuids: [],
    rationsConsumed: false,
    returnProcedure: "downtime",
  };
  const runtime = installRuntime({ member, group });

  try {
    const state = getGroupRestState(group);
    assert.equal(state.completedTurns, 4);
    assert.equal(state.requiredChecks, 2);
    assert.equal(state.remainingChecks, 1);
    assert.equal(state.nextCheckTurn, 6);
    assert.equal(Object.prototype.hasOwnProperty.call(state.workflow, "elapsedSeconds"), false);
  } finally {
    runtime.restore();
  }
});
