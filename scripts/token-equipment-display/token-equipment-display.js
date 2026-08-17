import {
  equipmentChangeTouchesClassification,
  getItemHandUse,
  hasEquipmentPathChange,
  isStashed
} from "../libs/equipment.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Token Equipment";
  const OVERLAY_PROP = "_mkTokenEquipmentOverlay";
  const OVERLAY_NAME = "mk-token-equipment-overlay";
  const QUICKDRAW_FLAG = "quickdraw";
  const HAND_SIDE_FLAG = "handSide";
  const REFRESH_DELAY_MS = 40;

  const actorRefreshTimers = new Map();
  let secondaryHandFilter = null;

  function getModuleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function setting(key, fallback) {
    try {
      if (!game.settings?.settings?.has(`${MODULE_ID}.${key}`)) return fallback;
      return game.settings.get(MODULE_ID, key);
    } catch (_err) {
      return fallback;
    }
  }

  function debug(...args) {
    if (!setting("tokenEquipmentDebug", false)) return;
    console.log(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function warn(...args) {
    console.warn(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function colorNumber(value, fallback) {
    const normalized = String(value ?? "").trim().replace(/^#/, "");
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return fallback;
    return Number.parseInt(normalized, 16);
  }

  function getSecondaryHandFilter() {
    if (secondaryHandFilter) return secondaryHandFilter;

    const ColorMatrixFilter = PIXI.ColorMatrixFilter ?? PIXI.filters?.ColorMatrixFilter;
    if (!ColorMatrixFilter) return null;

    try {
      secondaryHandFilter = new ColorMatrixFilter();
      secondaryHandFilter.desaturate();
      return secondaryHandFilter;
    } catch (error) {
      warn("Could not create the two-handed occupancy grayscale filter.", error);
      return null;
    }
  }

  function isPlayerActor(actor) {
    if (!actor) return false;
    return actor.type === "Player" || actor.system?.isPC === true;
  }

  function canSeeOverlay(actor) {
    const visibility = String(setting("tokenEquipmentVisibility", "everyone"));
    if (visibility === "gm") return Boolean(game.user?.isGM);
    if (visibility === "owner") return Boolean(actor?.isOwner || game.user?.isGM);
    return true;
  }

  function itemSort(left, right) {
    const sortDifference = Number(left?.sort ?? left?.item?.sort ?? 0)
      - Number(right?.sort ?? right?.item?.sort ?? 0);
    if (sortDifference) return sortDifference;

    const leftName = String(left?.name ?? left?.item?.name ?? "");
    const rightName = String(right?.name ?? right?.item?.name ?? "");
    return leftName.localeCompare(rightName, game.i18n?.lang, { sensitivity: "base" });
  }

  function ignoreStashedItems() {
    return Boolean(setting("equipmentHandsIgnoreStashed", true));
  }

  function getHeldEntries(actor) {
    return Array.from(actor?.items ?? [])
      .map(item => getItemHandUse(item, null, { ignoreStashed: ignoreStashedItems() }))
      .filter(Boolean)
      .sort(itemSort);
  }

  function getQuickdrawItems(actor, heldIds) {
    if (!setting("tokenEquipmentShowQuickdraw", true)) return [];

    return Array.from(actor?.items ?? [])
      .filter(item => {
        if (heldIds.has(item.id)) return false;
        if (isStashed(item)) return false;
        return Boolean(item.getFlag?.(MODULE_ID, QUICKDRAW_FLAG));
      })
      .sort(itemSort);
  }

  function handSideFlag(item) {
    const side = String(item?.getFlag?.(MODULE_ID, HAND_SIDE_FLAG) ?? "").toLowerCase();
    return ["left", "right"].includes(side) ? side : "";
  }

  function inferPreferredSide(entry) {
    if (entry.isShield) return "left";
    if (entry.isWeapon) return "right";
    return "left";
  }

  function assignHandSides(entries) {
    const oneHanded = entries.filter(entry => Number(entry.hands) === 1);
    const result = [];
    const counts = { left: 0, right: 0 };

    for (const entry of oneHanded) {
      const explicit = handSideFlag(entry.item);
      if (!explicit) continue;
      result.push({ ...entry, side: explicit, explicit: true });
      counts[explicit] += 1;
    }

    for (const entry of oneHanded) {
      if (result.some(candidate => candidate.id === entry.id)) continue;

      const preferred = inferPreferredSide(entry);
      const opposite = preferred === "left" ? "right" : "left";
      const side = counts[preferred] === 0
        ? preferred
        : counts[opposite] === 0
          ? opposite
          : counts.left <= counts.right ? "left" : "right";

      result.push({ ...entry, side, explicit: false });
      counts[side] += 1;
    }

    return result.sort(itemSort);
  }

  function removeOverlay(token) {
    const overlay = token?.[OVERLAY_PROP];
    if (overlay && !overlay.destroyed) {
      if (overlay.parent) overlay.parent.removeChild(overlay);
      overlay.destroy({ children: true, texture: false, baseTexture: false });
    }
    if (token) token[OVERLAY_PROP] = null;
  }

  function makeIconFrame(
    item,
    size,
    { quickdraw = false, side = "", heldEntries = [], secondaryHand = false } = {}
  ) {
    const frame = new PIXI.Container();
    frame.name = `mk-token-item-${item.id}`;
    frame.eventMode = "static";
    frame.interactive = true;
    frame.cursor = "pointer";
    frame.hitArea = new PIXI.Rectangle(-size / 2, -size / 2, size, size);
    frame.alpha = quickdraw
      ? clamp(setting("tokenEquipmentQuickdrawOpacity", 1), 0.1, 1, 1)
      : clamp(setting("tokenEquipmentHeldOpacity", 1), 0.1, 1, 1);

    const borderEnabled = Boolean(setting("tokenEquipmentBorderEnabled", true));

    if (borderEnabled) {
      const borderWidth = size * clamp(setting("tokenEquipmentBorderWidth", 0.055), 0.01, 0.15, 0.055);
      const configuredBorderColor = quickdraw
        ? colorNumber(setting("tokenEquipmentQuickdrawBorderColor", "#d9bd70"), 0xd9bd70)
        : colorNumber(setting("tokenEquipmentHeldBorderColor", "#f1dfaa"), 0xf1dfaa);
      const borderColor = secondaryHand ? 0x8b8b8b : configuredBorderColor;
      const border = new PIXI.Graphics();
      border.eventMode = "none";
      border.interactive = false;
      border.lineStyle(Math.max(1, borderWidth), borderColor, 0.95);
      border.beginFill(0x17130f, 0.88);
      border.drawRoundedRect(-size / 2, -size / 2, size, size, Math.max(2, size * 0.14));
      border.endFill();
      frame.addChild(border);
    }

    const sprite = PIXI.Sprite.from(item.img || "icons/svg/item-bag.svg");
    sprite.name = `mk-token-item-image-${item.id}`;
    sprite.eventMode = "none";
    sprite.interactive = false;
    sprite.anchor.set(0.5);
    const artworkSize = borderEnabled ? size * 0.86 : size;
    sprite.width = artworkSize;
    sprite.height = artworkSize;

    if (secondaryHand) {
      const grayscale = getSecondaryHandFilter();
      if (grayscale) sprite.filters = [grayscale];
      else sprite.tint = 0x777777;
    }

    frame.addChild(sprite);

    frame.on("pointertap", event => {
      stopPointerEvent(event);
      void activateItem(item, event);
    });

    if (!quickdraw && side) {
      frame.on("rightclick", event => {
        stopPointerEvent(event);
        void swapHandSide(item, side, heldEntries);
      });
    }

    return frame;
  }

  function stopPointerEvent(event) {
    event?.stopPropagation?.();
    event?.nativeEvent?.stopPropagation?.();
    event?.data?.originalEvent?.stopPropagation?.();
    event?.data?.originalEvent?.preventDefault?.();
  }

  function getOriginalEvent(event) {
    return event?.nativeEvent ?? event?.data?.originalEvent ?? event;
  }

  async function activateItem(item, event) {
    if (!item) return;

    const action = String(setting("tokenEquipmentClickAction", "open"));
    if (action === "none") return;

    try {
      if (action === "open") {
        item.sheet?.render?.(true);
        return;
      }

      if (!item.isOwner && !game.user?.isGM) {
        ui.notifications?.warn?.(`You do not have permission to use ${item.name}.`);
        return;
      }

      await useItem(item, { skipPrompt: Boolean(getOriginalEvent(event)?.shiftKey) });
    } catch (error) {
      warn(`Could not ${action} ${item.name}.`, error);
      ui.notifications?.error?.(`Could not use ${item.name}. See the console for details.`);
    }
  }

  async function useItem(item, config = {}) {
    const actor = item.parent;
    const system = item.system ?? {};

    if (system.light?.isSource && typeof actor?.sheet?._toggleLightSource === "function") {
      return actor.sheet._toggleLightSource(item);
    }

    if (system.isWand) return useWand(item, config);
    if (system.isScroll && typeof actor?.system?.castSpell === "function") {
      return actor.system.castSpell(system.spellUuid, { itemUuid: item.uuid, ...config });
    }
    if (system.isSpell && typeof actor?.system?.castSpell === "function") {
      return actor.system.castSpell(item.uuid, config);
    }
    if (system.isAbility && typeof actor?.system?.useAbility === "function") {
      return actor.system.useAbility(item.uuid, config);
    }
    if (system.isWeapon && typeof actor?.system?.rollAttack === "function") {
      return actor.system.rollAttack(item.uuid, config);
    }
    if (String(item.type).toLowerCase() === "potion" && typeof actor?.system?.usePotion === "function") {
      return actor.system.usePotion(item.id);
    }

    const chat = globalThis.shadowdark?.chat ?? game.shadowdark?.chat;
    if (typeof chat?.showItemCard === "function") return chat.showItemCard(item.uuid);
    return item.sheet?.render?.(true);
  }

  async function useWand(item, config) {
    const actor = item.parent;
    const available = Array.from(item.system?.spells ?? []).filter(spell => !spell.lost && spell.uuid);

    if (!available.length) {
      ui.notifications?.warn?.(`${item.name} has no available spells.`);
      return;
    }

    let spellUuid = available[0].uuid;
    if (available.length > 1) {
      const DialogV2 = foundry.applications?.api?.DialogV2;
      if (!DialogV2?.prompt) {
        item.sheet?.render?.(true);
        return;
      }

      const spells = await Promise.all(available.map(spell => fromUuid(spell.uuid)));
      const escape = foundry.utils?.escapeHTML ?? (value => String(value));
      const options = spells.map((spell, index) => (
        `<option value="${escape(available[index].uuid)}">${escape(spell?.name ?? available[index].uuid)}</option>`
      )).join("");

      spellUuid = await DialogV2.prompt({
        window: { title: `Use ${item.name}` },
        content: `<select name="spell">${options}</select>`,
        ok: {
          label: "Use",
          callback: (_event, button) => button.form.elements.spell.value
        }
      });
    }

    if (!spellUuid) return;
    return actor?.system?.castSpell?.(spellUuid, { itemUuid: item.uuid, ...config });
  }

  async function swapHandSide(item, currentSide, heldEntries) {
    if (!item?.isOwner && !game.user?.isGM) {
      ui.notifications?.warn?.(`You do not have permission to assign ${item?.name ?? "this item"}.`);
      return;
    }

    const nextSide = currentSide === "left" ? "right" : "left";
    const other = heldEntries.find(entry => (
      entry.id !== item.id
      && Number(entry.hands) === 1
      && entry.side === nextSide
    ));

    try {
      const updates = [item.setFlag(MODULE_ID, HAND_SIDE_FLAG, nextSide)];
      if (other?.item?.isOwner || game.user?.isGM) {
        updates.push(other.item.setFlag(MODULE_ID, HAND_SIDE_FLAG, currentSide));
      }
      await Promise.all(updates);
      ui.notifications?.info?.(`${item.name} assigned to the ${nextSide} hand.`);
    } catch (error) {
      warn(`Could not change the hand assignment for ${item.name}.`, error);
    }
  }

  function heldAnchorY(tokenHeight, size) {
    const anchor = String(setting("tokenEquipmentHeldAnchor", "center"));
    if (anchor === "top") return size * 0.55;
    if (anchor === "bottom") return tokenHeight - size * 0.55;
    return tokenHeight / 2;
  }

  function layoutHeldIcons(root, token, entries, gridSize) {
    const size = gridSize * clamp(setting("tokenEquipmentHeldScale", 0.38), 0.15, 0.8, 0.38);
    const offsetX = gridSize * clamp(setting("tokenEquipmentHeldOffsetX", 0), -2, 2, 0);
    const offsetY = gridSize * clamp(setting("tokenEquipmentHeldOffsetY", 0), -2, 2, 0);
    const tokenWidth = Number(token.w ?? gridSize);
    const tokenHeight = Number(token.h ?? gridSize);
    const assigned = assignHandSides(entries);
    const sideDisplays = {
      left: assigned.filter(entry => entry.side === "left").map(entry => ({
        ...entry,
        secondaryHand: false
      })),
      right: assigned.filter(entry => entry.side === "right").map(entry => ({
        ...entry,
        secondaryHand: false
      }))
    };

    for (const entry of entries.filter(candidate => Number(candidate.hands) >= 2)) {
      const primarySide = handSideFlag(entry.item) || "right";
      const secondarySide = primarySide === "left" ? "right" : "left";
      sideDisplays[primarySide].push({ ...entry, side: primarySide, secondaryHand: false });
      sideDisplays[secondarySide].push({ ...entry, side: secondarySide, secondaryHand: true });
    }

    for (const side of ["left", "right"]) {
      const sideEntries = sideDisplays[side].sort(itemSort);
      const step = size * 0.82;
      const startY = heldAnchorY(tokenHeight, size) - ((sideEntries.length - 1) * step) / 2;
      const x = side === "left" ? -size * 0.08 : tokenWidth + size * 0.08;

      sideEntries.forEach((entry, index) => {
        const frame = makeIconFrame(entry.item, size, {
          side: Number(entry.hands) === 1 ? side : "",
          heldEntries: assigned,
          secondaryHand: entry.secondaryHand
        });
        frame.position.set(x + offsetX, startY + index * step + offsetY);
        root.addChild(frame);
      });
    }

    return {
      size,
      assigned,
      hasLeft: sideDisplays.left.length > 0,
      hasRight: sideDisplays.right.length > 0
    };
  }

  function layoutQuickdrawIcons(root, token, items, gridSize, heldLayout) {
    if (!items.length) return;

    const size = gridSize * clamp(setting("tokenEquipmentQuickdrawScale", 0.22), 0.1, 0.55, 0.22);
    const offsetX = gridSize * clamp(setting("tokenEquipmentQuickdrawOffsetX", 0), -2, 2, 0);
    const offsetY = gridSize * clamp(setting("tokenEquipmentQuickdrawOffsetY", 0.08), -2, 2, 0.08);
    const anchor = String(setting("tokenEquipmentQuickdrawAnchor", "bottom"));
    const tokenWidth = Number(token.w ?? gridSize);
    const tokenHeight = Number(token.h ?? gridSize);
    const padding = clamp(setting("tokenEquipmentQuickdrawPadding", 0.1), 0, 1.5, 0.1);
    const step = size * (1 + padding);

    if (anchor === "left" || anchor === "right") {
      const startY = tokenHeight / 2 - ((items.length - 1) * step) / 2;
      const occupied = anchor === "left" ? heldLayout.hasLeft : heldLayout.hasRight;
      const extra = occupied ? heldLayout.size * 0.75 : 0;
      const x = anchor === "left"
        ? -size * 0.6 - extra
        : tokenWidth + size * 0.6 + extra;

      items.forEach((item, index) => {
        const frame = makeIconFrame(item, size, { quickdraw: true });
        frame.position.set(x + offsetX, startY + index * step + offsetY);
        root.addChild(frame);
      });
      return;
    }

    const startX = tokenWidth / 2 - ((items.length - 1) * step) / 2;
    const y = anchor === "top"
      ? -size * 0.62
      : tokenHeight + size * 0.62;

    items.forEach((item, index) => {
      const frame = makeIconFrame(item, size, { quickdraw: true });
      frame.position.set(startX + index * step + offsetX, y + offsetY);
      root.addChild(frame);
    });
  }

  function renderTokenOverlay(token) {
    if (!canvas?.ready || !token || token.destroyed) return;

    removeOverlay(token);

    const actor = token.actor ?? token.document?.actor;
    if (!setting("tokenEquipmentEnabled", true)) return;
    if (game.system?.id !== "shadowdark") return;
    if (!isPlayerActor(actor) || !canSeeOverlay(actor)) return;

    const heldEntries = getHeldEntries(actor);
    const heldIds = new Set(heldEntries.map(entry => entry.id));
    const quickdrawItems = getQuickdrawItems(actor, heldIds);
    if (!heldEntries.length && !quickdrawItems.length) return;

    const root = new PIXI.Container();
    root.name = OVERLAY_NAME;
    root.eventMode = "passive";
    root.interactiveChildren = true;
    root.cullable = false;
    token[OVERLAY_PROP] = root;
    token.addChild(root);

    const gridSize = Number(canvas.grid?.size ?? 100);
    const heldLayout = layoutHeldIcons(root, token, heldEntries, gridSize);
    layoutQuickdrawIcons(root, token, quickdrawItems, gridSize, heldLayout);

    debug("rendered", {
      token: token.name,
      actor: actor.name,
      held: heldEntries.map(entry => entry.name),
      quickdraw: quickdrawItems.map(item => item.name)
    });
  }

  function refreshAll() {
    if (!canvas?.ready || !canvas.tokens) return;
    for (const token of canvas.tokens.placeables ?? []) renderTokenOverlay(token);
  }

  function actorMatchesToken(actor, token) {
    if (!actor || !token) return false;
    if (token.actor === actor || token.document?.actor === actor) return true;
    if (actor.isToken) return false;
    return token.actor?.id === actor.id;
  }

  function refreshActor(actor) {
    if (!canvas?.ready || !actor) return;
    for (const token of canvas.tokens?.placeables ?? []) {
      if (actorMatchesToken(actor, token)) renderTokenOverlay(token);
    }
  }

  function scheduleActorRefresh(actor) {
    if (!actor) return;
    const key = actor.uuid ?? actor.id;
    if (!key) return;

    const existing = actorRefreshTimers.get(key);
    if (existing) window.clearTimeout(existing);

    actorRefreshTimers.set(key, window.setTimeout(() => {
      actorRefreshTimers.delete(key);
      refreshActor(actor);
    }, REFRESH_DELAY_MS));
  }

  function ownedActorForItem(item) {
    return item?.parent?.documentName === "Actor" ? item.parent : null;
  }

  function itemChangesMayAffectOverlay(changes) {
    if (equipmentChangeTouchesClassification(changes)) return true;

    return [
      "img",
      "name",
      "sort",
      `flags.${MODULE_ID}.${QUICKDRAW_FLAG}`,
      `flags.${MODULE_ID}.${HAND_SIDE_FLAG}`
    ].some(path => hasEquipmentPathChange(changes, path));
  }

  function tokenChangesMayAffectOverlay(changes) {
    return [
      "width",
      "height",
      "actorId",
      "actorLink",
      "texture.scaleX",
      "texture.scaleY"
    ].some(path => hasEquipmentPathChange(changes, path));
  }

  function actorChangesMayAffectEquipment(changes) {
    return ["items", "ownership"].some(path => hasEquipmentPathChange(changes, path));
  }

  Hooks.once("ready", () => {
    const mod = game.modules.get(MODULE_ID);
    if (mod) {
      mod.api = mod.api ?? {};
      mod.api.tokenEquipment = {
        refreshAll,
        refreshActor,
        renderTokenOverlay,
        removeOverlay,
        getHeldEntries,
        getQuickdrawItems
      };
    }

    if (canvas?.ready) refreshAll();
    console.log(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | ready`);
  });

  Hooks.on("canvasReady", refreshAll);
  Hooks.on("drawToken", renderTokenOverlay);

  Hooks.on("updateToken", (tokenDocument, changes) => {
    if (!tokenChangesMayAffectOverlay(changes)) return;
    const token = tokenDocument?.object;
    if (token) renderTokenOverlay(token);
  });

  Hooks.on("createToken", tokenDocument => {
    window.setTimeout(() => {
      if (tokenDocument?.object) renderTokenOverlay(tokenDocument.object);
    }, REFRESH_DELAY_MS);
  });

  Hooks.on("deleteToken", tokenDocument => {
    if (tokenDocument?.object) removeOverlay(tokenDocument.object);
  });

  Hooks.on("createItem", item => scheduleActorRefresh(ownedActorForItem(item)));
  Hooks.on("updateItem", (item, changes) => {
    if (itemChangesMayAffectOverlay(changes)) scheduleActorRefresh(ownedActorForItem(item));
  });
  Hooks.on("deleteItem", item => scheduleActorRefresh(ownedActorForItem(item)));
  Hooks.on("updateActor", (actor, changes) => {
    if (actorChangesMayAffectEquipment(changes)) scheduleActorRefresh(actor);
  });
})();
