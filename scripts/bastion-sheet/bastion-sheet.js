import { registerBastionSheet } from "./registration.js";
import { rerenderOpenBastionSheets } from "./sheet.js";
import { handleVaultTransferDrop } from "../libs/bastion-vault-transfer.js";

Hooks.on("dropActorSheetData", handleVaultTransferDrop);
Hooks.on("updateActor", rerenderOpenBastionSheets);
Hooks.on("deleteActor", rerenderOpenBastionSheets);

Hooks.once("init", () => {
  registerBastionSheet();
});

export { registerBastionSheet };
