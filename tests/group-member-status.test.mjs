import test from "node:test";
import assert from "node:assert/strict";

import {
  activeActorEffects,
  activeLightSummary,
  buildGroupMemberStatus,
  deathTimerSummary,
  focusSummary,
  nativeDeadState,
  renderGroupMemberStatus,
  woundsSummary,
} from "../scripts/group-sheet/member-status.js";

function makeActor({
  hp = 5,
  hpMax = 5,
  ac = 14,
  flags = {},
  effects = [],
  items = [],
  statuses = new Set(),
  name = "Hero",
} = {}) {
  return {
    id: "hero-1",
    uuid: "Actor.hero-1",
    documentName: "Actor",
    name,
    system: {
      attributes: {
        hp: { value: hp, max: hpMax },
        ac: { value: ac },
      },
    },
    flags: {
      "mk-shadowdark": flags,
    },
    effects,
    items,
    statuses,
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
  };
}

function installRuntime({ focusApi = null, defeatedStatus = "dead" } = {}) {
  const previousGame = globalThis.game;
  const previousConfig = globalThis.CONFIG;

  globalThis.game = {
    modules: {
      get(id) {
        if (id !== "mk-shadowdark") return null;
        return {
          api: focusApi ? { focus: focusApi } : {},
        };
      },
    },
  };
  globalThis.CONFIG = {
    specialStatusEffects: {
      DEFEATED: defeatedStatus,
    },
  };

  return {
    restore() {
      globalThis.game = previousGame;
      globalThis.CONFIG = previousConfig;
    },
  };
}

test("missing optional feature state produces a normal read-only summary", () => {
  const runtime = installRuntime();
  const actor = makeActor();

  try {
    const status = buildGroupMemberStatus(actor);
    assert.equal(status.severity, "normal");
    assert.equal(status.hp.value, 5);
    assert.equal(status.hp.max, 5);
    assert.equal(status.ac, 14);
    assert.equal(status.dead, false);
    assert.deepEqual(status.deathTimer, { active: false, turns: null });
    assert.equal(status.wounds.total, 0);
    assert.equal(status.focus.total, 0);
    assert.equal(status.light.total, 0);
    assert.deepEqual(status.effects, []);
    assert.equal(status.notableCount, 0);
  } finally {
    runtime.restore();
  }
});

test("Detailed Wounds summary counts only affected canonical locations", () => {
  const actor = makeActor({
    flags: {
      detailedWounds: {
        locations: {
          head: { level: "critical", damage: 4 },
          torso: { level: "wound", damage: 2 },
          leftArm: { level: "destroyed", damage: 8 },
          rightArm: { level: "ok", damage: 0 },
          unknown: { level: "invalid", damage: 99 },
        },
      },
    },
  });

  const summary = woundsSummary(actor);
  assert.equal(summary.total, 3);
  assert.equal(summary.wound, 1);
  assert.equal(summary.critical, 1);
  assert.equal(summary.destroyed, 1);
  assert.deepEqual(summary.entries, [
    { locationId: "head", level: "critical", damage: 4 },
    { locationId: "torso", level: "wound", damage: 2 },
    { locationId: "leftArm", level: "destroyed", damage: 8 },
  ]);
});

test("Focus public API is preferred over raw actor flag state", () => {
  let apiCalls = 0;
  const runtime = installRuntime({
    focusApi: {
      getActorSessions(actor) {
        apiCalls += 1;
        assert.equal(actor.uuid, "Actor.hero-1");
        return [
          { id: "api-focus", spellName: "Shield", pendingLoss: true },
        ];
      },
    },
  });
  const actor = makeActor({
    flags: {
      focusTracker: {
        sessions: [
          { id: "flag-focus", spellName: "Wrong Source", pendingLoss: false },
        ],
      },
    },
  });

  try {
    const summary = focusSummary(actor);
    assert.equal(apiCalls, 1);
    assert.equal(summary.total, 1);
    assert.equal(summary.pendingLoss, 1);
    assert.deepEqual(summary.sessions, [
      { id: "api-focus", spellName: "Shield", pendingLoss: true },
    ]);
  } finally {
    runtime.restore();
  }
});

test("Focus falls back to canonical actor flag when public API is unavailable", () => {
  const runtime = installRuntime();
  const actor = makeActor({
    flags: {
      focusTracker: {
        sessions: [
          { id: "focus-1", spellName: "Light", pendingLoss: false },
          { id: "focus-2", spellName: "Protection", pendingLoss: true },
        ],
      },
    },
  });

  try {
    const summary = focusSummary(actor);
    assert.equal(summary.total, 2);
    assert.equal(summary.pendingLoss, 1);
    assert.deepEqual(summary.sessions.map(session => session.spellName), ["Light", "Protection"]);
  } finally {
    runtime.restore();
  }
});

