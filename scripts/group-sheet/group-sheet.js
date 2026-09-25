import { registerEnvironmentContextService } from "../libs/environment-context.js";
import { registerGroupAssignmentsService } from "./assignments.js";
import { registerGroupSheet } from "./registration.js";
import { registerGroupProcedureService } from "./procedure.js";
import { getSettingValue } from "./group-settings.js";
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
} from "./member-status.js";
export { registerGroupSheet };

Hooks.once("init", () => {
  if (getSettingValue("enableGroupActors", true) === false) return;

  registerGroupSheet();
  registerGroupProcedureService();
  registerGroupAssignmentsService();
});

// Environment context is shared by Group Encounters and the GM Screen, so it
// remains available even when the Group Sheet itself is disabled.
registerEnvironmentContextService();
