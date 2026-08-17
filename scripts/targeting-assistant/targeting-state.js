export function isAttackOrSpellRoll(config) {
  const type = String(config?.type ?? "").trim().toLowerCase();
  return type === "attack" || type === "spell";
}

export function targetData(token) {
  const document = token?.document ?? token;
  const actor = token?.actor ?? document?.actor;
  const uuid = document?.uuid;
  if (!actor || typeof uuid !== "string" || !uuid.trim()) return null;

  const ac = Number(actor.system?.attributes?.ac?.value);
  return {
    uuid: uuid.trim(),
    name: String(document?.name ?? actor.name ?? "Target"),
    img: document?.texture?.src ?? actor.img ?? "icons/svg/mystery-man.svg",
    ac: Number.isFinite(ac) ? ac : null
  };
}

export function collectValidTargets(targets) {
  const seen = new Set();
  const valid = [];

  for (const token of targets ?? []) {
    const target = targetData(token);
    if (!target || seen.has(target.uuid)) continue;
    seen.add(target.uuid);
    valid.push(target);
  }

  return valid;
}

export function applyTargetsToRollConfig(config, targets) {
  const validTargets = Array.from(targets ?? []).filter(target => target?.uuid);
  const uuids = validTargets.map(target => target.uuid);

  config.targetUuids = uuids;
  if (!uuids.length) {
    delete config.targetUuid;
    return config;
  }

  config.targetUuid = uuids[0];

  if (String(config.type).toLowerCase() === "attack") {
    const primaryAC = Number(validTargets[0].ac);
    if (Number.isFinite(primaryAC)) {
      config.mainRoll ??= {};
      config.mainRoll.dc = primaryAC;
    }
  }

  return config;
}
