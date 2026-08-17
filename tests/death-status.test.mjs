import test from "node:test";
import assert from "node:assert/strict";

import {
  findConfiguredStatus,
  setConfiguredStatus,
  statusLabel
} from "../scripts/death-status.js";

test("findConfiguredStatus resolves Dead without mutating configuration", () => {
  const statuses = [
    { id: "prone", name: "EFFECT.StatusProne", img: "prone.svg" },
    { id: "dead", name: "EFFECT.StatusDead", img: "dead.svg" }
  ];
  const before = structuredClone(statuses);

  const dead = findConfiguredStatus(statuses, "dead");

  assert.equal(dead, statuses[1]);
  assert.deepEqual(statuses, before);
});

test("statusLabel hides localization keys without rewriting them", () => {
  const status = { id: "dead", name: "EFFECT.StatusDead" };
  assert.equal(statusLabel(status), "Dead");
  assert.equal(status.name, "EFFECT.StatusDead");
});

test("setConfiguredStatus delegates activation to Actor.toggleStatusEffect", async () => {
  const calls = [];
  const actor = {
    async toggleStatusEffect(id, options) {
      calls.push({ id, options });
      return true;
    }
  };

  await setConfiguredStatus(actor, [{ id: "dead", name: "Dead" }], "dead", true);
  await setConfiguredStatus(actor, [{ id: "dead", name: "Dead" }], "dead", false);

  assert.deepEqual(calls, [
    { id: "dead", options: { active: true, overlay: false } },
    { id: "dead", options: { active: false, overlay: false } }
  ]);
});

test("setConfiguredStatus fails clearly when the configured status is missing", async () => {
  const actor = { toggleStatusEffect: async () => true };
  await assert.rejects(
    setConfiguredStatus(actor, [], "dead", true),
    /Configured status not found: dead/
  );
});
