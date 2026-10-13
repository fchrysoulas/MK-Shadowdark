import test from "node:test";
import assert from "node:assert/strict";
import { buildUpgradeData, getUpgradeBuildKey, normalizeBastionUpgrades } from "../scripts/bastion-sheet/upgrades.js";

class NativeSheet {
  constructor(actor) { this.actor = actor; this.isEditable = true; }
  async getData() { return {}; }
}
globalThis.foundry = { appv1: { sheets: { ActorSheet: NativeSheet } } };
const { getBastionState, MKBastionSheet } = await import("../scripts/bastion-sheet/sheet.js");

function fixture(upgrades = [], type = "castle") {
  const state = { type, upgrades };
  const warnings = [];
  const actor = {
    items: [], system: {}, updates: [],
    getFlag: () => state,
    async update(change) {
      this.updates.push(change);
      if (change["flags.mk-shadowdark.bastion.upgrades"]) state.upgrades = change["flags.mk-shadowdark.bastion.upgrades"];
      if (change["flags.mk-shadowdark.bastion.type"]) state.type = change["flags.mk-shadowdark.bastion.type"];
    }
  };
  globalThis.game = { user: { isGM: true } };
  globalThis.ui = { notifications: { warn: message => warnings.push(message) } };
  const sheet = new MKBastionSheet(actor);
  return {
    actor, state, sheet, warnings,
    toggle: (key, build) => sheet._onToggleBastionUpgrade({ currentTarget: { dataset: { upgradeKey: key, upgradeBuild: String(build) } } })
  };
}

test("only the six requested Bastion upgrades have three independent build controls", () => {
  const upgrades = buildUpgradeData([], 20, true);
  assert.deepEqual(upgrades.filter(upgrade => upgrade.builds.length === 3).map(upgrade => upgrade.key),
    ["aviary", "barracks", "idol", "library", "temple", "wizardTower"]);
  assert.ok(upgrades.filter(upgrade => !upgrade.repeatable).every(upgrade => upgrade.builds.length === 1));
  assert.equal(getUpgradeBuildKey("aviary", 4), null);
  assert.equal(getUpgradeBuildKey("vault", 2), null);
});

test("legacy installed upgrades retain their first checkmark and invalid build keys are ignored", () => {
  const f = fixture(["aviary", "vault", "aviary", "aviary:2", "aviary:4", "vault:2", "unknown"]);
  assert.deepEqual(getBastionState(f.actor).upgrades, ["aviary", "vault", "aviary:2"]);
  assert.deepEqual(normalizeBastionUpgrades(null), []);
  const aviary = buildUpgradeData(["aviary"], 20, true).find(upgrade => upgrade.key === "aviary");
  assert.deepEqual(aviary.builds.map(build => build.installed), [true, false, false]);
});

test("each repeated build persists independently and unchecking one preserves the others", async () => {
  const f = fixture();
  await f.toggle("aviary", 1);
  await f.toggle("aviary", 2);
  await f.toggle("aviary", 3);
  assert.deepEqual(f.state.upgrades, ["aviary", "aviary:2", "aviary:3"]);
  await f.toggle("aviary", 2);
  assert.deepEqual(f.state.upgrades, ["aviary", "aviary:3"]);
  const data = (await f.sheet.getData()).mk.bastion;
  assert.equal(data.installedCount, 2);
  assert.deepEqual(data.upgrades.find(upgrade => upgrade.key === "aviary").builds.map(build => build.installed), [true, false, true]);
});

test("repeated builds consume the total limit and installed builds remain removable at capacity", async () => {
  const f = fixture(["aviary", "aviary:2", "aviary:3"], "house");
  await f.toggle("library", 1);
  assert.equal(f.actor.updates.length, 0);
  assert.equal(f.warnings.length, 1);
  const data = (await f.sheet.getData()).mk.bastion;
  assert.equal(data.installedCount, 3);
  assert.equal(data.upgradeLimit, 3);
  assert.ok(data.upgrades.find(upgrade => upgrade.key === "aviary").builds.every(build => build.canInstall));
  assert.ok(data.upgrades.find(upgrade => upgrade.key === "library").builds.every(build => !build.canInstall));
  await f.toggle("aviary", 2);
  await f.toggle("library", 3);
  assert.deepEqual(f.state.upgrades, ["aviary", "aviary:3", "library:3"]);
});

test("a fourth repeated build and duplicate builds for single-build upgrades cannot be saved", async () => {
  const f = fixture(["aviary", "aviary:2", "aviary:3", "vault"]);
  await f.toggle("aviary", 4);
  await f.toggle("vault", 2);
  await f.toggle("unknown", 1);
  assert.equal(f.actor.updates.length, 0);
});

test("rapid checkmark clicks preserve every build and cannot exceed the total capacity", async () => {
  const f = fixture([], "house");
  const update = f.actor.update.bind(f.actor);
  f.actor.update = async change => {
    await new Promise(resolve => setImmediate(resolve));
    return update(change);
  };
  await Promise.all([f.toggle("aviary", 1), f.toggle("aviary", 2), f.toggle("aviary", 3), f.toggle("library", 1)]);
  assert.deepEqual(f.state.upgrades, ["aviary", "aviary:2", "aviary:3"]);
  assert.equal(f.actor.updates.length, 3);
  assert.equal(f.warnings.length, 1);
});

test("changing Bastion type counts every repeated build toward the new structure's limit", async () => {
  const f = fixture(["aviary", "aviary:2", "aviary:3", "library"]);
  await f.sheet._onChangeBastionType({ currentTarget: { value: "house" } });
  assert.equal(f.actor.updates.length, 0);
  assert.match(f.warnings[0], /Remove 1 upgrade/);
  assert.equal(f.state.type, "castle");
});

test("repeat controls keep Bastion editing restricted to GMs and Vault availability unchanged", async () => {
  const f = fixture(["vault", "aviary:2"]);
  const data = (await f.sheet.getData()).mk.bastion;
  assert.equal(data.hasVault, true);
  assert.equal(data.installedCount, 2);
  assert.equal(data.upgrades.find(upgrade => upgrade.key === "aviary").installed, true);
  game.user.isGM = false;
  await f.toggle("aviary", 3);
  assert.equal(f.actor.updates.length, 0);
  assert.ok((await f.sheet.getData()).mk.bastion.upgrades.every(upgrade => upgrade.builds.every(build => !build.canInstall)));
});
