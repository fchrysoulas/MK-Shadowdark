import { registerGroupSheet } from "./registration.js";
import "./dashboard-layout.js";

export { createGroupActor, MKGroupSheet } from "./sheet.js";
export { registerGroupSheet };

Hooks.once("init", registerGroupSheet);
