# MK-Shadowdark

Quality-of-life extras and small expansions for the Shadowdark RPG system in Foundry VTT.

## Compatibility

- Foundry VTT v12 through v14
- Shadowdark RPG system 3.5.0+ (verified with 4.0.6)
- Foundry VTT v14 requires a v14-compatible Shadowdark release (4.0.0+)

## Features

- **Auto Damage**: automatically applies damage from attack or spell rolls to targeted tokens, with optional GM-only mode, delay, 3D dice support, and token shake feedback.
- **Character Sheet Tweaks**: adds a configurable compact summary bar to player sheets, optional header styling, Shadowdark logo hiding, and quick access to common stats.
- **Death Timer**: adds a configurable sheet button for starting and managing Shadowdark death timers.
- **Editable Quantity**: lets item quantities be edited directly from actor inventory rows.
- **Encounter Engine - Phase 1**: selects terrain and time-aware encounter tables, resolves number appearing, distance, activity, surprise, reaction, intent, disposition, and morale, then creates an interactive GM chat card with reroll and reveal controls.
- **Equipment Hands**: checks equipped weapons, shields, and hand-occupying gear against available hand slots, either warning or blocking invalid loadouts.
- **Group Sheet**: adds a party/group actor sheet for members, shared inventory, notes, and Camping task assignment.
- **Camping Tasks**: provides Bed Down, Cook, Craft, Entertain, Scavenge, Hunt, Keep Watch, and Predict tasks with DCs, tooltips, icons, and drag-and-drop member assignment.
- **Quickdraw**: marks eligible inventory items as quickdraw, optionally auto-sorting them to the top of inventory lists.
- **Time Passes**: lets the GM show a configurable time-passes splash and roll for a random encounter. Successful encounter rolls can automatically invoke the Encounter Engine.
- **Token Shadows**: draws configurable soft shadows under tokens on the canvas.
- **Corpse Token Automation**: changes dead NPC tokens to a corpse image, preserves/restores original token data, and aligns corpse placement using the token fall point.

## Encounter Engine Phase 1

Open the Encounter Engine from the Token scene controls or right-click a world RollTable and select **MK-Shadowdark: Resolve Encounter**.

The complete GM card includes:

- Encounter and number appearing
- Terrain and time of day
- Distance
- Activity
- Reaction and Foundry disposition
- Intent
- Surprise
- Morale threshold

Each procedure field can be rerolled independently. **Reveal to Players** creates a public version without morale data.

Encounter Profiles are edited from the resolver dialog. Profiles may assign different encounter RollTable UUIDs by terrain and by day, night, or any time. Scene selections can be remembered as scene flags without changing Shadowdark system data.

Macro and module API:

```js
await game.modules.get("mk-shadowdark").api.encounters.openDialog();

await game.modules.get("mk-shadowdark").api.encounters.resolve({
  profileId: "default",
  terrain: "Default",
  period: "auto",
  tableUuid: "RollTable.YOUR_TABLE_ID"
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
  "morale": 7,
  "activity": "Searching the ruins",
  "intent": "Watch the party from cover",
  "disposition": "neutral"
}
```

## Notes

- Settings are grouped in Foundry's module settings menu.
- Base Management was removed from MK-Shadowdark; old API calls receive a compatibility warning.
- Bundled Camping activity icons are from [Game-icons.net](https://game-icons.net/) under CC BY 3.0.
