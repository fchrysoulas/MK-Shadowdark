import test from "node:test";
import assert from "node:assert/strict";
import { applyTravelPlayerRollResult, clearTravelPromptTimer } from "../scripts/group-sheet/travel-prompt.js";
import { queueTravelMutation } from "../scripts/group-sheet/state.js";

function fixture(t) {
  const gm = { id: "gm", active: true, isGM: true };
  globalThis.game = { user: gm, users: [gm], settings: { settings: new Map() }, socket: { emit() {} } };
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  globalThis.document = { getElementById: () => null };
  globalThis.ChatMessage = { getSpeaker: () => ({}), create: async () => null };
  let stored = { members: ["Actor.a", "Actor.b"], activeMembers: ["Actor.a", "Actor.b"],
    travel: { prompt: { id: "prompt", active: true } } };
  const group = {
    uuid: "Actor.group",
    getFlag: (_scope, key) => key === "isGroup" ? true : stored,
    async setFlag(_scope, _key, data) {
      await new Promise(resolve => setImmediate(resolve));
      stored = structuredClone(data);
    },
  };
  globalThis.fromUuid = async uuid => ({ documentName: "Actor", uuid });
  const request = actorUuid => ({ promptId: "prompt", activityKey: "lookout", actorUuid, successCount: 1, failureCount: 0 });
  t.after(() => clearTravelPromptTimer(group.uuid, "prompt"));
  // Transport cleanup timers need not keep Node alive; progress timers are cleared above.
  const nativeTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (...args) => nativeTimeout(...args).unref());
  return { gm, group, request, state: () => stored.travel.prompt };
}

test("simultaneous player rolls retain every result and start travel progress", async t => {
  const f = fixture(t);
  await Promise.all(["Actor.a", "Actor.b"].map(uuid => applyTravelPlayerRollResult(f.group, f.request(uuid), f.gm)));
  assert.deepEqual(f.state().completedKeys, ["lookout:Actor.a", "lookout:Actor.b"]);
  assert.equal(f.state().results.lookout.successes, 2);
  assert.ok(f.state().progressStartedAt > 0);
});

test("duplicate socket and chat deliveries count a roll only once", async t => {
  const f = fixture(t);
  await Promise.all(Array.from({ length: 3 }, () => applyTravelPlayerRollResult(f.group, f.request("Actor.a"), f.gm)));
  assert.deepEqual(f.state().completedKeys, ["lookout:Actor.a"]);
  assert.equal(f.state().results.lookout.successes, 1);
  assert.equal(f.state().progressStartedAt, 0);
});

test("queued submissions recheck the current prompt after a reset", async t => {
  const f = fixture(t);
  const reset = queueTravelMutation(f.group.uuid, () => f.group.setFlag("mk-shadowdark", "group", {
    members: ["Actor.a", "Actor.b"], travel: { prompt: { id: "new", active: true } },
  }));
  const roll = applyTravelPlayerRollResult(f.group, f.request("Actor.a"), f.gm);
  await Promise.all([reset, roll]);
  assert.equal(f.state().id, "new");
  assert.equal(f.state().completedKeys, undefined);
});

test("a failed save releases the group queue so the roll can be retried", async t => {
  const f = fixture(t);
  const save = f.group.setFlag;
  f.group.setFlag = async () => { throw new Error("save failed"); };
  await assert.rejects(applyTravelPlayerRollResult(f.group, f.request("Actor.a"), f.gm), /save failed/);
  f.group.setFlag = save;
  await applyTravelPlayerRollResult(f.group, f.request("Actor.a"), f.gm);
  assert.deepEqual(f.state().completedKeys, ["lookout:Actor.a"]);
});
