import { registerBastionSheet } from "./registration.js";
import { handleVaultTransferDrop } from "../libs/bastion-vault-transfer.js";

Hooks.on("dropActorSheetData", handleVaultTransferDrop);

Hooks.once("init", () => {
  registerBastionSheet();
});

export { registerBastionSheet };
