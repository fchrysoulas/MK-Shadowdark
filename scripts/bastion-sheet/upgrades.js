import { BASTION_UPGRADES } from "./constants.js";

const pendingUpgradeUpdates = new WeakMap();

async function queueUpgradeUpdate(actor, callback) {
  // Read the latest saved build state after earlier clicks finish updating the Actor.
  const previous = pendingUpgradeUpdates.get(actor) ?? Promise.resolve();
  const update = previous.catch(() => {}).then(callback);
  pendingUpgradeUpdates.set(actor, update);
  try {
    return await update;
  } finally {
    if (pendingUpgradeUpdates.get(actor) === update) pendingUpgradeUpdates.delete(actor);
  }
}

function getUpgradeBuildKey(key, build = 1) {
  const upgrade = BASTION_UPGRADES.find(upgrade => upgrade.key === key);
  if (!upgrade || !Number.isInteger(build) || build < 1 || build > (upgrade.maxBuilds ?? 1)) return null;
  // Keep the first build's legacy key; additional builds share the existing upgrades array.
  return build === 1 ? key : `${key}:${build}`;
}

const validBuildKeys = new Set(BASTION_UPGRADES.flatMap(upgrade =>
  Array.from({ length: upgrade.maxBuilds ?? 1 }, (_, index) => getUpgradeBuildKey(upgrade.key, index + 1))));

function normalizeBastionUpgrades(upgrades) {
  return Array.isArray(upgrades) ? [...new Set(upgrades.filter(key => validBuildKeys.has(key)))] : [];
}

function buildUpgradeData(upgrades, upgradeLimit, canEdit) {
  const normalized = normalizeBastionUpgrades(upgrades);
  const installed = new Set(normalized);
  return BASTION_UPGRADES.map(upgrade => {
    const maxBuilds = upgrade.maxBuilds ?? 1;
    const builds = Array.from({ length: maxBuilds }, (_, index) => {
      const number = index + 1;
      const active = installed.has(getUpgradeBuildKey(upgrade.key, number));
      return {
        number,
        installed: active,
        canInstall: Boolean(canEdit && (active || normalized.length < upgradeLimit))
      };
    });
    return {
      ...upgrade,
      maxBuilds,
      repeatable: maxBuilds > 1,
      builds,
      installed: builds.some(build => build.installed),
      canInstall: builds.some(build => build.canInstall)
    };
  });
}

export { buildUpgradeData, getUpgradeBuildKey, normalizeBastionUpgrades, queueUpgradeUpdate };
