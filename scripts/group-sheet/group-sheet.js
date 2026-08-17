import { registerGroupSheet } from "./registration.js";
import "./dashboard-behavior.js";

export { createGroupActor, MKGroupSheet } from "./sheet.js";
export { registerGroupSheet };

Hooks.once("init", registerGroupSheet);
