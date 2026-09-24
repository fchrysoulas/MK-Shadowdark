import { registerEnvironmentContextService } from "../libs/environment-context.js";
import { registerGroupAssignmentsService } from "./assignments.js";
import { registerGroupMemberStatus } from "./member-status.js";
import { registerGroupSheet } from "./registration.js";
import { registerGroupProcedureService } from "./procedure.js";
import "./encounters/registration.js";
import "./dashboard-layout.js";

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
  buildGroupMemberStatus,
  openGroupMemberStatus,
} from "./member-status.js";
export { registerGroupSheet };

Hooks.once("init", registerGroupSheet);
registerGroupProcedureService();
registerEnvironmentContextService();
registerGroupAssignmentsService();
registerGroupMemberStatus();
