import { getGroupData } from "../group-sheet/activities.js";
import { isGroupActor, resolveActorFromUuid } from "../group-sheet/actors.js";
import { getGroupAssignments } from "../group-sheet/assignments.js";
import { buildGroupMemberStatus } from "../group-sheet/member-status.js";
import { resolveSceneEnvironmentContext } from "../libs/environment-context.js";
import { encounterMessageData as readEncounterMessageData } from "../group-sheet/encounters/chat.js";

const GM_SCREEN_WORKSPACES = Object.freeze([
  "overview",
]);

const GM_SCREEN_WORKSPACE_LABELS = Object.freeze({
  overview: "Overview",
});

const GM_SCREEN_WORKSPACE_ICONS = Object.freeze({
  overview: "fa-compass",
});

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
  // The main screen is a permanent four-zone surface; retain this function as
  // a compatibility boundary for callers that still pass a legacy workspace.
  void value;
  return "overview";
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
    order: [],
    front: [],
    middle: [],
    rear: [],
    scout: "",
    lightBearer: "",
    watches: [],
  };

  const assignments = getGroupAssignments(groupActor);
  const exploration = assignments?.exploration ?? {};
  const positions = exploration.positions ?? {};
  const roles = exploration.roles ?? {};

  return {
    order: [...(exploration.order ?? [])],
    front: [...(positions.front ?? [])],
    middle: [...(positions.middle ?? [])],
    rear: [...(positions.rear ?? [])],
    scout: String(roles.scout ?? ""),
    lightBearer: String(roles.lightBearer ?? ""),
    watches: (assignments?.camping?.watches ?? []).map((watch, index) => ({
      id: String(watch?.id ?? `watch-${index + 1}`),
      label: String(watch?.label ?? `Watch ${index + 1}`),
      index: index + 1,
      actorUuids: [...(watch?.actorUuids ?? [])],
    })),
  };
}

function messageEncounterData(message) {
  return readEncounterMessageData(message);
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
  scene = globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null,
  messages = globalThis.game?.messages,
} = {}) {
  const groups = getGroupActors();
  const groupActor = await resolveGmScreenGroup(groupActorUuid, groups);
  const environment = resolveSceneEnvironmentContext(scene);

  const base = {
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
    },
    party: [],
    assignments: buildAssignmentsView(groupActor),
    latestEncounter: null,
  };

  if (!groupActor) return base;

  const latestEncounter = buildLatestEncounterView(groupActor, messages);

  return {
    ...base,
    party: await buildPartyView(groupActor),
    latestEncounter,
  };
}

export {
  GM_SCREEN_WORKSPACES,
  GM_SCREEN_WORKSPACE_LABELS,
  GM_SCREEN_WORKSPACE_ICONS,
  collectionValues,
  normalizeWorkspace,
  getGroupActors,
  resolveGmScreenGroup,
  buildPartyView,
  buildAssignmentsView,
  messageEncounterData,
  findLatestEncounterMessage,
  buildLatestEncounterView,
  buildGmScreenViewModel,
};
