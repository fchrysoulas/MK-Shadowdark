import { registerGroupSheet } from "./registration.js";
import "./dashboard-layout.js";

export { createGroupActor, SDXGroupSheet } from "./sheet.js";
export { registerGroupSheet };

Hooks.once("init", registerGroupSheet);
