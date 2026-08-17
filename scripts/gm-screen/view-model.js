import { getGroupData } from "../group-sheet/activities.js";
import { isGroupActor, resolveActorFromUuid } from "../group-sheet/actors.js";
import { getGroupAssignments } from "../group-sheet/assignments.js";
import { buildExplorationEncounterViewData } from "../group-sheet/exploration-encounters.js";
import { buildGroupMemberStatus } from "../group-sheet/member-status.js";
import { getGroupProcedureState } from "../group-sheet/procedure.js";
import { getGroupRestState } from "../group-sheet/rest-encounters.js";
import { getGroupElapsedTime } from "../group-sheet/time.js";
import { resolveSceneEnvironmentContext } from "../libs/environment-context.js";
import { CHAT_FLAG, MODULE_ID } from "../encounter-engine/constants.js";

const GM_SCREEN_WORKSPACES = Object.freeze([
  "overview",
  "exploration",
  "resting",
  "encounter",
  "combat",
  "environment",
  "rules",
]);

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return [...collection.values()];
  try {
    return [...collection];
  } catch (_error) {
    return [];
  }
}

function normalizeWorkspace(value) {
  const workspace = String(value ?? "overview").trim().toLowerCase();
  return GM_SCREEN_WORKSPACES.includes(workspace) ? workspace : "overview";
}

function getGroupActors(actors = globalThis.game?.actors) {
  return collectionValues(actors)
    .filter(isGroupActor)
    .sort((left, right) => String(left?.name ?? "").localeCompare(String(right?.name ?? ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }));
}

async function resolveGmScreenGroup(groupActorUuid = "", actors = globalThis.game?.actors) {
  const groups = getGroupActors(actors);
  const requested = String(groupActorUuid ?? "");

  if (requested) {
    const direct = groups.find(group => group?.uuid === requested || group?.id === requested);
    if (direct) return direct;

    try {
      const resolved = await resolveActorFromUuid(requested);
      if (isGroupActor(resolved)) return resolved;
    } catch (_error) {
      // Fall back to the first available Group.
    }
  }

  return groups[0] ?? null;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}

function actorImage(actor) {
  return String(actor?.prototypeToken?.texture?.src ?? actor?.img ?? "icons/svg/mystery-man.svg");
}

async function buildPartyView(groupActor) {
  if (!groupActor) return [];

  const group = getGroupData(groupActor);
  const members = [];

  for (const actorUuid of group.activeMembers ?? []) {
    const actor = await resolveActorFromUuid(actorUuid);
    if (!actor) continue;

    const status = buildGroupMemberStatus(actor);
    const maxHp = Math.max(0, Number(status.hp?.max ?? 0));
    const hpValue = Math.max(0, Number(status.hp?.value ?? 0));

    members.push({
      actorUuid: status.actorUuid,
      name: status.actorName,
      img: actorImage(actor),
      severity: status.severity,
      hp: hpValue,
      hpMax: maxHp,
      hpPct: maxHp > 0 ? Math.min(100, Math.round((hpValue / maxHp) * 100)) : 0,
      ac: status.ac,
      dead: status.dead,
      deathTimer: status.deathTimer,
      wounds: status.wounds,
      focus: status.focus,
      light: status.light,
      effectCount: status.effects.length,
      notableCount: status.notableCount,
    });
  }

  return members;
}

function buildAssignmentsView(groupActor) {
  if (!groupActor) return {
    front: [],
    middle: [],
    rear: [],
    scout: [],
    lightBearer: [],
    watches: [],
  };

  const assignments = getGroupAssignments(groupActor);
  const positions = assignments?.exploration?.positions ?? {};
  const roles = assignments?.exploration?.roles ?? {};

  return {
    front: [...(positions.front ?? [])],
    middle: [...(positions.middle ?? [])],
    rear: [...(positions.rear ?? [])],
    scout: [...(roles.scout ?? [])],
    lightBearer: [...(roles.lightBearer ?? [])],
    watches: (assignments?.camping?.watches ?? []).map((watch, index) => ({
      index: index + 1,
      actorUuids: [...(watch?.actorUuids ?? [])],
    })),
  };
}

