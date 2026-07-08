// scripts/group-sheet.js

import { registerGroupSheet } from "./group-sheet/registration.js";
export { createGroupActor, SDXGroupSheet } from "./group-sheet/sheet.js";
export { registerGroupSheet };

Hooks.once("init", registerGroupSheet);
