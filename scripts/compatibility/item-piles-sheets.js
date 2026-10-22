const MODULE_ID = "mk-shadowdark";

export function installItemPilesSheetPaths(environment = globalThis) {
  if (!environment.game?.modules?.get?.("item-piles")?.active) return false;
  const registry = environment.CONFIG?.Actor?.sheetClasses;
  if (!registry) return false;
  const types = ["boat", "bastion"].filter(type => registry[`${MODULE_ID}.${type}`]);
  if (!types.length) return false;

  let namespace = Object.getOwnPropertyDescriptor(registry, MODULE_ID);
  if (namespace && (namespace.enumerable || !namespace.value || typeof namespace.value !== "object")) return false;
  if (!namespace) {
    // Item Piles interpolates dotted actor types into libWrapper paths. Keep
    // a nested alias invisible to Foundry's and Item Piles' type enumeration.
    Object.defineProperty(registry, MODULE_ID, { value: Object.create(null), configurable: true });
    namespace = Object.getOwnPropertyDescriptor(registry, MODULE_ID);
  }
  for (const type of types) {
    if (Object.hasOwn(namespace.value, type)) continue;
    Object.defineProperty(namespace.value, type, {
      get: () => registry[`${MODULE_ID}.${type}`], configurable: true
    });
  }
  return true;
}

export function registerItemPilesSheetPaths(environment = globalThis) {
  // Pending sheet registrations finish after setup. Item Piles installs its
  // wrappers in a timer after ready, so these aliases exist before that timer.
  environment.Hooks.once("ready", () => installItemPilesSheetPaths(environment));
}

if (globalThis.Hooks) registerItemPilesSheetPaths();