function combatantView(combatant, currentCombatant) {
  return {
    id: String(combatant?.id ?? ""),
    name: String(combatant?.name ?? combatant?.actor?.name ?? "Combatant"),
    img: String(combatant?.img ?? combatant?.token?.texture?.src ?? combatant?.actor?.img ?? "icons/svg/mystery-man.svg"),
    initiative: Number.isFinite(Number(combatant?.initiative)) ? Number(combatant.initiative) : null,
    defeated: Boolean(combatant?.defeated ?? combatant?.isDefeated),
    current: Boolean(currentCombatant && combatant?.id === currentCombatant?.id),
  };
}

function buildCombatView(combat = globalThis.game?.combat) {
  if (!combat) {
    return {
      active: false,
      name: "No active combat",
      round: 0,
      turn: 0,
      currentCombatant: null,
      combatants: [],
      morale: null,
    };
  }

  const turns = Array.isArray(combat.turns) ? combat.turns : [];
  const turnIndex = Number(combat.turn);
  const currentCombatant = Number.isInteger(turnIndex) && turnIndex >= 0 ? turns[turnIndex] ?? null : null;
  const moraleApi = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.morale;
  let morale = null;

  if (typeof moraleApi?.getState === "function") {
    try {
      const state = moraleApi.getState(combat);
      const force = state?.force ?? null;
      morale = force ? {
        initialCount: Number(force.initialCount ?? 0),
        checked: Boolean(force.checked),
        threshold: force.threshold ?? null,
        result: force.result ?? null,
        livingCount: Array.isArray(force.members)
          ? force.members.filter(member => {
            const combatant = combat.combatants?.get?.(member.combatantId)
              ?? turns.find(entry => entry.id === member.combatantId);
            return combatant && !combatant.defeated && !combatant.isDefeated;
          }).length
          : 0,
      } : null;
    } catch (_error) {
      morale = null;
    }
  }

  return {
    active: true,
    id: String(combat.id ?? ""),
    name: String(combat.name ?? "Combat"),
    round: Math.max(0, Number(combat.round ?? 0) || 0),
    turn: Math.max(0, Number(combat.turn ?? 0) || 0),
    currentCombatant: currentCombatant ? combatantView(currentCombatant, currentCombatant) : null,
    combatants: turns.map(combatant => combatantView(combatant, currentCombatant)),
    morale,
  };
}

function messageEncounterData(message) {
  if (!message) return null;

  try {
    const data = message.getFlag?.(MODULE_ID, CHAT_FLAG);
    if (data) return data;
  } catch (_error) {
    // Fall through to raw flag data.
  }

  return message.flags?.[MODULE_ID]?.[CHAT_FLAG] ?? null;
}

function findLatestEncounterMessage(groupActor, messages = globalThis.game?.messages) {
  if (!groupActor) return null;

  const groupUuid = String(groupActor.uuid ?? "");
  const candidates = collectionValues(messages)
    .map(message => ({ message, data: messageEncounterData(message) }))
    .filter(entry => entry.data?.groupContext?.groupActorUuid === groupUuid)
    .sort((left, right) => {
      const leftTime = Number(left.message?.timestamp ?? left.message?._source?.timestamp ?? left.data?.generatedAt ?? 0);
      const rightTime = Number(right.message?.timestamp ?? right.message?._source?.timestamp ?? right.data?.generatedAt ?? 0);
      return rightTime - leftTime;
    });

  return candidates[0] ?? null;
}

