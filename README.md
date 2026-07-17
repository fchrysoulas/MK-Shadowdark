# MK-Shadowdark

Modular quality-of-life tools, gameplay automation, party management, and character-sheet enhancements for Shadowdark RPG on Foundry VTT.

## Compatibility

- Foundry VTT v12 through v14
- Shadowdark RPG system 3.5.0+ (verified with 4.0.6)
- Foundry VTT v14 requires a v14-compatible Shadowdark release (4.0.0+)

## Features

- **Auto Damage**: automatically applies damage from attack or spell rolls to targeted tokens, with optional GM-only mode, delay, 3D dice support, and token shake feedback.
- **Character Sheet Tweaks**: adds a configurable compact summary bar to player sheets, optional header styling, Shadowdark logo hiding, and quick access to common stats.
- **Death Timer**: adds a configurable sheet button for starting and managing Shadowdark death timers.
- **Editable Quantity**: lets item quantities be edited directly from actor inventory rows.
- **Equipment Hands**: checks equipped weapons, shields, and hand-occupying gear against available hand slots, either warning or blocking invalid loadouts.
- **Group Sheet**: adds a party/group actor sheet for members, shared inventory, notes, and Camping task assignment.
- **Camping Tasks**: provides Bed Down, Cook, Craft, Entertain, Scavenge, Hunt, Keep Watch, and Predict tasks with DCs, tooltips, icons, and drag-and-drop member assignment.
- **Quickdraw**: marks eligible inventory items as quickdraw, optionally auto-sorting them to the top of inventory lists.
- **Time Passes**: lets the GM show a configurable time-passes splash and roll for a random encounter.
- **Token Shadows**: draws configurable soft shadows under tokens on the canvas.
- **Corpse Token Automation**: changes dead NPC tokens to a corpse image, preserves/restores original token data, and aligns corpse placement using the token fall point.

## Notes

- Settings are grouped in Foundry's module settings menu.
- Base Management was removed from MK-Shadowdark; old API calls receive a compatibility warning.
- Bundled Camping activity icons are from [Game-icons.net](https://game-icons.net/) under CC BY 3.0.
