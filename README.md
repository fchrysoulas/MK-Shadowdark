# MK-Shadowdark

Modular quality-of-life tools, gameplay automation, party management, and character-sheet enhancements for Shadowdark RPG on Foundry VTT.

## Compatibility

- Foundry VTT v12 through v14
- Shadowdark RPG system 3.5.0+ (verified with 4.0.6)
- Encounter Engine Phase 1 was checked against the public Shadowdark `release-3.5.0` source
- Foundry VTT v14 requires a v14-compatible Shadowdark release (4.0.0+)

## Features

- **Auto Damage**: automatically applies damage from attack or spell rolls to targeted tokens, with optional GM-only mode, delay, 3D dice support, and token shake feedback.
- **Character Sheet Tweaks**: adds a configurable compact summary bar to player sheets, optional header styling, Shadowdark logo hiding, and quick access to common stats.
- **Death Timer**: adds a configurable sheet button for starting and managing Shadowdark death timers.
- **Editable Quantity**: lets item quantities be edited directly from actor inventory rows.
- **Encounter Engine - Phase 1**: follows the Shadowdark random encounter procedure for danger checks, number appearing, distance, activity, awareness, reaction, treasure, and morale guidance, then creates an interactive GM chat card.
- **Equipment Hands**: checks equipped weapons, shields, and hand-occupying gear against available hand slots, either warning or blocking invalid loadouts.
- **Group Sheet**: adds a party/group actor sheet for members, shared inventory, notes, and Camping task assignment.
- **Camping Tasks**: provides Bed Down, Cook, Craft, Entertain, Scavenge, Hunt, Keep Watch, and Predict tasks with DCs, tooltips, icons, and drag-and-drop member assignment.
- **Quickdraw**: marks eligible inventory items as quickdraw, sorts each inventory group with Quickdraw items first, and supports fixed or actor-based limit expressions such as `3`, `max(1, @dex.mod)`, or `max(1, @dex.mod + gear("bandolier", 2))`.
- **Time Passes**: lets the GM choose 1d6, 2d6, or 3d6 for a time-passes encounter check. An encounter occurs if any die shows 1, and successful checks can invoke the Encounter Engine.
- **Token Shadows**: draws configurable soft shadows under tokens on the canvas.
- **Corpse Token Automation**: changes dead NPC tokens to a corpse image, preserves/restores original token data, and aligns corpse placement using the token fall point.

## Quickdraw Limit Expressions

The Quickdraw limit is evaluated separately for each character. Supported examples:

```text
3
max(1, @dex.mod)
max(1, @dex.mod + gear("bandolier", 2))
3 + gear("potion belt", 3)
```

- `@dex.mod` is shorthand for the character's DEX modifier. Other numeric roll-data paths such as `@abilities.str.mod` and full actor paths such as `@system.level.value` are also supported.
- `gear("name")` counts matching carried, non-stashed item quantities using a case-insensitive partial name match.
- `gear("name", slots)` multiplies each matching item quantity by the supplied slot value. For example, one `Bandolier` with quantity 1 makes `gear("bandolier", 2)` add 2 slots; quantity 2 adds 4 slots.
- Multiple gear bonuses can be combined, such as `max(1, @dex.mod + gear("bandolier", 2) + gear("potion belt", 3))`.
- The inventory sidebar includes a native-style Quickdraw card showing the character's current selections, evaluated total, and the actor/gear sources used by the expression.
- Supported operators are `+`, `-`, `*`, `/`, `%`, and `^`. Supported functions are `min`, `max`, `floor`, `ceil`, `round`, `trunc`, `abs`, and `clamp`.
- The result is rounded down to a whole number. `0` means unlimited. Invalid expressions fall back to `3` and write a warning to the console.

## Encounter Engine Phase 1

Open the Encounter Engine from the Token scene controls or right-click a world RollTable and select **MK-Shadowdark: Resolve Encounter**.

The resolver offers two actions:

- **Check Encounter** rolls the active danger level: Unsafe every 3 rounds/hours, Risky every 2, and Deadly every round/hour. Each check is 1d6, with an encounter on 1.
- **Resolve Now** skips the occurrence check when the GM already knows an encounter happens.

The Shadowdark Core GM card includes:

- Encounter and number appearing
- Terrain, danger level, and time of day
- Starting distance: 1 Close, 2-4 Near, 5-6 Far on 1d6
- Creature activity on the Shadowdark 2d6 table
- Awareness determined through the fiction, hiding, and detection checks
- Reaction on 2d6, optionally adding one interacting character's CHA modifier
- A 50% wandering-monster treasure check
- Morale guidance: DC 15 WIS at half strength or half HP

Intent and random surprise dice remain available as optional expanded profile procedures but are disabled in the Shadowdark Core profile. Each rolled procedure field can be rerolled independently. **Reveal to Players** creates a public version without the GM-only morale information.

Encounter Profiles may assign different RollTable UUIDs by terrain and by day, night, or any time. Profile, terrain, danger level, time, and table override can be remembered per scene without changing Shadowdark system data. Existing Phase 1 default-profile table assignments are migrated into the revised Shadowdark Core profile.

Macro and module API:

```js
await game.modules.get("mk-shadowdark").api.encounters.openDialog();

await game.modules.get("mk-shadowdark").api.encounters.check({
  profileId: "default",
  terrain: "Default",
  dangerLevel: "unsafe",
  period: "auto"
});

await game.modules.get("mk-shadowdark").api.encounters.resolve({
  profileId: "default",
  terrain: "Default",
  dangerLevel: "unsafe",
  period: "auto",
  tableUuid: "RollTable.YOUR_TABLE_ID",
  awareness: "determine",
  reactionMode: "roll"
});
```

Encounter table text results may use forms such as:

```text
2d6 Goblins
1d4 Giant Spiders (Night)
3 Bandits (Day)
```

For direct Actor results, optional metadata can be stored in `flags.mk-shadowdark.encounter`:

```json
{
  "numberFormula": "2d6",
  "activity": "Guarding",
  "intent": "Watch the party from cover",
  "reactionMode": "fixed",
  "fixedReaction": "Hostile",
  "disposition": "hostile",
  "treasure": false,
  "moraleImmune": false
}
```

## Notes

- Settings are grouped in Foundry's module settings menu.
- Base Management was removed from MK-Shadowdark; old API calls receive a compatibility warning.
- Bundled Camping activity icons are from [Game-icons.net](https://game-icons.net/) under CC BY 3.0.