function buildLatestEncounterView(groupActor, messages = globalThis.game?.messages) {
  const latest = findLatestEncounterMessage(groupActor, messages);
  if (!latest) return null;

  const data = latest.data;
  return {
    messageId: String(latest.message?.id ?? ""),
    label: String(data?.encounter?.label ?? "Encounter"),
    count: Math.max(1, Number(data?.encounter?.count ?? 1) || 1),
    terrain: String(data?.terrain ?? ""),
    danger: String(data?.dangerLabel ?? data?.dangerLevel ?? ""),
    period: String(data?.period ?? ""),
    distance: String(data?.distance?.label ?? ""),
    activity: String(data?.activity?.label ?? ""),
    reaction: String(data?.reaction?.label ?? ""),
    disposition: String(data?.disposition ?? "neutral"),
    staged: Boolean(data?.staging?.deployed),
    data,
  };
}

async function buildGmScreenViewModel({
  groupActorUuid = "",
  workspace = "overview",
  scene = globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null,
  combat = globalThis.game?.combat ?? null,
  messages = globalThis.game?.messages,
} = {}) {
  const groups = getGroupActors();
  const groupActor = await resolveGmScreenGroup(groupActorUuid, groups);
  const resolvedWorkspace = normalizeWorkspace(workspace);
  const environment = resolveSceneEnvironmentContext(scene);
  const combatView = buildCombatView(combat);

  const base = {
    workspace: resolvedWorkspace,
    workspaces: GM_SCREEN_WORKSPACES.map(id => ({
      id,
      label: id[0].toUpperCase() + id.slice(1),
      active: id === resolvedWorkspace,
    })),
    groups: groups.map(group => ({
      uuid: String(group.uuid ?? group.id ?? ""),
      name: String(group.name ?? "Group"),
      selected: Boolean(groupActor && group.id === groupActor.id),
    })),
    hasGroups: groups.length > 0,
    groupActorUuid: String(groupActor?.uuid ?? ""),
    groupName: String(groupActor?.name ?? "No Group"),
    scene: {
      id: String(scene?.id ?? ""),
      uuid: String(scene?.uuid ?? ""),
      name: String(scene?.name ?? "No active Scene"),
    },
    environment: {
      terrain: String(environment?.terrain ?? "Default"),
      dangerLevel: String(environment?.dangerLevel ?? "unsafe"),
      dangerLabel: String(environment?.danger?.label ?? environment?.dangerLevel ?? "Unsafe"),
      period: String(environment?.period ?? "day"),
      intervalTurns: Math.max(1, Number(environment?.encounter?.interval ?? 1) || 1),
      tableUuid: String(environment?.tableUuid ?? ""),
      tableConfigured: Boolean(environment?.tableUuid),
    },
    combat: combatView,
    party: [],
    assignments: buildAssignmentsView(groupActor),
    procedure: "downtime",
    elapsedSeconds: 0,
    elapsedLabel: "0s",
    exploration: null,
    resting: null,
    latestEncounter: null,
  };

  if (!groupActor) return base;

  const procedure = getGroupProcedureState(groupActor);
  const elapsedSeconds = getGroupElapsedTime(groupActor, procedure);
  const exploration = await buildExplorationEncounterViewData(groupActor, { isGm: true });
  const rest = getGroupRestState(groupActor, { context: environment });
  const latestEncounter = buildLatestEncounterView(groupActor, messages);

  return {
    ...base,
    party: await buildPartyView(groupActor),
    procedure,
    elapsedSeconds,
    elapsedLabel: formatDuration(elapsedSeconds),
    exploration,
    resting: {
      status: rest.workflow.status,
      mode: rest.workflow.mode,
      completedTurns: rest.completedTurns,
      totalTurns: 8,
      remainingChecks: rest.remainingChecks,
      requiredChecks: rest.requiredChecks,
      nextCheckTurn: rest.nextCheckTurn,
      interrupted: rest.workflow.status === "interrupted",
      active: ["checking", "interrupted"].includes(rest.workflow.status),
    },
    latestEncounter,
  };
}

export {
  GM_SCREEN_WORKSPACES,
  collectionValues,
  normalizeWorkspace,
  getGroupActors,
  resolveGmScreenGroup,
  formatDuration,
  buildPartyView,
  buildAssignmentsView,
  buildCombatView,
  messageEncounterData,
  findLatestEncounterMessage,
  buildLatestEncounterView,
  buildGmScreenViewModel,
};
