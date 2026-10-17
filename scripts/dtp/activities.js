function option(id, dc, starred, label, description) {
  return { id, dc, starred, label, description };
}

const scroll = () => option("scroll", 15, true, "Create a scroll", "Create a scroll of one spell you know of tier 3 or less.");
const potion = () => option("potion", 18, true, "Create a potion", "Create one potion from a spell you know of tier 3 or less.");
const healing = () => option("healing", 18, true, "Potion of Healing", "Create a Potion of Healing.");
const wand = () => option("wand", 20, true, "Create a wand", "Create a wand of a spell you know of tier 3 or less. You can't create a new wand of the same spell until the prior wand breaks.");

const DOWNTIME_ACTIVITIES = [
  {
    id: "spiritualism", title: "Spiritualism", facility: "Temple",
    description: "Meditation, prayer, self reflection, or mystical study.",
    groups: [{
      id: "wis", label: "WIS Check", abilities: ["wis"],
      options: [
        option("favor", 9, true, "Gain favor with a local cult", "The GM decides how the deed affects your narrative reputation with that church."),
        option("strengthening", 15, true, "Spiritual strengthening", "You gain 1 XP."),
        option("insight", 20, true, "Find personal insight", "Reroll one prior talent roll.")
      ]
    }]
  },
  {
    id: "skulduggery", title: "Skulduggery", facility: "Tavern",
    description: "Thievery, criminal activity, or churning the rumor mill.",
    groups: [
      {
        id: "cha", label: "CHA Check", abilities: ["cha"],
        options: [
          option("rumor", 9, false, "Start a rumor", "Start a rumor about one person. Their renown increases or decreases by 1 point (you choose)."),
          option("lay-low", 12, false, "Lay low", "Escape from a minor crime."),
          option("local-rumor", 12, true, "Gain a local rumor", "Gain a local rumor."),
          option("extortion", 15, false, "Extortion", "Increase the value of your next sale by 25%, or reduce the cost of your next purchase by 25%."),
          option("hide-out", 18, false, "Hide out", "Escape from a major crime."),
          option("world-rumor", 20, true, "Gain a world rumor", "Gain a world rumor."),
          option("seed-rumor", 20, true, "Seed a rumor", "Seed a rumor.")
        ]
      },
      {
        id: "dex", label: "DEX Check", abilities: ["dex"],
        options: [
          option("minor-crime", 15, true, "Get away with a minor crime", "1-in-6 chance of a party coming after you after 1d4 days."),
          option("major-crime", 18, true, "Get away with a major crime", "Such as murder. 1-in-6 chance of a party coming after you after 1d4 days.")
        ]
      }
    ]
  },
  {
    id: "martial", title: "Martial Training", facility: "Barracks",
    description: "Weapons and armor training by a suitable expert. Training depends on your class's hit points die.",
    groups: [
      {
        id: "d4", label: "d4 · INT, STR, or DEX Check", abilities: ["int", "str", "dex"], hitDie: 4,
        options: [
          option("bonus", 15, true, "+1 to hit or damage", "Gain +1 to hit or damage with one weapon. Limit once of each per weapon."),
          option("weapon", 18, true, "Learn a new weapon", "Learn to wield a new weapon (d6 damage max).")
        ]
      },
      {
        id: "d6", label: "d6 · INT, STR, or DEX Check", abilities: ["int", "str", "dex"], hitDie: 6,
        options: [
          option("bonus", 12, true, "+1 to hit and damage", "Gain +1 to hit and damage with one weapon. Limit once per weapon."),
          option("proficiency", 15, true, "Learn a weapon or armor", "Learn to wield a new weapon (d10 damage max) or the next step up in armor.")
        ]
      },
      {
        id: "d8", label: "d8+ · INT, STR, or DEX Check", abilities: ["int", "str", "dex"], hitDie: 8,
        options: [
          option("proficiency", 9, true, "Learn armor or a weapon", "Learn to wield a new armor or weapon."),
          option("bonus", 12, true, "+1 to hit and damage", "Gain +1 to hit and damage with one weapon. Limit once per weapon."),
          option("damage-die", 15, true, "Increase a weapon's damage die", "Increase the damage die of one weapon by one step (d12 damage max). Limit twice per weapon.")
        ]
      }
    ]
  },
  {
    id: "research", title: "Magical Research", facility: "Library",
    description: "Studying spells, praying to the gods, or consulting oracles. Available to spellcasters.",
    groups: [
      { id: "int", label: "INT Spellcasters", abilities: ["int"], casterAbility: "int", options: [scroll(), potion(), wand()] },
      {
        id: "wis", label: "WIS Spellcasters", abilities: ["wis"], casterAbility: "wis",
        options: [scroll(), option("trade", 15, true, "Trade a spell", "Trade one spell you know for another of the same tier."), potion(), healing(), wand()]
      },
      { id: "cha", label: "CHA Spellcasters", abilities: ["cha"], casterAbility: "cha", options: [scroll(), potion(), healing(), wand()] }
    ]
  },
  {
    id: "skills", title: "Learning Skills", facility: "Trainer",
    description: "Learn from a capable instructor.",
    groups: [{
      id: "int", label: "INT Check", abilities: ["int"],
      options: [option("learn", 18, true, "Learn a language or auxiliary skill", "With a capable instructor, downtime can teach a new language or a bounded auxiliary skill. This does not grant another class's unique talents or ancestry features unless an explicit campaign rule allows it.")]
    }]
  }
];

const DOWNTIME_OPTIONS = DOWNTIME_ACTIVITIES.flatMap(activity => activity.groups.flatMap(group =>
  group.options.map(entry => ({ ...entry, id: `${activity.id}-${group.id}-${entry.id}`, activity, group }))
));

function getDowntimeOption(id) {
  return DOWNTIME_OPTIONS.find(entry => entry.id === id) ?? null;
}

function getDowntimeGoldCost(actor, entry) {
  if (!entry?.starred) return 0;
  const level = Number(actor?.system?.level?.value);
  return Number.isSafeInteger(level) && level >= 0 && Number.isSafeInteger(level * 10) ? level * 10 : null;
}

async function getDowntimeProfile(actor) {
  let actorClass = null;
  try {
    actorClass = await actor?.system?.getClass?.();
    if (!actorClass && actor?.system?.class) actorClass = await globalThis.fromUuid?.(actor.system.class);
  } catch (_error) {
    // Missing class documents cannot grant class-specific training or research.
  }
  actorClass ??= Array.from(actor?.items ?? []).find(item => item.type === "Class");
  const hitDie = Number(String(actorClass?.system?.hitPoints ?? "").match(/d\s*(\d+)/i)?.[1]) || null;
  const casterAbility = String(actorClass?.system?.spellcasting?.ability ?? "").toLowerCase();
  return { hitDie, casterAbility };
}

function isDowntimeEligible(entry, profile) {
  if (!entry) return false;
  if (entry.group.hitDie) {
    return entry.group.hitDie === 8 ? profile.hitDie >= 8 : profile.hitDie === entry.group.hitDie;
  }
  return !entry.group.casterAbility || entry.group.casterAbility === profile.casterAbility;
}

export {
  DOWNTIME_ACTIVITIES, DOWNTIME_OPTIONS, getDowntimeOption,
  getDowntimeGoldCost, getDowntimeProfile, isDowntimeEligible
};
