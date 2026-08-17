import { registerEnvironmentContextService } from "../libs/environment-context.js";
import { registerGroupAssignmentsService } from "./assignments.js";
import { registerGroupExplorationEncounterService } from "./exploration-encounters.js";
import { registerGroupMemberStatus } from "./member-status.js";
import { registerGroupRestEncounterService } from "./rest-encounters.js";
import { registerGroupSheet } from "./registration.js";
import { registerGroupProcedureService } from "./procedure.js";
import { registerGroupTimeService } from "./time.js";
import "./dashboard-behavior.js";

export { createGroupActor, MKGroupSheet } from "./sheet.js";
export {
  GROUP_PROCEDURE,
  GROUP_PROCEDURE_STATES,
  GROUP_PROCEDURE_DEFAULT_STATE,
  GROUP_PROCEDURE_HOOK,
  getGroupProcedure,
  getGroupProcedureState,
  setGroupProcedureState,
} from "./procedure.js";
export {
  GROUP_TIME_ADVANCED_HOOK,
  GROUP_TIME_RESET_HOOK,
  getGroupTimeState,
  getGroupElapsedTime,
  advanceGroupTime,
  resetGroupTime,
} from "./time.js";
export {
  GROUP_ASSIGNMENTS_CHANGED_HOOK,
  EXPLORATION_POSITIONS,
  EXPLORATION_ROLES,
  getGroupAssignments,
  setMarchingOrder,
  setPositionMembers,
  setExplorationRole,
  setCampWatches,
} from "./assignments.js";
export {
  DEFAULT_EXPLORATION_TURN_SECONDS,
  GROUP_EXPLORATION_ENCOUNTER_HOOK,
  getExplorationTurnSeconds,
  calculateExplorationEncounterSchedule,
  getExplorationEncounterState,
  processDueExplorationEncounters,
} from "./exploration-encounters.js";
export {
  buildGroupMemberStatus,
  openGroupMemberStatus,
} from "./member-status.js";
export {
  REST_TURN_SECONDS,
  REST_TOTAL_TURNS,
  GROUP_REST_WORKFLOW_HOOK,
  calculateRestCheckTurns,
  getGroupRestState,
  startGroupRest,
  continueGroupRest,
  finalizeGroupRest,
} from "./rest-encounters.js";
export { registerGroupSheet };

Hooks.once("init", registerGroupSheet);
registerGroupProcedureService();
registerEnvironmentContextService();
registerGroupTimeService();
registerGroupAssignmentsService();
registerGroupExplorationEncounterService();
registerGroupMemberStatus();
registerGroupRestEncounterService();