test("disabled and suppressed effects are excluded from GM status", () => {
  const actor = makeActor({
    effects: [
      { id: "active", name: "Blessed", disabled: false, statuses: new Set(["blessed"]) },
      { id: "disabled", name: "Disabled", disabled: true, statuses: new Set(["disabled"]) },
      { id: "suppressed", name: "Suppressed", isSuppressed: true, statuses: new Set(["suppressed"]) },
    ],
  });

  assert.deepEqual(activeActorEffects(actor), [
    {
      id: "active",
      name: "Blessed",
      img: "",
      statuses: ["blessed"],
    },
  ]);
});

test("native Dead is detected from actor statuses or active effect statuses", () => {
  const runtime = installRuntime({ defeatedStatus: "defeated" });

  try {
    const actorStatus = makeActor({ statuses: new Set(["defeated"]) });
    assert.equal(nativeDeadState(actorStatus), true);

    const effectStatus = makeActor({
      effects: [
        { id: "dead", name: "Defeated", disabled: false, statuses: new Set(["defeated"]) },
      ],
    });
    assert.equal(nativeDeadState(effectStatus), true);

    const alive = makeActor();
    assert.equal(nativeDeadState(alive), false);
  } finally {
    runtime.restore();
  }
});

test("death timer reads the canonical MK actor flag", () => {
  const active = makeActor({
    flags: {
      deathTimer: { turns: 3, updatedAt: 1000 },
    },
  });
  assert.deepEqual(deathTimerSummary(active), { active: true, turns: 3 });

  const expired = makeActor({
    flags: {
      deathTimer: { turns: 0 },
    },
  });
  assert.deepEqual(deathTimerSummary(expired), { active: false, turns: 0 });
});

test("active light extraction includes only active Shadowdark light-source items", () => {
  const actor = makeActor({
    items: [
      { id: "torch", name: "Torch", system: { light: { isSource: true, active: true } } },
      { id: "lantern", name: "Lantern", system: { light: { isSource: true, active: false } } },
      { id: "rock", name: "Rock", system: {} },
    ],
  });

  assert.deepEqual(activeLightSummary(actor), {
    total: 1,
    items: [{ id: "torch", name: "Torch" }],
  });
});

test("critical severity covers zero HP, death state, timer, severe wounds, and pending Focus loss", () => {
  const runtime = installRuntime();

  try {
    const cases = [
      makeActor({ hp: 0 }),
      makeActor({ statuses: new Set(["dead"]) }),
      makeActor({ flags: { deathTimer: { turns: 2 } } }),
      makeActor({ flags: { detailedWounds: { locations: { head: { level: "critical" } } } } }),
      makeActor({ flags: { detailedWounds: { locations: { arm: { level: "destroyed" } } } } }),
      makeActor({ flags: { focusTracker: { sessions: [{ spellName: "Shield", pendingLoss: true }] } } }),
    ];

    for (const actor of cases) {
      assert.equal(buildGroupMemberStatus(actor).severity, "critical");
    }
  } finally {
    runtime.restore();
  }
});

test("ordinary wound, active Focus, or active effect produces attention severity", () => {
  const runtime = installRuntime();

  try {
    const wound = makeActor({
      flags: { detailedWounds: { locations: { arm: { level: "wound" } } } },
    });
    assert.equal(buildGroupMemberStatus(wound).severity, "attention");

    const focus = makeActor({
      flags: { focusTracker: { sessions: [{ spellName: "Light", pendingLoss: false }] } },
    });
    assert.equal(buildGroupMemberStatus(focus).severity, "attention");

    const effect = makeActor({
      effects: [{ id: "effect", name: "Blessed", statuses: new Set() }],
    });
    assert.equal(buildGroupMemberStatus(effect).severity, "attention");
  } finally {
    runtime.restore();
  }
});

test("active light alone does not inflate warning severity", () => {
  const runtime = installRuntime();
  const actor = makeActor({
    items: [
      { id: "torch", name: "Torch", system: { light: { isSource: true, active: true } } },
    ],
  });

  try {
    const status = buildGroupMemberStatus(actor);
    assert.equal(status.light.total, 1);
    assert.equal(status.severity, "normal");
  } finally {
    runtime.restore();
  }
});

test("status extraction is read-only and creates no Group-side duplicate state", () => {
  const runtime = installRuntime();
  const actor = makeActor({
    flags: {
      detailedWounds: { locations: { torso: { level: "wound", damage: 1 } } },
    },
  });
  const before = structuredClone(actor.flags);

  try {
    const status = buildGroupMemberStatus(actor);
    assert.equal(status.actorUuid, actor.uuid);
    assert.deepEqual(actor.flags, before);
    assert.equal(Object.prototype.hasOwnProperty.call(status, "groupState"), false);
  } finally {
    runtime.restore();
  }
});

test("dialog rendering escapes member and feature names", () => {
  const runtime = installRuntime();
  const actor = makeActor({
    name: '<Hero & "GM">',
    effects: [{ id: "fx", name: "<script>alert(1)</script>", statuses: new Set() }],
  });

  try {
    const html = renderGroupMemberStatus(buildGroupMemberStatus(actor));
    assert.equal(html.includes('<script>alert(1)</script>'), false);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /&lt;Hero &amp; &quot;GM&quot;&gt;/);
  } finally {
    runtime.restore();
  }
});
