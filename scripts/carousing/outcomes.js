const CAROUSING_OUTCOMES = Object.freeze([
  { result: 1, description: "You wake up blearily in your bed", xp: 2, dtp: 3, benefit: "" },
  { result: 2, description: "You're locked in the stocks for 1d4 days and fined 3d6 gold for setting a building on fire", xp: 2, dtp: 3, benefit: "" },
  { result: 3, description: "You wake up in a gutter, make a DC 15 CON check or get a random disease", xp: 3, dtp: 4, benefit: "" },
  { result: 4, description: "You hazily remember donating 2d6 gold to a glib priest", xp: 3, dtp: 4, benefit: "Ally" },
  { result: 5, description: "You're fined 2d6 gold for starting a full-tavern brawl", xp: 3, dtp: 4, benefit: "Barred from tavern" },
  { result: 6, description: "The Thieves' Guild bilked you for 1d6 gold", xp: 4, dtp: 5, benefit: "" },
  { result: 7, description: "You led an entire tavern in a wildly insulting song about a disliked noble", xp: 4, dtp: 5, benefit: "Ally" },
  { result: 8, description: "You survived a blindfolded knife throwing demonstration unscathed", xp: 4, dtp: 5, benefit: "Luck token", luck: true },
  { result: 9, description: "By talent (50%) or trickery (50%), you beat a rival crawler in a test of skill", xp: 5, dtp: 6, benefit: "Ally" },
  { result: 10, description: "An angry sorcerer cast a deadly spell at you, but you reflected it off your cup", xp: 5, dtp: 6, benefit: "Luck token", luck: true },
  { result: 11, description: "You performed a humiliating prank on a despised and corrupt merchant", xp: 5, dtp: 6, benefit: "Ally" },
  { result: 12, description: "You defeated a noble in a highly wagered drinking contest", xp: 5, dtp: 6, benefit: "Debt by Noble" },
  { result: 13, description: "You pulled off an ill-advised heist inside a feared sorcerer's tower", xp: 6, dtp: 8, benefit: "Item (80–100)", itemRange: [80, 100] },
  { result: 14, description: "You wake up deep inside the local ruler's stronghold holding one of their priceless family heirlooms. Footsteps approach", xp: 6, dtp: 8, benefit: "Item (90–100)", itemRange: [90, 100] }
].map(outcome => Object.freeze(outcome)));

function getCarousingOutcome(total) {
  if (!Number.isSafeInteger(total) || total < 1) return null;
  return CAROUSING_OUTCOMES[Math.min(total, 14) - 1];
}

function normalizeCarousingBonus(value) {
  const bonus = String(value ?? "").trim().toLowerCase();
  // A fixed event bonus or the campaign's optional extra d6, never arbitrary roll code.
  if (bonus === "1d6") return bonus;
  if (!/^\+?\d+$/.test(bonus)) return null;
  const number = Number(bonus);
  return Number.isSafeInteger(number) && number <= Number.MAX_SAFE_INTEGER - 9 ? String(number) : null;
}

function getCarousingDtpRequirement(bonus, brewery = 0) {
  const normalized = normalizeCarousingBonus(bonus);
  if (normalized === null) return null;
  return getCarousingOutcome(8 + (normalized === "1d6" ? 6 : Number(normalized)) + brewery)?.dtp ?? null;
}

export { CAROUSING_OUTCOMES, getCarousingOutcome, normalizeCarousingBonus, getCarousingDtpRequirement };
