const INSTALLED = Symbol.for("mk-shadowdark.activeEffectClassValues");

export function installActiveEffectClassValues(environment = globalThis) {
  if (environment.game?.system?.id !== "shadowdark") return false;
  const prototype = environment.CONFIG?.ActiveEffect?.documentClass?.prototype;
  if (typeof prototype?.applyRules !== "function") return false;
  if (prototype[INSTALLED]) return true;

  const applyRules = prototype.applyRules;
  prototype.applyRules = function(actor, change, ...args) {
    // Class grants are literal slugs. Parsing names such as "daemonsmith" as
    // dice fails before Foundry can apply its native Add-to-array change.
    if (change?.key === "system.spellcasting.classes" && typeof change.value === "string") return;
    return applyRules.call(this, actor, change, ...args);
  };
  Object.defineProperty(prototype, INSTALLED, { value: true });
  return true;
}

export function registerActiveEffectClassValues(environment = globalThis) {
  // World actors prepare before setup; setup alone is too late for their effects.
  environment.Hooks.once("init", () => installActiveEffectClassValues(environment));
  environment.Hooks.once("setup", () => installActiveEffectClassValues(environment));
}

if (globalThis.Hooks) registerActiveEffectClassValues();
