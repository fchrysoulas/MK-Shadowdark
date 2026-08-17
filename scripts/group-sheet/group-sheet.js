import { registerEnvironmentContextService } from "../libs/environment-context.js";
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
export { registerGroupSheet };

Hooks.once("init", registerGroupSheet);
registerGroupProcedureService();
registerEnvironmentContextService();
registerGroupTimeService();
