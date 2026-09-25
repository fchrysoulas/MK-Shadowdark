export const MODULE_ID = "mk-shadowdark";
export const BASTION_ACTOR_TYPE = `${MODULE_ID}.bastion`;
export const BASTION_SHEET_ID = `${MODULE_ID}.BastionSheet`;
export const BASTION_DEFAULT_TYPE = "house";
export const BASTION_VAULT_CAPACITY = 100;
export const BASTION_DEFENSE_KINDS = Object.freeze({
  siegeWeapons: "siegeWeapons",
  warbands: "warbands",
});

export const BASTION_TYPES = Object.freeze([
  {
    key: "house",
    name: "House",
    cost: "200 gp",
    ac: 12,
    hp: 40,
    upgrades: 3,
    buildTime: "1 week",
    description: "A typical sturdy domicile such as a cabin or cob hut.",
  },
  {
    key: "outpost",
    name: "Outpost",
    cost: "300 gp",
    ac: 15,
    hp: 50,
    upgrades: 5,
    buildTime: "2 weeks",
    description: "A fortified camp with 15' high wooden palisade walls.",
  },
  {
    key: "keep",
    name: "Keep",
    cost: "1,000 gp",
    ac: 18,
    hp: 100,
    upgrades: 10,
    buildTime: "1 month",
    description: "60' tall tower, three floors. Supports 1 siege weapon on roof.",
  },
  {
    key: "castle",
    name: "Castle",
    cost: "5,000 gp",
    ac: 18,
    hp: 300,
    upgrades: 20,
    buildTime: "2 months",
    description: "30' high crenelated walls surround a keep (included) and inner courtyard. Walls fit 8 siege weapons (excluding trebuchets).",
  },
]);

export const BASTION_UPGRADES = Object.freeze([
  { key: "aviary", name: "Aviary", icon: "fas fa-dove", cost: "100 gp", description: "Send one message per day via pigeon" },
  { key: "armorer", name: "Armorer", icon: "fas fa-shield-halved", cost: "200 gp", description: "Buy any ordinary armor at +10% cost" },
  { key: "barracks", name: "Barracks", icon: "fas fa-users", cost: "200 gp", description: "Warband heal +1d6 HP while here; accommodates 5 warbands" },
  { key: "blacksmith", name: "Blacksmith", icon: "fas fa-hammer", cost: "100 gp", description: "Buy any ordinary weapons at +10% cost" },
  { key: "brewery", name: "Brewery", icon: "fas fa-beer-mug-empty", cost: "200 gp", description: "+1 to carousing event rolls within bastion" },
  { key: "casino", name: "Casino", icon: "fas fa-dice", cost: "300 gp", description: "Generates 2d20 gp per month" },
  { key: "dungeon", name: "Dungeon", icon: "fas fa-dungeon", cost: "300 gp", description: "Underground prison and tunnels" },
  { key: "granary", name: "Granary", icon: "fas fa-wheat-awn", cost: "100 gp", description: "Warbands each cost 10 gp less in bastion" },
  { key: "idol", name: "Idol", icon: "fas fa-star", cost: "400 gp", description: "+1 to CHA spellcasting checks in bastion" },
  { key: "infirmary", name: "Infirmary", icon: "fas fa-heart-pulse", cost: "200 gp", description: "Patients have ADV on CON checks" },
  { key: "kennels", name: "Kennels", icon: "fas fa-paw", cost: "300 gp", description: "DISADV on checks to sneak into bastion" },
  { key: "library", name: "Library", icon: "fas fa-book-open", cost: "400 gp", description: "+1 on downtime learning checks" },
  { key: "moat", name: "Moat", icon: "fas fa-droplet", cost: "200 gp", description: "20' wide and deep; includes drawbridge" },
  { key: "stable", name: "Stable", icon: "fas fa-horse", cost: "100 gp", description: "Mounts don't need to graze or eat rations" },
  { key: "tavern", name: "Tavern", icon: "fas fa-wine-glass", cost: "200 gp", description: "PCs can carouse in bastion (100 gp limit)" },
  { key: "temple", name: "Temple", icon: "fas fa-landmark", cost: "400 gp", description: "+1 to WIS spellcasting checks in bastion" },
  { key: "tradingPost", name: "Trading Post", icon: "fas fa-store", cost: "100 gp", description: "Buy any basic gear at +10% cost" },
  { key: "trophyRoom", name: "Trophy Room", icon: "fas fa-trophy", cost: "100 gp", description: "Gain 1 XP for each notable trophy placed" },
  { key: "vault", name: "Vault", icon: "fas fa-vault", cost: "200 gp", description: "Securely store up to 100 gear slots of items" },
  { key: "wizardTower", name: "Wizard Tower", icon: "fas fa-wand-sparkles", cost: "400 gp", description: "+1 to INT spellcasting checks in bastion" },
]);
