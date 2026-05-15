/*
 * Shadowdark Extras - Death Timer
 * Foundry VTT v12
 *
 * Settings are registered in scripts/settings.js.
 */

(() => {
  // scripts/death-timer.js
  // Shadowdark Extras - Death Timer (NO HBS MODS)
  // Skull-only button with tooltip.
  // HP <= 0 logic:
  // - First click at 0 HP: roll 1d4 + CON mod (min 1), add condition "Death Timer (X)"
  // - Subsequent clicks at 0 HP: roll 1d20
  //   - 20: remove condition and set HP to 1
  //   - 1: reduce timer by 2
  //   - 2-19: reduce timer by 1
  // - When timer reaches 0: remove "Death Timer" and add the system's built-in Dead status
  // - If the actor gains HP at any time: remove Death Timer and Dead automatically

  const MODULE_ID = "shadowdark-extras";
  const SUBMODULE = "DeathTimer";
  const DT_VERSION = "1.5.3";

  function dtLog(...args) {
    console.log(`${MODULE_ID} | ${SUBMODULE} v${DT_VERSION} |`, ...args);
  }

  function numOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function getDeathTimerIcon(turns) {
    const n = Number(turns) || 0;

    if (n <= 1) return "modules/shadowdark-extras/assets/icons/blood-drop-red-1.png";
    if (n === 2) return "modules/shadowdark-extras/assets/icons/blood-drop-red-2.png";
    if (n === 3) return "modules/shadowdark-extras/assets/icons/blood-drop-red-3.png";
    return "modules/shadowdark-extras/assets/icons/blood-drop-red-4.png";
  }

  function getConMod(actor) {
    const gp = foundry.utils.getProperty;

    const modCandidates = [
      gp(actor, "system.abilities.con.mod"),
      gp(actor, "system.abilities.con.modifier"),
      gp(actor, "system.abilities.con.bonus"),
      gp(actor, "system.attributes.con.mod"),
      gp(actor, "system.con.mod"),
      gp(actor, "system.conMod"),
    ].map(numOrNull).filter(v => v !== null);

    if (modCandidates.length) return modCandidates[0];

    const scoreCandidates = [
      gp(actor, "system.abilities.con.value"),
      gp(actor, "system.abilities.con.score"),
      gp(actor, "system.attributes.con.value"),
      gp(actor, "system.con.value"),
    ].map(numOrNull).filter(v => v !== null);

    if (scoreCandidates.length) {
      const score = scoreCandidates[0];
      return Math.floor((score - 10) / 2);
    }

    return 0;
  }

  function getHpPathAndValue(actor) {
    const gp = foundry.utils.getProperty;

    const candidates = [
      "system.attributes.hp.value",
      "system.attributes.hp.current",
      "system.hp.value",
      "system.hp.current",
      "system.hp",
    ];

    for (const path of candidates) {
      const v = numOrNull(gp(actor, path));
      if (v !== null) return { path, value: v };
    }

    return { path: null, value: null };
  }

  function getHpValueFromSource(source) {
    const gp = foundry.utils.getProperty;

    const candidates = [
      "system.attributes.hp.value",
      "system.attributes.hp.current",
      "system.hp.value",
      "system.hp.current",
      "system.hp",
    ];

    for (const path of candidates) {
      const v = numOrNull(gp(source, path));
      if (v !== null) return v;
    }

    return null;
  }

  async function setHp(actor, newValue) {
    const { path } = getHpPathAndValue(actor);
    if (!path) return false;
    await actor.update({ [path]: newValue });
    return true;
  }

  function ensureStylesOnce() {
    const id = "sdx-death-timer-style";
    if (document.getElementById(id)) return;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      .SD-header { position: relative; }

      .sdx-death-timer-wrap{
        position:absolute;
        top:6px;
        right:6px;
        padding:0;
        background: transparent;
        border: 0;
        z-index: 50;
        pointer-events: auto;
      }

      .sdx-death-timer-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        padding:4px 6px;
        border:1px solid var(--color-border-light-primary, rgba(0,0,0,0.35));
        border-radius:6px;
        background:#ffffff !important;
        color:#000000 !important;
        cursor:pointer;
        font-size:12px;
        line-height:1;
        white-space:nowrap;
        box-shadow:none;
        min-width:26px;
        min-height:22px;
      }

      .sdx-death-timer-btn i { margin: 0; color: inherit !important; }
      .sdx-death-timer-btn:hover{ filter: brightness(0.97); }
    `;
    document.head.appendChild(style);
  }

  function asJQ(html) {
    if (!html) return null;
    if (html.jquery) return html;
    try { return $(html); } catch { return null; }
  }

  function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function escapeAttribute(value) {
    return escapeHTML(value).replace(/"/g, "&quot;");
  }


  function normalizeBuiltInDeadStatusConfig() {
    const effects = CONFIG.statusEffects ?? [];

    const dead = effects.find(se => {
      const id = String(se?.id ?? "").toLowerCase();
      const raw = String(se?.name ?? se?.label ?? se?.title ?? "").toLowerCase();
      return (
        id === "dead" ||
        raw === "dead" ||
        raw === "effect.statusdead" ||
        raw === "effect.status.dead"
      );
    });

    if (!dead) return;

    dead.name = "Dead";
    dead.label = "Dead";
    dead.title = "Dead";
    dead.description = "Dead";
  }

  function getBuiltInDeadStatus() {
    const effects = CONFIG.statusEffects ?? [];
    return effects.find(se => {
      const id = String(se?.id ?? "").toLowerCase();
      const name = String(se?.name ?? se?.label ?? se?.title ?? "").toLowerCase();
      return id === "dead" || name === "dead";
    }) ?? null;
  }

  function getBuiltInDeadStatusId() {
    return getBuiltInDeadStatus()?.id ?? "dead";
  }

  function getBuiltInDeadStatusLabel() {
    const se = getBuiltInDeadStatus();
    const raw = String(se?.name ?? se?.label ?? se?.title ?? "Dead");

    if (!raw) return "Dead";
    if (/^effect\./i.test(raw)) return "Dead";

    return raw;
  }

  function getBuiltInDeadStatusIcon() {
    const se = getBuiltInDeadStatus();
    return se?.img ?? se?.icon ?? "icons/svg/skull.svg";
  }

  function effectHasStatus(effect, statusId) {
    if (!effect) return false;
    if (effect.statuses?.has?.(statusId)) return true;
    if (Array.isArray(effect.statuses) && effect.statuses.includes(statusId)) return true;
    if (effect.getFlag?.("core", "statusId") === statusId) return true;
    if (effect.flags?.core?.statusId === statusId) return true;
    return false;
  }

  function findDeathTimerEffect(actor) {
    return actor.effects.find(e => e.getFlag(MODULE_ID, "isDeathTimer") === true)
      || actor.effects.find(e => typeof e.name === "string" && e.name.startsWith("Death Timer ("));
  }

  function findDeadEffect(actor) {
    const statusId = getBuiltInDeadStatusId();
    const label = getBuiltInDeadStatusLabel().toUpperCase();

    return actor.effects.find(e => effectHasStatus(e, statusId))
      || actor.effects.find(e => e.getFlag(MODULE_ID, "isDeadCondition") === true)
      || actor.effects.find(e => typeof e.name === "string" && e.name.toUpperCase() === label)
      || actor.effects.find(e => typeof e.name === "string" && e.name.toUpperCase() === "DEAD");
  }

  function getDeathTimerTurns(actor) {
    const flagged = actor.getFlag(MODULE_ID, "deathTimer");
    if (flagged?.turns !== undefined && flagged?.turns !== null) return Number(flagged.turns);

    const eff = findDeathTimerEffect(actor);
    const t = eff?.getFlag(MODULE_ID, "turns");
    if (t !== undefined && t !== null) return Number(t);

    if (eff?.name) {
      const m = eff.name.match(/Death Timer\s*\((\d+)\)/i);
      if (m) return Number(m[1]);
    }

    return null;
  }

  async function upsertDeathTimerEffect(actor, turns) {
    const name = `Death Timer (${turns})`;
    const icon = getDeathTimerIcon(turns);

    const data = {
      name,
      icon,
      disabled: false,
      changes: [],
      flags: {
        [MODULE_ID]: {
          isDeathTimer: true,
          turns
        },
        core: {
          statusId: "sdx-death-timer"
        }
      }
    };

    const existing = findDeathTimerEffect(actor);
    if (existing) {
      await existing.update(data);
    } else {
      await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    }
  }

  async function removeDeathTimerEffect(actor) {
    const effects = actor.effects.filter(e =>
      e.getFlag(MODULE_ID, "isDeathTimer") === true ||
      (typeof e.name === "string" && e.name.startsWith("Death Timer ("))
    );
    if (!effects.length) return;
    await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id));
  }

  async function upsertDeadEffect(actor) {
    const statusId = getBuiltInDeadStatusId();
    const icon = getBuiltInDeadStatusIcon();

    const data = {
      name: "Dead",
      description: "Dead",
      icon,
      statuses: [statusId],
      disabled: false,
      changes: [],
      flags: {
        [MODULE_ID]: {
          isDeadCondition: true
        },
        core: {
          statusId
        }
      }
    };

    const existing = findDeadEffect(actor);
    if (existing) {
      await existing.update(data);
    } else {
      await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    }
  }

  async function removeDeadEffect(actor) {
    const statusId = getBuiltInDeadStatusId();

    const effects = actor.effects.filter(e =>
      effectHasStatus(e, statusId) ||
      e.getFlag(MODULE_ID, "isDeadCondition") === true ||
      (typeof e.name === "string" && e.name.toUpperCase() === getBuiltInDeadStatusLabel().toUpperCase()) ||
      (typeof e.name === "string" && e.name.toUpperCase() === "DEAD")
    );

    if (!effects.length) return;
    await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id));
  }

  async function clearAllDeathState(actor) {
    if (actor.isOwner) {
      await removeDeathTimerEffect(actor);
      await removeDeadEffect(actor);
      await actor.unsetFlag(MODULE_ID, "deathTimer");
    }
  }

  async function setDeathTimerFlag(actor, turns, conMod = null) {
    if (!actor.isOwner) return;
    await actor.setFlag(MODULE_ID, "deathTimer", {
      turns,
      conMod,
      updatedAt: Date.now()
    });
  }

  async function clearDeathTimerFlag(actor) {
    if (!actor.isOwner) return;
    await actor.unsetFlag(MODULE_ID, "deathTimer");
  }

  async function startDeathTimer(actor) {
    const conMod = getConMod(actor);
    const minTurns = Number(game.settings.get(MODULE_ID, "deathTimerMinTurns") ?? 1);

    const timerRoll = new Roll("1d4 + @con", { con: conMod });
    await timerRoll.evaluate({ async: true });

    const turns = Math.max(minTurns, timerRoll.total ?? 1);

    const speaker = ChatMessage.getSpeaker({ actor });
    const rollMode = game.settings.get("core", "rollMode");

    const sign = conMod >= 0 ? "+" : "-";
    const abs = Math.abs(conMod);

    await timerRoll.toMessage(
      {
        speaker,
        flavor:
          `☠ <b>${actor.name}</b> - Death Timer started: <b>${turns}</b> turn(s). ` +
          `<span style="opacity:0.85">(1d4 ${sign} ${abs}, min ${minTurns})</span>`
      },
      { rollMode }
    );

    if (actor.isOwner) {
      await removeDeadEffect(actor);
      await upsertDeathTimerEffect(actor, turns);
      await setDeathTimerFlag(actor, turns, conMod);
    }

    return turns;
  }

  async function markDead(actor, speaker, rollMode) {
    if (actor.isOwner) {
      await removeDeathTimerEffect(actor);
      await clearDeathTimerFlag(actor);
      await upsertDeadEffect(actor);
    }

    await ChatMessage.create({
      speaker,
      content: `☠ <b>${actor.name}</b> is now <b>Dead</b>.`,
      whisper: rollMode === "gmroll" ? ChatMessage.getWhisperRecipients("GM").map(u => u.id) : undefined
    });
  }

  async function tickDeathTimer(actor, currentTurns) {
    const speaker = ChatMessage.getSpeaker({ actor });
    const rollMode = game.settings.get("core", "rollMode");

    const d20 = new Roll("1d20");
    await d20.evaluate({ async: true });

    const roll = d20.total ?? 0;

    if (roll === 20) {
      const ok = await setHp(actor, 1);

      await d20.toMessage(
        {
          speaker,
          flavor:
            `🎲 <b>${actor.name}</b> - Death Check: <b>20</b>. ` +
            `<span style="opacity:0.9">You revive and gain <b>1 HP</b>${ok ? "" : " (HP field not found)"}. Death Timer removed.</span>`
        },
        { rollMode }
      );

      if (actor.isOwner) {
        await removeDeathTimerEffect(actor);
        await clearDeathTimerFlag(actor);
        await removeDeadEffect(actor);
      }

      return { done: true, turns: null };
    }

    const delta = (roll === 1) ? 2 : 1;
    const nextTurns = Math.max(0, (Number(currentTurns) || 0) - delta);

    await d20.toMessage(
      {
        speaker,
        flavor:
          `🎲 <b>${actor.name}</b> - Death Check: <b>${roll}</b>. ` +
          `<span style="opacity:0.9">Timer reduced by <b>${delta}</b> - now <b>${nextTurns}</b> turn(s).</span>`
      },
      { rollMode }
    );

    if (nextTurns <= 0) {
      await markDead(actor, speaker, rollMode);
      return { done: true, turns: 0 };
    }

    if (actor.isOwner) {
      await upsertDeathTimerEffect(actor, nextTurns);
      await setDeathTimerFlag(actor, nextTurns);
    }

    return { done: false, turns: nextTurns };
  }

  Hooks.once("init", () => {
    dtLog("init (settings registered in settings.js)");
  });

  Hooks.once("ready", () => {
    ensureStylesOnce();
    normalizeBuiltInDeadStatusConfig();
    dtLog("ready | system:", game.system?.id, "| built-in DEAD:", getBuiltInDeadStatus());
  });

  async function onSkullClick(actor) {
    const hpInfo = getHpPathAndValue(actor);
    const hpValue = hpInfo.value ?? null;

    if (findDeadEffect(actor)) {
      ui?.notifications?.warn?.("This actor is already Dead.");
      return;
    }

    if (hpValue === null || hpValue > 0) {
      ui?.notifications?.warn?.("Death Timer can be used only at 0 HP.");
      return;
    }

    const existingTurns = getDeathTimerTurns(actor);

    if (existingTurns === null || Number.isNaN(existingTurns)) {
      await startDeathTimer(actor);
      return;
    }

    await tickDeathTimer(actor, existingTurns);
  }

  function handler(app, html) {
    try {
      if (!game.settings.get(MODULE_ID, "deathTimerEnabled")) return;
      if (game.system?.id !== "shadowdark") return;

      ensureStylesOnce();

      const actor = app?.actor;
      if (!actor) return;

      const $root = asJQ(html);
      if (!$root) return;

      const $header =
        $root.find(".SD-header").first().length ? $root.find(".SD-header").first()
        : $root.find("header.SD-header").first().length ? $root.find("header.SD-header").first()
        : $root.find("header.sheet-header, .sheet-header").first();

      if (!$header?.length) return;

      if ($root.find(".sdx-death-timer-wrap").length) return;

      const icon = game.settings.get(MODULE_ID, "deathTimerIcon") || "fa-solid fa-skull";
      const tooltip = game.settings.get(MODULE_ID, "deathTimerTooltip") || "Death Timer";
      const safeTooltip = escapeAttribute(tooltip);

      const $wrap = $(`
        <div class="sdx-death-timer-wrap">
          <button
            type="button"
            class="sdx-death-timer-btn"
            data-action="sdx-death-timer"
            title="${safeTooltip}"
            data-tooltip="${safeTooltip}"
            aria-label="${safeTooltip}"
          >
            <i class="${icon}"></i>
          </button>
        </div>
      `);

      $header.append($wrap);

      const $btn = $wrap.find('[data-action="sdx-death-timer"]');
      $btn.off("click.sdxDeathTimer");
      $btn.on("click.sdxDeathTimer", async (ev) => {
        ev.preventDefault();
        await onSkullClick(actor);
      });

    } catch (err) {
      console.error(`${MODULE_ID} | ${SUBMODULE} render error`, err);
    }
  }

  // Track HP changes so any healing clears Death Timer / Dead
  Hooks.on("preUpdateActor", (actor, change, options) => {
    if (game.system?.id !== "shadowdark") return;
    options._sdxPrevHp = getHpPathAndValue(actor).value;
  });

  Hooks.on("updateActor", async (actor, change, options) => {
    try {
      if (game.system?.id !== "shadowdark") return;

      const hasDeathState =
        !!findDeathTimerEffect(actor) ||
        !!findDeadEffect(actor) ||
        !!actor.getFlag(MODULE_ID, "deathTimer");

      if (!hasDeathState) return;

      const prevHp = numOrNull(options?._sdxPrevHp);
      const newHp = getHpPathAndValue(actor).value;
      const changedHp = getHpValueFromSource(change);

      const healed =
        prevHp !== null &&
        newHp !== null &&
        newHp > prevHp;

      const explicitPositiveHpSet =
        changedHp !== null &&
        changedHp > 0;

      if (healed || explicitPositiveHpSet) {
        await clearAllDeathState(actor);
        dtLog("HP gained - removed Death Timer / Dead from", actor.name);
      }
    } catch (err) {
      console.error(`${MODULE_ID} | ${SUBMODULE} updateActor cleanup error`, err);
    }
  });

  Hooks.on("renderActorSheet", handler);
  Hooks.on("renderShadowdarkActorSheet", handler);
  Hooks.on("renderShadowdarkActorSheetV2", handler);
  Hooks.on("renderActorSheetShadowdark", handler);
})();
