const MODULE_ID = "mk-shadowdark";
const TEMPORARY_TORCH_FLAG = "temporaryTorchAttack";

function normalizeTorchKeywords(value = "torch,torches") {
  return String(value)
    .split(",")
    .map(keyword => keyword.trim().toLowerCase())
    .filter(Boolean);
}

function isTorchLightSource(item, keywords = "torch,torches") {
  if (!item?.system?.light?.isSource) return false;
  const name = String(item.name ?? "").toLowerCase();
  return normalizeTorchKeywords(keywords).some(keyword => name.includes(keyword));
}

function buildTorchWeaponData(lightItem) {
  return {
    name: String(lightItem?.name ?? "Torch"),
    type: "Weapon",
    img: lightItem?.img ?? "icons/svg/fire.svg",
    system: {
      description: lightItem?.system?.description ?? "",
      properties: [],
      ammoClass: "",
      baseWeapon: "",
      damage: {
        oneHanded: "d4",
        twoHanded: ""
      },
      handedness: "1h",
      range: "close",
      type: "melee",
      equipped: true,
      stashed: false,
      quantity: 1
    },
    flags: {
      [MODULE_ID]: {
        [TEMPORARY_TORCH_FLAG]: true,
        sourceItemUuid: lightItem?.uuid ?? null
      }
    }
  };
}

export {
  MODULE_ID,
  TEMPORARY_TORCH_FLAG,
  buildTorchWeaponData,
  isTorchLightSource,
  normalizeTorchKeywords
};
