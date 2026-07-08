// scripts/group-sheet/activities.js

import {
  ACTIVITY_KIND_CAMPING,
  ACTIVITY_KIND_TRAVEL,
  CAMPING_ACTIVITIES,
  TRAVEL_ACTIVITIES,
  TRAVEL_DEFAULT_ACTIVITY_KEY,
} from "./constants.js";
import { canUserControlActor, getFlagWithLegacy, resolveActorFromUuid } from "./actors.js";
import { getActorClassName } from "./inventory.js";
import { getTravelProgressDurationMs } from "./group-settings.js";
import { hasOwn } from "./utils.js";
function getActivityKind(kind) {
  return kind === ACTIVITY_KIND_TRAVEL ? ACTIVITY_KIND_TRAVEL : ACTIVITY_KIND_CAMPING;
}

function getActivitiesForKind(kind) {
  return getActivityKind(kind) === ACTIVITY_KIND_TRAVEL
    ? TRAVEL_ACTIVITIES
    : CAMPING_ACTIVITIES;
}

function isActivityStore(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function getActivityStore(groupData, kind) {
  return getActivityKind(kind) === ACTIVITY_KIND_TRAVEL
    ? groupData.travel.activities
    : groupData.camping.activities;
}

function pickActivityEntries(source, activities) {
  const entries = {};
  if (!isActivityStore(source)) return entries;

  for (const activity of activities) {
    if (hasOwn(source, activity.key)) entries[activity.key] = source[activity.key];
  }

  return entries;
}

function hasActivityEntries(source, activities) {
  if (!isActivityStore(source)) return false;
  return activities.some(activity => hasOwn(source, activity.key));
}

function normalizeActivityAssignments(source, activities) {
  const store = isActivityStore(source) ? source : {};
  const assignedMembers = new Set();

  for (const activity of activities) {
    const current = isActivityStore(store[activity.key]) ? store[activity.key] : {};

    if (!Array.isArray(current.actorUuids)) {
      const migrated = [];

      if (current.actorUuid) {
        migrated.push(current.actorUuid);
      }

      current.actorUuids = migrated;
      delete current.actorUuid;
    }

    current.actorUuids = current.actorUuids.filter(uuid => {
      if (!uuid) return false;
      if (assignedMembers.has(uuid)) return false;
      assignedMembers.add(uuid);
      return true;
    });

    store[activity.key] = current;
  }

  return store;
}

function normalizeTravelPrompt(value) {
  const prompt = isActivityStore(value) ? value : {};
  prompt.id = String(prompt.id ?? "");
  prompt.active = Boolean(prompt.active);
  prompt.startedAt = Number(prompt.startedAt ?? 0) || 0;
  prompt.progressStartedAt = Number(prompt.progressStartedAt ?? 0) || 0;
  prompt.completedKeys = Array.isArray(prompt.completedKeys)
    ? [...new Set(prompt.completedKeys.filter(Boolean).map(String))]
    : [];
  prompt.failedSteps = Array.isArray(prompt.failedSteps)
    ? [...new Set(prompt.failedSteps.filter(Boolean).map(String))]
    : [];
  prompt.resolvedSteps = Array.isArray(prompt.resolvedSteps)
    ? [...new Set(prompt.resolvedSteps.filter(Boolean).map(String))]
    : [];
  prompt.results = isActivityStore(prompt.results) ? prompt.results : {};

  for (const activity of TRAVEL_ACTIVITIES) {
    const result = isActivityStore(prompt.results[activity.key]) ? prompt.results[activity.key] : {};
    prompt.results[activity.key] = {
      successes: Math.max(0, Number(result.successes ?? 0) || 0),
      failures: Math.max(0, Number(result.failures ?? 0) || 0),
    };
  }

  return prompt;
}

function createEmptyTravelPromptResults() {
  return TRAVEL_ACTIVITIES.reduce((results, activity) => {
    results[activity.key] = {
      successes: 0,
      failures: 0,
    };
    return results;
  }, {});
}

function createTravelPromptId() {
  const randomId = foundry.utils?.randomID?.(8) ?? Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${randomId}`;
}

function getTravelAssignmentKey(activityKey, actorUuid) {
  return `${activityKey}:${actorUuid}`;
}

function getActivityByKey(kind, activityKey) {
  return getActivitiesForKind(kind).find(activity => activity.key === activityKey) ?? null;
}

function getDefaultTravelActivity() {
  return getActivityByKey(ACTIVITY_KIND_TRAVEL, TRAVEL_DEFAULT_ACTIVITY_KEY) ?? TRAVEL_ACTIVITIES[0] ?? null;
}

function getExplicitTravelAssignments(groupData) {
  const assignments = [];
  const assignedMemberUuids = new Set();
  const activityStore = getActivityStore(groupData, ACTIVITY_KIND_TRAVEL);

  for (const activity of TRAVEL_ACTIVITIES) {
    const actorUuids = Array.isArray(activityStore?.[activity.key]?.actorUuids)
      ? activityStore[activity.key].actorUuids
      : [];

    for (const actorUuid of actorUuids) {
      if (!actorUuid) continue;

      assignments.push({
        activityKey: activity.key,
        actorUuid,
        implicit: false,
      });
      assignedMemberUuids.add(actorUuid);
    }
  }

  return { assignments, assignedMemberUuids };
}

function getEffectiveTravelAssignments(groupData) {
  const { assignments, assignedMemberUuids } = getExplicitTravelAssignments(groupData);
  const defaultActivity = getDefaultTravelActivity();

  if (!defaultActivity) return assignments;

  for (const memberUuid of groupData.members ?? []) {
    if (!memberUuid || assignedMemberUuids.has(memberUuid)) continue;

    assignments.push({
      activityKey: defaultActivity.key,
      actorUuid: memberUuid,
      implicit: true,
    });
  }

  return assignments;
}

function getTravelAssignmentKeys(groupData) {
  return getEffectiveTravelAssignments(groupData)
    .map(assignment => getTravelAssignmentKey(assignment.activityKey, assignment.actorUuid));
}

function buildTravelProgress(groupData) {
  const completedKeys = new Set(groupData.travel.prompt?.completedKeys ?? []);
  const failedSteps = new Set(groupData.travel.prompt?.failedSteps ?? []);
  const resolvedSteps = new Set(groupData.travel.prompt?.resolvedSteps ?? []);
  const promptResults = isActivityStore(groupData.travel.prompt?.results)
    ? groupData.travel.prompt.results
    : {};
  const promptActive = Boolean(groupData.travel.prompt?.active);
  const startedAt = Number(groupData.travel.prompt?.startedAt ?? 0) || 0;
  const progressStartedAt = Number(groupData.travel.prompt?.progressStartedAt ?? 0) || 0;
  const resolving = promptActive && progressStartedAt > 0;
  const assignments = getEffectiveTravelAssignments(groupData);
  let activeStepFound = false;
  let totalAssigned = 0;
  let totalCompleted = 0;
  let totalResolved = 0;

  const steps = TRAVEL_ACTIVITIES.map((activity, index) => {
    const actorUuids = assignments
      .filter(assignment => assignment.activityKey === activity.key)
      .map(assignment => assignment.actorUuid);
    const assignedCount = actorUuids.length;
    const completedCount = actorUuids.filter(actorUuid => (
      completedKeys.has(getTravelAssignmentKey(activity.key, actorUuid))
    )).length;
    const hasAssigned = assignedCount > 0;
    const failed = failedSteps.has(activity.key);
    const resolved = resolvedSteps.has(activity.key) || failed;
    const allRolled = hasAssigned && completedCount >= assignedCount;
    const complete = resolved && allRolled;
    const active = resolving && !resolved && !activeStepFound;
    const result = isActivityStore(promptResults[activity.key])
      ? promptResults[activity.key]
      : {};
    const successes = Math.max(0, Number(result.successes ?? 0) || 0);
    const failures = Math.max(0, Number(result.failures ?? 0) || 0);
    const successOutcome = resolved && successes > 0;
    const failureOutcome = resolved && !successOutcome;
    const resultMarks = resolved
      ? [
        ...Array.from({ length: successes }, () => ({
          type: "success",
          symbol: "V",
          label: "Success",
        })),
        ...Array.from({ length: failures }, () => ({
          type: "failure",
          symbol: "X",
          label: "Failure",
        })),
      ]
      : [];

    if (active) activeStepFound = true;
    totalAssigned += assignedCount;
    totalCompleted += completedCount;
    if (resolved) totalResolved += 1;

    let statusLabel = "Waiting";
    if (resolved) {
      statusLabel = successOutcome ? "Success" : "Failure";
    } else if (resolving && active) {
      statusLabel = "Revealing";
    } else if (allRolled) {
      statusLabel = "Ready";
    } else if (!hasAssigned) {
      statusLabel = resolving && active
        ? "No Assignment"
        : promptActive
          ? "Waiting"
          : "Unassigned";
    } else if (promptActive) {
      statusLabel = "Rolling";
    }

    return {
      ...activity,
      index: index + 1,
      assignedCount,
      completedCount,
      hasAssigned,
      complete,
      allRolled,
      failed,
      successOutcome,
      failureOutcome,
      resolved,
      successes,
      failures,
      resultMarks,
      active,
      pending: resolving && !resolved && !active,
      empty: !hasAssigned,
      statusLabel,
    };
  });

  return {
    active: promptActive,
    resolving,
    promptId: groupData.travel.prompt?.id ?? "",
    startedAt,
    progressStartedAt,
    durationMs: getTravelProgressDurationMs(),
    totalAssigned,
    totalCompleted,
    totalResolved,
    rollingComplete: totalAssigned > 0 && totalCompleted >= totalAssigned,
    percent: Math.min(100, (totalResolved / TRAVEL_ACTIVITIES.length) * 100),
    complete: totalResolved >= TRAVEL_ACTIVITIES.length,
    steps,
  };
}

function getActorTokenImage(actor) {
  return actor?.prototypeToken?.texture?.src || actor?.img || "icons/svg/mystery-man.svg";
}

async function buildTravelPromptAssignments(groupData) {
  const assignments = [];
  const completedKeys = new Set(groupData.travel.prompt?.completedKeys ?? []);

  for (const assignment of getEffectiveTravelAssignments(groupData)) {
    const activity = getActivityByKey(ACTIVITY_KIND_TRAVEL, assignment.activityKey);
    const actor = await resolveActorFromUuid(assignment.actorUuid);
    if (!activity || !actor) continue;

    const assignmentKey = getTravelAssignmentKey(activity.key, actor.uuid);

    assignments.push({
      key: assignmentKey,
      activityKey: activity.key,
      activityName: activity.name,
      abilityLabel: activity.abilityLabel,
      abilities: activity.abilities,
      dc: activity.dc,
      icon: activity.icon,
      actorUuid: actor.uuid,
      actorName: actor.name,
      actorImg: getActorTokenImage(actor),
      implicit: Boolean(assignment.implicit),
      complete: completedKeys.has(assignmentKey),
    });
  }

  return assignments;
}

async function buildTravelPromptPayload(groupActor, groupData) {
  return {
    groupActorUuid: groupActor.uuid,
    groupName: groupActor.name,
    promptId: groupData.travel.prompt?.id ?? "",
    startedAt: groupData.travel.prompt?.startedAt ?? 0,
    progress: buildTravelProgress(groupData),
    assignments: await buildTravelPromptAssignments(groupData),
  };
}

function getGroupData(actor) {
  const existing = foundry.utils.deepClone(
    getFlagWithLegacy(actor, "group", {}) ?? {}
  );

  existing.members ??= [];
  existing.travel ??= {};
  existing.camping ??= {};
  existing.travel.weather ??= "normal";
  existing.travel.speed ??= "normal";

  const legacyTravelActivities = isActivityStore(existing.travel.activities)
    ? existing.travel.activities
    : {};

  if (!isActivityStore(existing.camping.activities)) {
    existing.camping.activities = {};
  }

  if (hasActivityEntries(legacyTravelActivities, CAMPING_ACTIVITIES)) {
    const legacyCampingActivities = pickActivityEntries(legacyTravelActivities, CAMPING_ACTIVITIES);

    for (const [key, value] of Object.entries(legacyCampingActivities)) {
      if (!hasOwn(existing.camping.activities, key)) {
        existing.camping.activities[key] = value;
      }
    }
  }

  existing.travel.activities = pickActivityEntries(legacyTravelActivities, TRAVEL_ACTIVITIES);
  existing.travel.activities = normalizeActivityAssignments(existing.travel.activities, TRAVEL_ACTIVITIES);
  existing.travel.prompt = normalizeTravelPrompt(existing.travel.prompt);
  existing.camping.activities = normalizeActivityAssignments(existing.camping.activities, CAMPING_ACTIVITIES);

  return existing;
}

function getActivityName(kind, key) {
  return getActivitiesForKind(kind).find(activity => activity.key === key)?.name ?? "";
}

function getAssignedActivityByMember(groupData, kind) {
  const assignedByMember = new Map();
  const activities = getActivitiesForKind(kind);
  const activityStore = getActivityStore(groupData, kind);

  for (const activity of activities) {
    const activityData = activityStore?.[activity.key] ?? {};
    const actorUuids = Array.isArray(activityData.actorUuids)
      ? activityData.actorUuids
      : [];

    for (const uuid of actorUuids) {
      if (!assignedByMember.has(uuid)) assignedByMember.set(uuid, activity.key);
    }
  }

  return assignedByMember;
}

function setActivityMember(groupData, kind, activityKey, actorUuid, assigned) {
  if (!activityKey || !actorUuid) return;

  const activities = getActivitiesForKind(kind);
  const activityStore = getActivityStore(groupData, kind);

  if (!activities.some(activity => activity.key === activityKey)) return;

  if (getActivityKind(kind) === ACTIVITY_KIND_TRAVEL) {
    groupData.travel.prompt = normalizeTravelPrompt({});
  }

  for (const activity of activities) {
    const activityData = activityStore[activity.key] ?? {
      actorUuids: [],
    };

    const existing = Array.isArray(activityData.actorUuids)
      ? activityData.actorUuids
      : [];

    activityData.actorUuids = existing.filter(uuid => uuid !== actorUuid);
    activityStore[activity.key] = activityData;
  }

  if (!assigned) return;

  const activityData = activityStore[activityKey] ?? {
    actorUuids: [],
  };

  activityData.actorUuids ??= [];
  activityData.actorUuids.push(actorUuid);
  activityStore[activityKey] = activityData;
}

function buildActivityMemberRoster(groupData, members = [], kind = ACTIVITY_KIND_CAMPING) {
  const assignedByMember = getAssignedActivityByMember(groupData, kind);
  const isTravel = getActivityKind(kind) === ACTIVITY_KIND_TRAVEL;
  const defaultActivityName = isTravel
    ? `Default ${getDefaultTravelActivity()?.name ?? "Lookout"}`
    : "";

  return members.map(member => {
    const assignedActivityKey = assignedByMember.get(member.uuid) ?? "";
    const assignedActivityName = assignedActivityKey
      ? getActivityName(kind, assignedActivityKey)
      : defaultActivityName;

    return {
      uuid: member.uuid,
      name: member.name,
      img: member.img,
      className: member.className,
      canAssign: member.canAssign,
      assigned: Boolean(assignedActivityKey),
      assignedActivityKey,
      assignedActivityName
    };
  });
}

async function buildActivities(groupData, members = [], kind = ACTIVITY_KIND_CAMPING) {
  const result = [];
  const activities = getActivitiesForKind(kind);
  const activityStore = getActivityStore(groupData, kind);
  const assignedByMember = getAssignedActivityByMember(groupData, kind);

  for (const activity of activities) {
    const activityData = activityStore?.[activity.key] ?? {};
    const actorUuids = Array.isArray(activityData.actorUuids)
      ? activityData.actorUuids
      : [];

    const assigned = [];

    for (const uuid of actorUuids) {
      const assignedActor = await resolveActorFromUuid(uuid);
      if (!assignedActor) continue;

      assigned.push({
        uuid: assignedActor.uuid,
        name: assignedActor.name,
        img: assignedActor.img,
        className: await getActorClassName(assignedActor),
        canRoll: canUserControlActor(assignedActor),
      });
    }

    const memberOptions = members.map(member => {
      const assignedActivityKey = assignedByMember.get(member.uuid) ?? "";
      const assigned = assignedActivityKey === activity.key;
      const assignedElsewhere = Boolean(assignedActivityKey && assignedActivityKey !== activity.key);
      const assignedActivityName = assignedElsewhere ? getActivityName(kind, assignedActivityKey) : "";

      return {
        uuid: member.uuid,
        name: member.name,
        img: member.img,
        className: member.className,
        canAssign: member.canAssign,
        assigned,
        assignedElsewhere,
        assignedActivityName,
        title: !member.canAssign
          ? `${member.name} is controlled by another user`
          : assigned
            ? `Remove ${member.name} from ${activity.name}`
            : assignedElsewhere
              ? `Move ${member.name} from ${assignedActivityName} to ${activity.name}`
              : `Assign ${member.name} to ${activity.name}`
      };
    });

    result.push({
      ...activity,
      kind,
      assigned,
      hasAssigned: assigned.length > 0,
      canRoll: assigned.some(actor => actor.canRoll),
      memberOptions,
      hasMemberOptions: memberOptions.length > 0,
      assignmentLabel: assigned.length
        ? assigned.map(actor => actor.name).join(", ")
        : "Unassigned",
    });
  }

  return result;
}
export {
  getActivityKind,
  getActivitiesForKind,
  isActivityStore,
  getActivityStore,
  normalizeTravelPrompt,
  createEmptyTravelPromptResults,
  createTravelPromptId,
  getTravelAssignmentKey,
  getActivityByKey,
  getDefaultTravelActivity,
  getEffectiveTravelAssignments,
  getTravelAssignmentKeys,
  buildTravelProgress,
  buildTravelPromptAssignments,
  buildTravelPromptPayload,
  getGroupData,
  getActivityName,
  setActivityMember,
  buildActivityMemberRoster,
  buildActivities,
};
