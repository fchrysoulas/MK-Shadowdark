export const MODULE_ID = "mk-shadowdark";
export const BOAT_ACTOR_TYPE = `${MODULE_ID}.boat`;
export const BOAT_SHEET_ID = `${MODULE_ID}.BoatSheet`;

export function boatLabel(key, data) {
  const id = `MK_SHADOWDARK.boat.${key}`;
  const i18n = globalThis.game?.i18n;
  return (data ? i18n?.format?.(id, data) : i18n?.localize?.(id)) ?? id;
}
