(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Death Timer";
  const DEATH_TIMER_STATUS_ID = "sdx-death-timer";
  const DEATH_TIMER_CHAT_ICON = "modules/mk-shadowdark/assets/icons/blood-drop-red.png";

  function getModuleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function dtLog(...args) {
    console.log(`${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} |`, ...args);
  }

  function numOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function getDeathTimerIcon(turns) {
    const n = Number(turns) || 0;

    if (n <= 1) return "modules/mk-shadowdark/assets/icons/blood-drop-red-1.png";
    if (n === 2) return "modules/mk-shadowdark/assets/icons/blood-drop-red-2.png";
    if (n === 3) return "modules/mk-shadowdark/assets/icons/blood-drop-red-3.png";
    return "modules/mk-shadowdark/assets/icons/blood-drop-red-4.png";
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

      .sdx-death-timer-chat-line {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        align-items: center;
        gap: 0.55rem;
        margin: 0.1rem 0;
      }

      .sdx-death-timer-chat-icon {
        width: 34px;
        height: 34px;
        object-fit: contain;
        margin: 0;
        border: 0;
      }

      .sdx-death-timer-chat-text {
        min-width: 0;
        line-height: 1.25;
      }
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

  function renderChatIcon(src, label = "Death Timer") {
    if (!src) return "";

    const safeSrc = escapeAttribute(src);
    const safeLabel = escapeAttribute(label);
    return `<img class="sdx-death-timer-chat-icon" src="${safeSrc}" alt="${safeLabel}" title="${safeLabel}">`;
  }

  function renderChatLine(src, label, content) {
    return `
      <div class="sdx-death-timer-chat-line">
        ${renderChatIcon(src, label)}
        <div class="sdx-death-timer-chat-text">${content}</div>
      </div>
    `;
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

  function refreshActorTokenEffects(actor) {
    window.setTimeout(() => {
      try {
        const tokens = actor?.getActiveTokens?.(true, true) ?? actor?.getActiveTokens?.() ?? [];

        for (const token of tokens) {
          if (typeof token.drawEffects === "function") {
            Promise.resolve(token.drawEffects()).catch(err => {
              console.warn(`${MODULE_ID} | ${SUBMODULE} token effect redraw error`, err);
            });
          } else if (typeof token.refresh === "function") {
            token.refresh();
          }
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | ${SUBMODULE} token effect refresh error`, err);
      }
    }, 50);
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
      || actor.effects.find(e => effectHasStatus(e, DEATH_TIMER_STATUS_ID))
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
      img: icon,
      statuses: [DEATH_TIMER_STATUS_ID],
      disabled: false,
      changes: [],
      flags: {
        [MODULE_ID]: {
          isDeathTimer: true,
          turns
        },
        core: {
          statusId: DEATH_TIMER_STATUS_ID
        }
      }
    };

    const existing = findDeathTimerEffect(actor);
    if (existing) {
      await existing.update(data);
    } else {
      await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    }

    refreshActorTokenEffects(actor);
  }

  async function removeDeathTimerEffect(actor) {
    const effects = actor.effects.filter(e =>
      e.getFlag(MODULE_ID, "isDeathTimer") === true ||
      effectHasStatus(e, DEATH_TIMER_STATUS_ID) ||
      (typeof e.name === "string" && e.name.startsWith("Death Timer ("))
    );
    if (!effects.length) return;
    await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id));
    refreshActorTokenEffects(actor);
  }

  async function upsertDeadEffect(actor) {
    const statusId = getBuiltInDeadStatusId();
    const icon = getBuiltInDeadStatusIcon();

    const data = {
      name: "Dead",
      description: "Dead",
      img: icon,
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

    refreshActorTokenEffects(actor);
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
    refreshActorTokenEffects(actor);
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
    await timerRoll.evaluate();

    const turns = Math.max(minTurns, timerRoll.total ?? 1);

    const speaker = ChatMessage.getSpeaker({ actor });
    const rollMode = game.settings.get("core", "rollMode");

    const sign = conMod >= 0 ? "+" : "-";
    const abs = Math.abs(conMod);

    await timerRoll.toMessage(
      {
        speaker,
        flavor: renderChatLine(
          DEATH_TIMER_CHAT_ICON,
          `Death Timer (${turns})`,
          `<b>${actor.name}</b> - Death Timer started: <b>${turns}</b> turn(s). <span style="opacity:0.85">(1d4 ${sign} ${abs}, min ${minTurns})</span>`
        )
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
      content: renderChatLine(
        getBuiltInDeadStatusIcon(),
        "Dead",
        `<b>${actor.name}</b> is now <b>Dead</b>.`
      ),
      whisper: rollMode === "gmroll" ? ChatMessage.getWhisperRecipients("GM").map(u => u.id) : undefined
    });
  }

  async function tickDeathTimer(actor, currentTurns) {
    const speaker = ChatMessage.getSpeaker({ actor });
    const rollMode = game.settings.get("core", "rollMode");

    const d20 = new Roll("1d20");
    await d20.evaluate();

    const roll = d20.total ?? 0;

    if (roll === 20) {
      const ok = await setHp(actor, 1);

      await d20.toMessage(
        {
          speaker,
          flavor: renderChatLine(
            DEATH_TIMER_CHAT_ICON,
            `Death Timer (${currentTurns})`,
            `<b>${actor.name}</b> - Death Check: <b>20</b>. <span style="opacity:0.9">You revive and gain <b>1 HP</b>${ok ? "" : " (HP field not found)"}. Death Timer removed.</span>`
          )
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
        flavor: renderChatLine(
          DEATH_TIMER_CHAT_ICON,
          `Death Timer (${currentTurns})`,
          `<b>${actor.name}</b> - Death Check: <b>${roll}</b>. <span style="opacity:0.9">Timer reduced by <b>${delta}</b> - now <b>${nextTurns}</b> turn(s).</span>`
        )
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
