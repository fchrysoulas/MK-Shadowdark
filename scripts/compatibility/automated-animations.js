(() => {
  "use strict";

  const AUTOMATED_ANIMATIONS_MODULE_ID = "autoanimations";

  Hooks.on("preCreateChatMessage", (message, data) => {
    if (globalThis.game?.system?.id !== "shadowdark") return;
    if (!game.modules?.get(AUTOMATED_ANIMATIONS_MODULE_ID)?.active) return;

    const rollConfig =
      message?.flags?.shadowdark?.rollConfig ??
      data?.flags?.shadowdark?.rollConfig;

    const itemUuid = rollConfig?.itemUuid;
    if (!itemUuid) return;

    // Do not replace a native top-level item UUID if Shadowdark adds one later.
    const existingItemUuid =
      message?.flags?.shadowdark?.itemUuid ??
      data?.flags?.shadowdark?.itemUuid;
    if (existingItemUuid) return;

    // AA 6.x on Foundry v13 only inspects the top-level system item UUID.
    // Shadowdark 4.x stores it inside rollConfig, so expose a redundant flag
    // without altering the native roll configuration or rendered chat card.
    message.updateSource({
      "flags.shadowdark.itemUuid": itemUuid,
    });
  });
})();
