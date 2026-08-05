import { registerGroupSheet } from "./group-sheet/registration.js";
import "./group-sheet/dashboard-layout.js";

export { createGroupActor, SDXGroupSheet } from "./group-sheet/sheet.js";
export { registerGroupSheet };

Hooks.once("init", registerGroupSheet);
