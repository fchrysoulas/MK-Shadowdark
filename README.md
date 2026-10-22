# MK-Shadowdark

Quality-of-life tools, combat automation, party management, and themed sheets for **Shadowdark RPG** on **Foundry VTT**.

## Compatibility

- Foundry VTT v13+ (verified with v14).
- Shadowdark RPG system 4.0.0+ (verified with 4.0.6).
- Boat and Bastion sheets support Item Piles integration.

## Installation

Install the module in Foundry using this manifest URL, then enable it in your world:

```text
https://github.com/fchrysoulas/MK-Shadowdark/releases/latest/download/module.json
```

For manual installation, download the [latest module ZIP](https://github.com/fchrysoulas/MK-Shadowdark/releases/latest/download/mk-shadowdark.zip).

## Getting started

- **Settings:** open **Configure Settings → Module Settings → MK-Shadowdark** to configure individual features.
- **Character Dashboard:** select **MK-Shadowdark: Character Dashboard** in the character's **Sheet Configuration**.
- **Group, Boat, or Bastion:** create an Actor and choose the corresponding type.
- **GM Screen:** GMs open it with the **shield** button in **Token Scene Controls**; its gear button opens generator and encounter settings.
- **Isometric board:** the GM uses the **chessboard** button to toggle the Scene overlay and the **sliders** button to open its settings.
- **In-app help:** use the sheets' **i** buttons for controls, assignment rules, and activity details.

## Features

### Character sheets and downtime

| Feature | Summary |
| --- | --- |
| Character Dashboard | Alternative player sheet with equipment slots, Quick Slots, spells, injuries, and Midnight Cyan or Ashen OSR themes. |
| Dashboard Item Sheet | Matching item sheets that retain Shadowdark's native editing controls. |
| Character Sheet Tweaks | Native sheet enhancements, clearer weapon properties, and configurable styling. |
| Summary Bar | Compact HP, Luck, ability, rest, and inventory controls, with a sheet-collapse option. |
| Downtime Points (DTP) | The hourglass button ("Downtime activities" on hover) opens Spiritualism, Skulduggery, Martial Training, Magical Research, and Learning Skills activities through native check dialogs; tracks downtime balances. |
| Learning Skills | Supports paid trainers or another character as teacher, with DTP costs and shared-treasure payment options where applicable. |
| Carousing | GM-managed events with individual or group rolls, contributions, automatic XP/DTP/Luck updates, and campaign-time advancement. |
| Weapon Downtime Upgrades | GM controls for weapon-specific hit bonuses, damage bonuses, and damage-die increases. |

### Combat and spellcasting

| Feature | Summary |
| --- | --- |
| Auto Damage | Applies targeted native attack and spell damage or healing, including damage traits and optional token feedback. |
| Damage Traits | Property-based Resistance, Immunity, and Vulnerability for weapons, spells, and NPC attacks. |
| Sundering | Offers eligible characters 10 seconds to destroy equipped Sundering gear and cancel incoming melee damage. A compact prompt shows the countdown; closing it or letting time run out takes damage. Requires Auto Damage. |
| Targeting Assistant | Keeps attack and spell targets valid, supports multiple targets, and automatically targets the caster for Self spells. |
| Spell Area Templates | Places cubes, lines, circles, or straight walls to select affected tokens before casting, including sized bases on the isometric board. Near cubes are 6 × 6 cells; Far lines are 12 × 1. |
| Spell Effects | Applies linked Spell Effect items to successful spell targets and removes Focus-linked effects when Focus ends. |
| Focus Tracker | Tracks active Focus spells, capacity, maintenance checks, and spell loss, with sheet and chat controls. |
| Targeted Spell DC | Uses target Active Effects to set the spellcasting DC; multiple targets use the highest applicable value. |
| Death Timer | Centered, slightly translucent portrait controls for dying characters, death checks, damage penalties, and native Dead status. |
| Detailed Wounds | GM-managed player injuries with location, severity, recovery, automatic penalties, and editable wound history. |
| Initiative | Individual player initiative with one shared hostile NPC roll and enemy turn. |
| Morale Automation | Checks a hostile force at half strength, or a solo enemy at half HP; supports a morale leader, immunity, and Fleeing status. |
| Torch Attack | Runs torch attacks through Shadowdark's native attack workflow. |

On a spell's **Details** tab, use **Spell area template** to keep automatic core presets, configure a custom area, or choose manual token targets. Place or aim the preview, rotate with **R**, and confirm to open the normal casting dialog. **Escape** cancels and restores earlier targets. You can exclude affected creatures when the spell limits its targets. **Fire Wall** selects six connected cells (30 ft), can bend, and needs no creature targets. A successful cast creates one shaped tile with animated fire; a GM must be online. The animation needs no extra modules, respects reduced-motion settings, and can be disabled with **Animated fire** on a custom contiguous-wall template. With Focus Tracker enabled, the tile disappears when the caster fails a Focus check or chooses **End Focus**. The GM can also move or delete it in Tile Controls. Available with Targeting Assistant enabled; ongoing damage, elevation, and wall blocking remain GM-managed.

### Equipment and tokens

| Feature | Summary |
| --- | --- |
| Editable Quantity | Direct quantity editing in inventory lists. |
| Equipment Hands | Checks weapons, shields, and other held gear against the character's available hands. |
| Quickdraw | Marks ready items, highlights inventory entries, and supports configurable limits such as `max(1, @dex.mod)`. |
| Token Equipment Display | Displays held and Quickdraw gear around tokens, with configurable appearance and click actions. |
| Corpse Token Automation | Replaces dead NPC token artwork and restores the standing token when revived. |
| Token Shadows | Adjustable shadows beneath tokens, with controls for size, offset, opacity, and blur. |
| Isometric Encounter Board | Scene overlay using actual tokens, snapped creature bases, occupied-cell collision checks, and live movement and engagement ranges. |

#### Isometric board controls

Choose **6 × 6 through 18 × 18 cells**, each representing **5 ft**. Adjust tilt, rotation, grid color, and opacity; use **Move Grid** and drag its corners to change width and height independently without changing the cell count. **Fit scene** resets the board view.

Drag the settings panel by its title bar to reposition it; its location is remembered on this client. Controls are grouped into **Grid layout**, **Appearance**, and expandable **Token ranges**. Move tokens by dragging them on the board.

Controls are GM-only; players see the board and drag their own tokens normally. Bases scale with token width. Nearby enemies highlight red during dragging, and movement lines and destination outlines appear only while dragging. Selected tokens use an animated arrow.

### Party and campaign management

| Feature | Summary |
| --- | --- |
| Group Sheet | Shared party workspace for active members, status, treasure, inventory, activities, and linked campaign assets. |
| Shared Inventory | Slot-based item cards with drag-and-drop transfers to owned characters and GM-managed disposal. |
| Traveling | Assign Pathfind, March, Lookout, and Scavenge; submit native checks through Prompt Travelling and reveal progress at activity breakpoints. |
| Camping | Assign Bed Down, Cook, Craft, Entertain, Scavenge, Hunt, Keep Watch, and Predict, with resource handling and reset controls. |
| Party Roles and Roster | Manage marching order, exploration roles, watches, hirelings, warbands, mounts, assignments, and weekly payroll. |
| Boat Actors | Command Deck sheets for hull HP, AC, crew, passengers, cargo, and ship notes; link boats to a Group Sheet. |
| Bastion Actors | Stronghold sheets for construction, upgrades, defenses, warband wages, and an optional 100-slot Vault. |

Traveling, Camping, marching order, and watches are managed in the Group Sheet. Group, Boat, and Bastion sheets offer Dark and Light themes.

### GM tools and generators

| Feature | Summary |
| --- | --- |
| GM Screen | Four zones: Active Party, Quick Actions, Pinned Documents, and Tables, with Scene context controls above them. |
| Scene Context | Scene-owned Encounter Zone, Terrain, Danger, and Period selections; dropdown changes save automatically. |
| Manual Encounter Zone Rolls | Rolls the selected zone and terrain tables, plus configured Danger Level, Starting Distance, and Activity tables, into a GM Journal. |
| Encounter Staging | Preview creature counts, formations, spacing, and visibility before Deploy; optionally add tokens to Foundry Combat. |
| NPC Generator | Creates NPCs with generated names, traits, and ability scores. |
| Monster Generator | Previews generated combat traits, qualities, strengths, weaknesses, and mutations before creating an NPC. |
| Magic Item Generator | Previews type, qualities, and personality before creating a magical Item. |
| Trap Generator | Previews trap results from three separately assigned RollTables before creating a Journal. |
| Hazard Generator | Previews hazard results from its own three assigned RollTables before creating a Journal. |
| Tavern Generator | Generates a named tavern with its defining trait, wealth, food, drinks, and GM notes. |
| Shop Generator | Generates a shop's name, quality, stock, distinguishing trait, and interesting customer. |
| Create Location | Previews a descriptor, location, and feature from linked tables before creating a Journal. |
| Pinned Documents | Per-GM shortcuts to Journals, Actors, Items, and RollTables; removing a pin preserves the original document. |
| RollTable Browser | Searches and rolls existing world RollTables, grouped by their Foundry folders. |
| Source Tables | Imports supported tables from owned source files into world RollTables. |
| GM Screen Transfer | Exports and imports Scene encounter and generator configuration, with RollTable reference remapping. |
| Time Passes | Public 1d6, 2d6, or 3d6 roll after a synchronized splash. Any die showing 1 displays the ENCOUNTER! skull as a visual cue only. |

Configure linked RollTables through **GM Screen → gear**. Encounter, Trap, and Hazard tables have separate assignments. Encounter rolls are manual; Foundry world time and Combat track time and rounds. Time Passes operates independently of Group Time and encounter automation.

### Presentation and integrations

| Feature | Summary |
| --- | --- |
| Paper Chat | Twelve paper-inspired chat themes with a GM visual editor and synchronized styling. |
| Sheet Style Editor | GM controls for character-sheet typography, spacing, and presentation. |
| Chat Reporting | Posts character Luck changes to chat. |
| Journal Sheet | Two-pane journal reader with sidebar navigation; edit pages through Foundry's native editor. |
| Automated Animations Compatibility | Exposes Shadowdark roll item references for Automated Animations when that module is enabled. |

## Active Effects setup

For damage traits, use the same Shadowdark **Property** on the damage source and the target's trait effect. On an NPC Feature's **Effects** tab, enable **Transfer** so the effect applies to its owner.

Resistance halves damage with a minimum of 1; Vulnerability doubles it. Matching Resistance and Vulnerability cancel, while Immunity takes precedence. Healing bypasses damage traits.

The module also provides these predefined effects:

| Effect | Purpose | Effect key |
| --- | --- | --- |
| Only Damaged by Magical Sources | Blocks nonmagical damage. | `system.damage.immunity.nonmagical` |
| Magical Attacks | Makes the actor's attacks count as magical, including temporary enchantments such as Holy Weapon. | `system.damage.source.magical` |
| Targeted Spell DC | Sets the caster's DC when targeting the actor; defaults to 18. | `system.roll.spell.dc` |
| Immune to morale checks | Excludes the actor from morale checks and Fleeing application. | `flags.mk-shadowdark.encounter.moraleImmune` |

Apply these effects to the relevant actor or through an enabled transferring Effect item. Permanent magic weapons use Shadowdark's native magical-item setting.

## Development and support

Run `npm run syntax`, `npm run lint`, and `npm test` for repository validation. Public feature APIs are available through `game.modules.get("mk-shadowdark").api`.

See [CHANGELOG.md](CHANGELOG.md) for release details and [GitHub Issues](https://github.com/fchrysoulas/MK-Shadowdark/issues) for bug reports.

## License and credits

[MIT](LICENSE). Bundled Game-icons.net assets retain their CC BY 3.0 license; see the [Camping](assets/icons/camping/ATTRIBUTION.md) and [effect icon](assets/icons/effects/ATTRIBUTION.md) credits.
