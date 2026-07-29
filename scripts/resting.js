const MODULE_ID = "mk-shadowdark";
const SUBMODULE = "Summary Bar Rest";
const REST_MODE_SETTING = "characterSheetTweaksRestMode";

export function getRestMode() {
  return String(getSetting(REST_MODE_SETTING, "normal")).toLowerCase() === "grinder"
    ? "grinder"
    : "normal";
}

export async function onRest(event, actor) {
  event.preventDefault();
  event.stopPropagation();

  const button = event.currentTarget;
  if (!actor?.update || button?.disabled) return;
  if (!actor.isOwner && !game.user?.isGM) {
    ui.notifications?.warn("MK-Shadowdark | You do not own this actor.");
    return;
  }

  if (button) button.disabled = true;

  try {
    const mode = getRestMode();
    const confirmed = await confirmRest(actor, mode);
    if (!confirmed) return;

    const result = await restActor(actor, mode);
    if (!result) return;

    try {
      await reportRest(actor, result);
    } catch (reportError) {
      console.warn(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | rest chat report error`, reportError);
    }

    const hpText = result.mode === "normal"
      ? `HP restored to ${result.hpAfter}.`
      : `Recovered ${result.hpRecovered} HP (${result.hitDieFormula}: ${result.hitDieTotal}).`;
    ui.notifications?.info(
      `${actor.name} completed a ${result.mode} rest. ${hpText} `
      + `${result.abilitiesRestored} abilities and ${result.spellsRestored} spells recovered.`
    );
  } catch (err) {
    console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | rest error`, err);
    ui.notifications?.error(`MK-Shadowdark | Could not rest ${actor.name}. ${err?.message ?? ""}`.trim());
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

async function confirmRest(actor, mode) {
  const isGrinder = mode === "grinder";
  const details = isGrinder
    ? "Recover all class abilities, roll one hit die to regain HP, and recover up to 1d4 lost spells."
    : "Recover all HP, class ability uses, and lost class abilities and spells.";

  return Dialog.confirm({
    title: `${isGrinder ? "Grinder" : "Normal"} Rest`,
    content: `
      <div class="mk-rest-dialog">
        <p><strong>${escapeHtml(actor.name)}</strong> is about to rest.</p>
        <p>${details}</p>
      </div>
    `,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });
}

export async function restActor(actor, mode) {
  const items = Array.from(actor.items ?? []);
  const abilities = items.filter(item => String(item.type ?? "").toLowerCase() === "class ability");
  const lostSpells = items
    .filter(item => String(item.type ?? "").toLowerCase() === "spell" && item.system?.lost === true)
    .sort((left, right) => String(left.name ?? "").localeCompare(String(right.name ?? "")));

  const hpBefore = Number(getNumber(actor, "system.attributes.hp.value") ?? 0);
  const hpMax = getHpMax(actor);
  if (!Number.isFinite(hpMax)) throw new Error("The actor has no valid maximum HP.");

  let hpAfter = hpMax;
  let hitDieFormula = null;
  let hitDieTotal = null;
  let spellRollTotal = null;
  let spellsToRestore = lostSpells;

  if (mode === "grinder") {
    hitDieFormula = await getHitDieFormula(actor);
    if (!hitDieFormula) throw new Error("The actor's class hit die could not be determined.");

    const hitDieRoll = await evaluateRoll(
      hitDieFormula,
      `${actor.name}: Grinder Rest HP`
    );
    const spellRoll = await evaluateRoll(
      "1d4",
      `${actor.name}: Grinder Rest Spells`
    );
    hitDieTotal = Math.max(0, Math.floor(Number(hitDieRoll.total) || 0));
    spellRollTotal = Math.max(0, Math.floor(Number(spellRoll.total) || 0));
    hpAfter = Math.min(hpMax, Math.max(0, hpBefore) + hitDieTotal);

    if (lostSpells.length > spellRollTotal) {
      spellsToRestore = await chooseSpellsToRestore(lostSpells, spellRollTotal);
      if (spellsToRestore === null) return null;
    }
  }

  const abilityUpdates = abilities.map(buildAbilityRestUpdate).filter(Boolean);
  const spellUpdates = spellsToRestore.map(spell => ({
    _id: spell.id,
    "system.lost": false
  }));

  if (abilityUpdates.length || spellUpdates.length) {
    await actor.updateEmbeddedDocuments("Item", [...abilityUpdates, ...spellUpdates]);
  }
  if (hpAfter !== hpBefore) {
    await actor.update({ "system.attributes.hp.value": hpAfter });
  }

  return {
    mode,
    hpBefore,
    hpAfter,
    hpRecovered: Math.max(0, hpAfter - hpBefore),
    hitDieFormula,
    hitDieTotal,
    spellRollTotal,
    abilitiesRestored: abilityUpdates.length,
    spellsRestored: spellUpdates.length,
    spellNames: spellsToRestore.map(spell => spell.name)
  };
}

function buildAbilityRestUpdate(ability) {
  const update = { _id: ability.id };
  let changed = false;

  if (ability.system?.lost === true) {
    update["system.lost"] = false;
    changed = true;
  }

  if (ability.system?.limitedUses) {
    const max = Number(ability.system?.uses?.max);
    const available = Number(ability.system?.uses?.available);
    const nextAvailable = Math.max(0, max);
    if (Number.isFinite(max) && available !== nextAvailable) {
      update["system.uses.available"] = nextAvailable;
      changed = true;
    }
  }

  return changed ? update : null;
}

async function getHitDieFormula(actor) {
  let actorClass = null;

  try {
    if (typeof actor.system?.getClass === "function") {
      actorClass = await actor.system.getClass();
    }
  } catch (_err) {
    // Continue through the compatibility fallbacks.
  }

  if (!actorClass) {
    const classUuid = foundry.utils.getProperty(actor, "system.class");
    if (classUuid && typeof fromUuid === "function") {
      try {
        actorClass = await fromUuid(classUuid);
      } catch (_err) {
        // Continue through the embedded-item fallback.
      }
    }
  }

  actorClass ??= Array.from(actor.items ?? [])
    .find(item => String(item.type ?? "").toLowerCase() === "class");

  const rawFormula = String(
    foundry.utils.getProperty(actorClass, "system.hitPoints")
    ?? foundry.utils.getProperty(actor, "system.hitDice")
    ?? foundry.utils.getProperty(actor, "system.attributes.hp.hitDice")
    ?? ""
  ).trim();
  const match = rawFormula.match(/d\s*(\d+)/i);
  return match ? `1d${match[1]}` : null;
}

async function evaluateRoll(formula, flavor = "") {
  const roll = new Roll(formula);
  await roll.evaluate();

  if (game.dice3d?.showForRoll) {
    try {
      await game.dice3d.showForRoll(
        roll,
        game.user,
        true,
        null,
        false,
        flavor
      );
    } catch (err) {
      console.warn(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | Dice So Nice display error`, err);
    }
  }

  return roll;
}

async function chooseSpellsToRestore(lostSpells, maximum) {
  if (maximum <= 0 || lostSpells.length === 0) return [];

  const options = lostSpells.map((spell, index) => `
    <label class="mk-rest-spell-option">
      <input type="checkbox" name="mk-rest-spell" value="${escapeHtml(spell.id)}"${index < maximum ? " checked" : ""}>
      <span>${escapeHtml(spell.name)}</span>
    </label>
  `).join("");

  const selectedIds = await Dialog.wait({
    title: `Recover ${maximum} Lost Spell${maximum === 1 ? "" : "s"}`,
    content: `
      <form class="mk-rest-spell-picker">
        <p>Choose up to ${maximum} lost spell${maximum === 1 ? "" : "s"} to recover.</p>
        <div class="mk-rest-spell-list">${options}</div>
      </form>
    `,
    buttons: {
      recover: {
        icon: "<i class='fas fa-wand-magic-sparkles'></i>",
        label: "Recover",
        callback: html => getCheckedSpellIds(html).slice(0, maximum)
      },
      cancel: {
        icon: "<i class='fas fa-times'></i>",
        label: "Cancel Rest",
        callback: () => null
      }
    },
    default: "recover",
    close: () => null,
    render: html => limitCheckedSpells(html, maximum)
  });

  if (!selectedIds) return null;
  const selected = new Set(selectedIds);
  return lostSpells.filter(spell => selected.has(spell.id));
}

function getCheckedSpellIds(html) {
  if (html?.find) {
    return html.find('input[name="mk-rest-spell"]:checked')
      .map((_index, input) => input.value)
      .get();
  }

  const root = html?.[0] ?? html;
  return Array.from(root?.querySelectorAll?.('input[name="mk-rest-spell"]:checked') ?? [])
    .map(input => input.value);
}

function limitCheckedSpells(html, maximum) {
  const root = html?.[0] ?? html;
  const inputs = Array.from(
    root?.querySelectorAll?.('input[name="mk-rest-spell"]')
    ?? html?.find?.('input[name="mk-rest-spell"]')
    ?? []
  );

  for (const input of inputs) {
    input.addEventListener("change", () => {
      const checked = inputs.filter(candidate => candidate.checked);
      if (checked.length <= maximum) return;
      input.checked = false;
      ui.notifications?.warn(`Choose no more than ${maximum} spell${maximum === 1 ? "" : "s"}.`);
    });
  }
}

async function reportRest(actor, result) {
  if (!globalThis.ChatMessage?.create) return;

  const isGrinder = result.mode === "grinder";
  const hpLine = isGrinder
    ? `HP: ${result.hpBefore} → ${result.hpAfter} (${result.hitDieFormula} = ${result.hitDieTotal})`
    : `HP: ${result.hpBefore} → ${result.hpAfter}`;
  const spellLine = isGrinder
    ? `Spells: ${result.spellsRestored} recovered (1d4 = ${result.spellRollTotal})`
    : `Spells: ${result.spellsRestored} recovered`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker?.({ actor }),
    content: `
      <div class="mk-rest-chat-card">
        <h3><i class="fa-solid ${isGrinder ? "fa-dice" : "fa-bed"}"></i> ${isGrinder ? "Grinder" : "Normal"} Rest</h3>
        <p>${escapeHtml(hpLine)}</p>
        <p>Class abilities: ${result.abilitiesRestored} recovered</p>
        <p>${escapeHtml(spellLine)}</p>
      </div>
    `
  });
}

function getHpMax(actor) {
  const explicitMax = getNumber(actor, "system.attributes.hp.max");
  if (Number.isFinite(explicitMax) && explicitMax > 0) return explicitMax;

  const base = getNumber(actor, "system.attributes.hp.base");
  const bonus = getNumber(actor, "system.attributes.hp.bonus");
  if (!Number.isFinite(base) && !Number.isFinite(bonus)) return null;
  return (Number.isFinite(base) ? base : 0) + (Number.isFinite(bonus) ? bonus : 0);
}

function getNumber(document, path) {
  const value = foundry.utils.getProperty(document, path);
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getSetting(key, fallback = undefined) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (_err) {
    return fallback;
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function getModuleVersion() {
  const mod = game.modules.get(MODULE_ID);
  return mod?.version ?? mod?.data?.version ?? "unknown";
}
