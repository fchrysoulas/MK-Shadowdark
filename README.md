# MK-Shadowdark

Modular quality-of-life tools, gameplay automation, party management, and character-sheet enhancements for Shadowdark RPG on Foundry VTT.

## Compatibility

- Foundry VTT v12 through v14
- Shadowdark RPG system 3.5.0+ (verified with 4.0.6)
- Encounter Engine Phase 1 was checked against the public Shadowdark `release-3.5.0` source
- Foundry VTT v14 requires a v14-compatible Shadowdark release (4.0.0+)

## Features

- **Auto Damage**: automatically applies damage from attack or spell rolls to targeted tokens, with optional GM-only mode, delay, 3D dice support, and token shake feedback.
- **Character Sheet Tweaks**: adds a configurable compact summary bar with Normal/Grinder resting, a height toggle, optional header styling, Shadowdark logo hiding, quick access to common stats, and an optional icon-only shortcut row for abilities, attacks, spells, and potions.
- **Death Timer**: adds a configurable sheet button for starting and managing Shadowdark death timers.
- **Editable Quantity**: lets item quantities be edited directly from actor inventory rows.
- **Encounter Engine - Phase 1**: follows the Shadowdark random encounter procedure for danger checks, number appearing, distance, activity, awareness, reaction, treasure, and morale guidance, then creates an interactive GM chat card.
- **Equipment Hands**: checks equipped weapons, shields, and hand-occupying gear against available hand slots, either warning or blocking invalid loadouts.
- **Token Equipment Display**: shows held gear beside player tokens, displays two-handed gear once above or below the token, and adds a smaller configurable Quickdraw row.
- **Focus Tracker**: tracks successfully cast Focus spells, enforces configurable capacity, requests maintenance checks at the caster's turn or after damage, and exposes actor-sheet and chat-card controls with a token status icon.
- **Group Sheet**: adds a party/group actor sheet for members, hirelings and mounts, shared inventory, active torch tracking, configurable tab backgrounds and activity columns, Camping task assignment, and ration-aware party resting.
- **Paper Chat**: provides twelve paper-inspired chat themes and a GM visual editor for theme-specific message styling.
- **Camping Tasks**: provides Bed Down, Cook, Craft, Entertain, Scavenge, Hunt, Keep Watch, and Predict tasks with DCs, tooltips, icons, and drag-and-drop member assignment.
- **Quickdraw**: marks eligible inventory items as quickdraw, sorts each inventory group with Quickdraw items first, and supports fixed or actor-based limit expressions such as `3`, `max(1, @dex.mod)`, or `max(1, @dex.mod + gear("bandolier", 2))`.
- **Time Passes**: lets the GM choose 1d6, 2d6, or 3d6 for a time-passes encounter check. An encounter occurs if any die shows 1, and successful checks can invoke the Encounter Engine.
- **Token Shadows**: draws configurable soft shadows under tokens on the canvas.
- **Corpse Token Automation**: changes dead NPC tokens to a corpse image, preserves/restores original token data, and aligns corpse placement using the token fall point.

## Paper Chat

Choose a Paper Chat theme from the module settings. GMs can use the paintbrush control in the Chat tab or its pop-out, then right-click a message element to edit its typography, colors, imagery, border, width, height, spacing, radius, or alignment. Each saved override applies only to the selected theme and synchronizes to all clients. The optional **Apply Theme to Character Sheets** setting applies the selected background and supporting palette to the content below the tabs and the active tab itself, preserving the character sheet's header and inactive navigation.

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
- The inventory sidebar includes a native-style Quick card showing only current/total selections; hover over or focus the card to see the actor, Base, and gear source breakdown.
- Supported operators are `+`, `-`, `*`, `/`, `%`, and `^`. Supported functions are `min`, `max`, `floor`, `ceil`, `round`, `trunc`, `abs`, and `clamp`.
- The result is rounded down to a whole number. `0` means unlimited. Invalid expressions fall back to `3` and write a warning to the console.

## Token Equipment Display

The Token Equipment Display uses the same equipped, stashed, handedness, shield, and hand-occupying rules as Equipment Hands. It refreshes when actor items are created, updated, deleted, or transferred.

- One-handed items appear on the left and right sides. Shields prefer the left and weapons prefer the right; right-click a held icon to swap its hand assignment.
- Two-handed weapons appear in both hand slots; the secondary occupancy icon is grayed out.
- Carried Quickdraw items appear as smaller icons and are omitted from the Quickdraw row while held or stashed.
- Left-clicking can open the item sheet, use or roll the item through Shadowdark, or do nothing. Shift-click skips prompts where the system supports it.
- World settings control everyone/owner/GM visibility, optional icon frames, border thickness and colors, independent held/Quickdraw opacity and scale, Quickdraw icon padding, anchors, and X and Y offsets.

## Focus Tracker

Focus Tracker integrates with the native Shadowdark 3.x and 4.x spell-casting methods. A successful spell with a Focus duration starts a tracked session; failed maintenance checks end it, and a critical failure also marks the spell as lost for the day.

- Start-of-turn and damage reminders are whispered to the caster's owners and active GMs.
- Chat actions can roll the native Focus check, ignore an optional damage prompt, end Focus, or reopen the source spell.
- Active Focus sessions appear as compact custom icons in the MK-Shadowdark summary bar and in the token's top-left conditions/effects area, with a sheet-header fallback when the summary bar is disabled.
- The default simultaneous Focus capacity is configurable from the Focus Tracker settings screen. The module API is available at `game.modules.get("mk-shadowdark").api.focus`.

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
