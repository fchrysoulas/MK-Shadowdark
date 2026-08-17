# MK-Shadowdark

Modular quality-of-life tools, gameplay automation, party management, and character-sheet enhancements for the **Shadowdark RPG** system on **Foundry VTT**.

MK-Shadowdark now uses a **Group-first procedure architecture**: character automation remains on individual actors, while shared exploration, resting, encounters, staging, and party-management procedures are coordinated through the native MK-Shadowdark Group Sheet.

## Compatibility

- Foundry VTT v13+
- Shadowdark RPG system 4.0.0+ (verified with 4.0.6)

## Installation

Manifest URL:

```text
https://github.com/fchrysoulas/MK-Shadowdark/releases/latest/download/module.json
```

Manual release download:

```text
https://github.com/fchrysoulas/MK-Shadowdark/releases/latest/download/mk-shadowdark.zip
```

The old **MK-Shadowdark GM Screen Mock** prototype is not a dependency and is not required for any current MK-Shadowdark feature.

---

## Features

### Character and combat automation

- **Auto Damage**: automatically damages or heals targeted tokens from attack and spell rolls using Shadowdark's spell damage type, with property-based damage reduction, optional GM-only mode, delay, 3D dice support, and token shake feedback for damage.
- **Targeting Assistant**: requires a valid canvas target before attack and spell rolls, shows every selected target in the roll window, and preserves multi-target selections for automation.
- **Damage Traits**: exposes native Shadowdark Properties on spells and NPC attacks, adds resistance, immunity, and vulnerability traits to NPC Features, and reports adjustments on damage chat cards.
- **Character Sheet Tweaks**: adds a configurable compact summary bar with Normal/Grinder resting, a height toggle, optional header styling, Shadowdark logo hiding, quick access to common stats, and an optional icon-only shortcut row for abilities, attacks, spells, and potions.
- **Death Timer**: adds a configurable sheet button for starting and managing Shadowdark death timers while death itself uses Foundry's native Dead status.
- **Detailed Wounds**: adds a GM-managed body-location wound tracker and automatic penalties exclusively to player characters.
- **Editable Quantity**: lets item quantities be edited directly from actor inventory rows.
- **Equipment Hands**: checks equipped weapons, shields, and hand-occupying gear against available hand slots, either warning or blocking invalid loadouts.
- **Token Equipment Display**: shows held gear beside player tokens, represents two-handed occupancy in both hand slots, and adds a smaller configurable Quickdraw row.
- **Focus Tracker**: tracks successfully cast Focus spells, enforces configurable capacity, requests maintenance checks at the caster's turn or after damage, and exposes actor-sheet and chat-card controls with a token status icon.
- **Initiative**: rolls hostile NPCs together using the highest DEX modifier while preserving individual player rolls and keeping the shared enemy slot together on tied initiatives.
- **Morale Automation**: snapshots the hostile force at combat start, checks Shadowdark morale at the correct force/HP threshold, supports a GM-designated morale leader, and applies the Fleeing status on failure.
- **Targeted Spell DC Effects**: lets hostile targets set a spellcasting DC through an Active Effect, for creature defenses such as a lich's Spellward.
- **Torch Attack**: integrates torches as attacks through supported Shadowdark actor APIs.
- **Corpse Token Automation**: changes dead NPC tokens to a corpse image, preserves/restores original token data, and aligns corpse placement using the token fall point.
- **Token Shadows**: draws configurable soft shadows under tokens on the canvas.

### Group procedures

- **Group Sheet**: adds a party/group actor sheet for members, hirelings and mounts, shared inventory, active torch tracking, configurable tab backgrounds and activity columns, Traveling, Camping, and ration-aware party resting.
- **Camping Tasks**: provides Bed Down, Cook, Craft, Entertain, Scavenge, Hunt, Keep Watch, and Predict tasks with DCs, tooltips, icons, and drag-and-drop member assignment.
- **Shared Scene Environment**: the active Scene owns the encounter environment profile, terrain, danger level, day/night context, and encounter-table selection.
- **Unified Group Time**: Group procedures track elapsed seconds while Foundry world time remains the only absolute clock.
- **Marching / Role Context**: supports marching order, Front/Middle/Rear positions, Scout, Light Bearer, and ordered camp-watch slots.
- **Group Exploration Encounters**: encounter cadence and due checks are part of the existing Traveling workflow rather than a standalone Encounter Engine.
- **Group Resting Interruptions**: the existing Rest Party flow advances through required encounter checks before consuming rations or granting rest benefits and can pause/resume after an encounter.
- **Encounter Staging**: resolved encounters can be previewed and deliberately deployed into the active Scene with optional Foundry Combat handoff.
- **GM Member Status**: a compact GM-only status icon on each existing Group member card opens read-only HP/AC/death/wounds/Focus/light/effect details.
- **Time Passes**: synchronized presentation-only splash/progress utility. It no longer rolls or resolves encounters.

### Presentation and inventory utilities

- **Paper Chat**: provides twelve paper-inspired chat themes and a GM visual editor for theme-specific message styling.
- **Quickdraw**: marks eligible inventory items as Quickdraw, sorts each inventory group with Quickdraw items first, and supports fixed or actor-based limit expressions such as `3`, `max(1, @dex.mod)`, or `max(1, @dex.mod + gear("bandolier", 2))`.

---

# Group Sheet and Procedure Architecture

The native MK-Shadowdark **Group Sheet** is the main party/session operating surface.

Create an Actor and choose **Group** in the Actor creation dialog. The module creates the Group as a normal Foundry Actor using the MK-Shadowdark Group sheet and flags rather than adding another core Actor document type.

The current Group Sheet structure is intentionally stable. Its main areas remain:

- party / roster member cards
- Traveling
- Camping
- Inventory
- Hirelings
- Mounts

Newer procedure systems extend those existing areas or use contextual dialogs/chat-card actions. MK-Shadowdark does not add a second GM dashboard for Group procedures.

## Active party and roster

The Group maintains a roster plus an active-party subset. Procedure assignments, Group roles, watches, encounter context, and Group summaries use active members as the canonical party membership source.

When active-party membership changes, stale role/watch/marching assignments are normalized automatically.

## Procedure state

The internal Group procedure state supports:

```text
exploration
resting
combat
downtime
```

This state is shared infrastructure for time, encounters, rest, and later automation. It is not another visible Group navigation system.

## One owner per procedure domain

```text
WHO?       Group active members / roles / watches
WHERE?     Active Scene environment context
WHEN?      Group elapsed procedure time + Foundry world time
STATE?     Group procedure state
WHAT?      Internal encounter service
STAGE?     Encounter staging service
```

Important invariants:

- Foundry world time is the only absolute clock.
- Group stores elapsed procedure time, not a second world clock.
- Scene encounter environment belongs to the Scene, not a duplicate Group profile.
- Encounter intervals always mean **procedure turns**.
- Exploration and Resting decide when encounter checks are due.
- Encounter formulas, tables, reaction, and resolution have one internal implementation.
- Time Passes is presentation-only.
- Encounter staging creates no documents before explicit **Deploy**.

---

# Encounter Intervals Are Turns

The most important cadence rule is:

> **Every encounter interval means a number of procedure turns.**

An interval is never interpreted as “rounds/hours” and is not itself a number of hours.

The procedure defines how long one turn represents:

- **Exploration turn:** 6 minutes / 360 seconds by default.
- **Resting turn:** 1 hour.

The default Shadowdark danger cadence is:

| Danger | Encounter check cadence |
| --- | ---: |
| Unsafe | Every 3 turns |
| Risky | Every 2 turns |
| Deadly | Every 1 turn |

The default occurrence check is **1d6**, with an encounter on **1**.

---

# Group Exploration Encounters

Random encounter timing is integrated directly into **Group Traveling**.

The Group derives completed exploration turns from the unified Exploration elapsed time and calculates how many checks are due from the active Scene's danger interval.

With the default 6-minute Exploration turn:

- Unsafe: checks after turns 3, 6, 9, ...
- Risky: checks after turns 2, 4, 6, ...
- Deadly: checks every turn

If a large time advance crosses more than one check boundary, MK-Shadowdark preserves the exact number of due checks rather than silently collapsing them into one.

The existing Traveling workflow receives a compact encounter-context strip. GMs can configure the Scene encounter context and process due checks there; there is no separate Encounter Engine scene-control application.

## Scene encounter context

The active Scene is the source of truth for:

- environment profile
- terrain
- danger level
- requested/effective day or night period
- explicit encounter-table override
- effective encounter table
- encounter interval/formula

The Group does not duplicate this environment data into separate Travel or Rest profiles.

## Encounter-table selection

The effective encounter table is selected in this order:

1. explicit Scene encounter-table override
2. matching profile terrain + effective day/night table
3. profile terrain `any` table
4. world fallback encounter table

If no valid table is configured, the Group reports the configuration problem before consuming a due encounter check.

---

# Group Resting

The existing **Rest Party** action is a staged procedure rather than an immediate heal/resource button.

A normal Group rest lasts:

- **8 resting turns**
- **1 hour per resting turn**
- **8 hours total**

Required encounter checks happen chronologically before rest benefits are finalized.

| Danger | Checks during an 8-turn rest |
| --- | --- |
| Unsafe | Turns 3 and 6 |
| Risky | Turns 2, 4, 6, and 8 |
| Deadly | Every resting turn |

## Rest order of operations

1. GM confirms the active resting party and planned ration use.
2. Group enters the Resting procedure and resets the current resting timeline.
3. Group/Foundry time advances to the next required check turn.
4. The internal encounter service performs the occurrence check and resolves the encounter if triggered.
5. If no encounter occurs, the rest continues to the next check.
6. If an encounter occurs, the rest pauses immediately.
7. The GM resolves the interruption and explicitly presses **Resume Rest** to continue the same rest.
8. After all required checks are clear and the full eight hours have elapsed, planned rations and rest benefits are applied.

### Resource safety

An interrupted rest consumes **0 planned rations** and grants **0 rest benefits** until it is explicitly resumed and successfully completed.

Rations are consumed once on successful completion. Rest benefits are tracked per participant so a partial benefit-application failure can be continued without double-resting members that already completed.

Camp-watch assignments are available as procedure context but do not currently alter encounter odds automatically.

---

# Internal Encounter Resolution

The old standalone **Encounter Engine Phase 1** UI has been retired.

There is no separate:

- Token/Scene Control Encounter button
- standalone Encounter dialog
- RollTable directory **Resolve Encounter** context action
- independent encounter timeline
- automatic Time Passes → Encounter Engine resolution path

Encounter rules remain centralized as an internal service used by Group Exploration and Resting.

A resolved encounter can include:

- encounter Actor / creature result
- number appearing
- terrain / danger / day-night / table context
- starting distance
- activity
- awareness
- reaction and disposition
- optional expanded intent
- treasure indication
- morale guidance

The full encounter card is GM-only by default. **Reveal to Players** creates the public version without GM-only detail.

## Default Shadowdark encounter fields

The default profile uses:

- starting distance: 1 Close, 2–4 Near, 5–6 Far on 1d6
- creature activity on the Shadowdark 2d6 activity table
- awareness from fiction, hiding, and detection checks
- reaction on 2d6, optionally with one interacting character's CHA modifier where requested
- 50% wandering-monster treasure indication
- morale guidance based on the resolved creature/count

Optional expanded intent and surprise-dice procedures remain profile capabilities but are not required by the core Group workflow.

## Encounter table result text

Text RollTable results may use forms such as:

```text
2d6 Goblins
1d4 Giant Spiders (Night)
3 Bandits (Day)
```

The parser supports:

- a leading count or dice formula
- creature/result label
- optional `(Day)`, `(Night)`, or `(Any)` suffix

Direct world/Compendium Actor results are preferred because they give the staging service a reliable Actor UUID.

Optional encounter metadata may still be stored in `flags.mk-shadowdark.encounter` on direct Actor/results where applicable:

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

---

# Encounter Staging

A resolved GM encounter card includes **Stage Encounter**.

The staging workflow is deliberately explicit:

```text
Encounter card -> Options -> Preview -> Deploy
```

No Actor import, Token creation, or Combat creation happens during preview.

## Staging options

The GM can choose:

- **Count** — defaults to resolved number appearing but can be deliberately changed.
- **Reference** — originating Group token when available, selected token, or Scene center.
- **Direction** — center, north, east, south, or west.
- **Formation** — compact cluster, line, or ring.
- **Spacing** — approximate grid-cell spacing.
- **Visibility** — hidden or visible.
- **Distance offset** — optionally use resolved Close/Near/Far as a placement suggestion.
- **Combat handoff** — optionally add the deployed TokenDocuments to Foundry Combat.

Close/Near/Far is only an approximate staging suggestion. The staging service does not claim to understand walls, line of sight, pathing, cover, or exact tactical geometry.

## Actor handling

- World Actors are reused directly.
- A unique world Actor name may be used as a conservative fallback.
- Compendium Actors can be previewed without import.
- A Compendium Actor is imported only after **Deploy** is confirmed.
- Imported staging Actors are marked with their source UUID and reused later.
- If no safe Actor source can be resolved, MK-Shadowdark shows a manual staging preview and creates no tokens.

## Combat handoff

When **Add to Combat** is selected, deployed TokenDocuments enter Foundry's normal Combat lifecycle.

MK-Shadowdark does **not** automatically roll initiative or start a combat round. Grouped Initiative and Morale Automation continue through their normal hooks.

A Resting encounter remains interrupted after staging; the GM must still explicitly press **Resume Rest** once the interruption is actually resolved.

---

# GM Member Status

The permanent Group member-card layout remains unchanged except for one compact **GM-only status icon** in the card corner.

Clicking the icon opens a read-only contextual summary of:

- current/max HP
- AC
- native Dead state
- MK Death Timer turns when active
- Detailed Wounds totals and affected locations
- active Focus sessions and pending Focus loss
- active Shadowdark light sources
- active, non-suppressed Actor effects/statuses

The icon uses a presentation-only severity classification:

- **Normal** — no notable warning state
- **Attention** — ordinary wounds, active Focus, or active effects worth reviewing
- **Critical** — 0 HP, Dead/death timer, Critical/Destroyed wound, or pending Focus loss

The status dialog reads canonical character/feature state on demand. No copy of that status is persisted on the Group Actor, and players do not receive the GM-only status control.

---

# Morale Automation

MK-Shadowdark includes combat-aware Shadowdark morale automation.

At combat start, the primary active GM snapshots the hostile NPC force. That starting force remains the baseline for the combat even if combatants are later added or removed.

## Trigger

Morale is checked once when the hostile force reaches its threshold:

- **Multiple hostile NPCs:** when living members fall to half or fewer of the starting force.
- **Solo hostile NPC:** when the creature is at half HP or lower while still alive.

Morale evaluation is synchronized to the start of the hostile side's turn rather than firing in the middle of damage resolution.

## Roll

```text
1d20 + WIS modifier vs DC 15
```

## Morale leader

A GM can mark one hostile NPC token as the **Morale Leader** from the Token HUD.

If an eligible living leader exists when morale triggers:

- the leader makes one morale check
- on success, the hostile force holds
- on failure, the remaining morale-eligible hostile force is marked **Fleeing**

Without a leader, each morale-eligible surviving hostile NPC rolls individually and failures are marked **Fleeing**.

## Morale immunity

Use the predefined effect:

**Immune to morale checks**

It sets the canonical MK-Shadowdark morale-immunity actor state and excludes that actor from morale rolls and Fleeing application.

---

# Time Passes

**Time Passes is presentation-only.**

It provides the synchronized splash/progress presentation through the module socket. Unified Group time advancement can optionally reuse that presentation.

Time Passes does **not**:

- prompt for 1d6/2d6/3d6 encounter rolls
- roll encounter dice
- decide whether an encounter occurs
- create encounter-roll chat messages
- resolve encounters
- maintain or advance a competing world-time clock

Encounter timing belongs to Group Exploration/Resting and the unified Group time service.

---

# Damage Traits

Create or use a Shadowdark **Property** item such as `Fire`, then select that Property on a weapon, spell, or NPC attack. On a target NPC's embedded NPC Feature, open **Effects**, choose **Add Damage Trait**, select Resistance, Immunity, or Vulnerability, and select the matching Property. **Resistance** halves damage and rounds down with a minimum of 1, **Immunity** prevents all damage, and **Vulnerability** doubles damage. Immunity takes precedence; resistance and vulnerability cancel when both match. Auto Damage aggregates transferred effects from every NPC Feature and shows the calculation on the chat card. Matching uses the Property UUID, so both source and target must reference the same Property item.

Spell and NPC attack sheets expose a **Properties** selector. Every NPC Feature sheet has an **Effects** tab for damage traits, predefined effects, and ordinary Active Effects. Damage-trait effects are created with Transfer enabled and apply to the NPC that owns the Feature; disabling the effect or Transfer disables the trait. Existing Traits-tab assignments and older actor-level Creature Properties automatically migrate into transferring Active Effects. World Properties must be created separately through Foundry's Items directory. The feature also works with weapon Properties selected through Shadowdark's native weapon sheet.

The predefined **Magical Attacks** effect makes weapon and NPC attacks from an actor count as magical. Add it directly to the actor or to an embedded Effect item such as Holy Weapon; disabling or expiring that effect restores normal attacks. Permanently magical weapons and attacks with a Magic/Magical Property also count as magical.

The predefined Effect **Only Damaged by Magical Sources** prevents Auto Damage from reducing the protected actor's HP when the source is nonmagical. Spells, scrolls, wands, magical attacks, permanently magical weapons, and attacks with a Magic/Magical Property count as magical. Add the predefined effect to an Effect item embedded on any NPC or player character.

The predefined **Immune to morale checks** effect uses:

```text
flags.mk-shadowdark.encounter.moraleImmune = true
```

and is consumed by Morale Automation.

---

# Paper Chat

Choose a Paper Chat theme from the module settings. GMs can use the paintbrush control in the Chat tab or its pop-out, then right-click a message element to edit its typography, colors, imagery, border, width, height, spacing, radius, or alignment. Each saved override applies only to the selected theme and synchronizes to all clients. The optional **Apply Theme to Character Sheets** setting applies the selected background and supporting palette to the content below the tabs and the active tab itself, preserving the character sheet's header and inactive navigation.

---

# Quickdraw Limit Expressions

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

---

# Token Equipment Display

The Token Equipment Display uses the same equipped, stashed, handedness, shield, and hand-occupying rules as Equipment Hands. It refreshes when actor items are created, updated, deleted, or transferred.

- One-handed items appear on the left and right sides. Shields prefer the left and weapons prefer the right; right-click a held icon to swap its hand assignment.
- Two-handed weapons appear in both hand slots; the secondary occupancy icon is grayed out.
- Carried Quickdraw items appear as smaller icons and are omitted from the Quickdraw row while held or stashed.
- Left-clicking can open the item sheet, use or roll the item through Shadowdark, or do nothing. Shift-click skips prompts where the system supports it.
- World settings control everyone/owner/GM visibility, optional icon frames, border thickness and colors, independent held/Quickdraw opacity and scale, Quickdraw icon padding, anchors, and X and Y offsets.

---

# Focus Tracker

Focus Tracker integrates with the native Shadowdark 4.x spell-casting methods. A successful spell with a Focus duration starts a tracked session; failed maintenance checks end it, and a critical failure also marks the spell as lost for the day.

- Start-of-turn and damage reminders are whispered to the caster's owners and active GMs.
- Chat actions can roll the native Focus check, ignore an optional damage prompt, end Focus, or reopen the source spell.
- Active Focus sessions appear as compact custom icons in the MK-Shadowdark summary bar and in the token's top-left conditions/effects area, with a sheet-header fallback when the summary bar is disabled.
- The default simultaneous Focus capacity is configurable from the Focus Tracker settings screen.
- The module API is available at `game.modules.get("mk-shadowdark").api.focus`.

Group GM Member Status consumes this canonical Focus state instead of storing another copy.

---

# Targeted Spell DC Effects

To make spells targeting any creature require DC 18, add an Active Effect to that actor with this change:

| Key | Mode | Value |
| --- | --- | --- |
| `system.roll.spell.dc` | Any | `18` |

You can also select the predefined **Targeted Spell DC** effect, which starts at DC 18; edit its value for a different DC. When a caster targets that token, the spellcasting dialog uses the configured DC and displays it in the heading. The Effect item must be embedded on the targeted actor and its effect must be enabled. The Change mode and v13 Transfer setting are ignored for this target-DC key, so a default **New Effect** works. The effect works on any actor type, including player characters and NPCs. If a spell targets several protected actors, the highest applicable DC is used.

---

# Internal / Macro APIs

MK-Shadowdark exposes small module APIs so features and advanced macros can consume canonical state without parsing UI HTML.

```js
const mk = game.modules.get("mk-shadowdark")?.api;
```

Current service surfaces include, among others:

```js
mk.environment
mk.groupTime
mk.groupAssignments
mk.groupExplorationEncounters
mk.groupRest
mk.groupMemberStatus
mk.encounterService
mk.encounterStaging
mk.encounters
mk.timePasses
mk.focus
mk.morale
mk.tokenEquipment
```

The compatibility `mk.encounters` surface is now **headless**. It exposes internal check/resolve services, not the retired standalone Encounter dialog.

Example headless occurrence check:

```js
const result = await mk.encounterService.check();
console.log(result.check, result.isEncounter, result.context);
```

Example headless resolution:

```js
const result = await mk.encounterService.resolve({
  tableUuid: "RollTable.YOUR_TABLE_ID"
});
console.log(result.encounter, result.reason);
```

Example staging preview without document creation:

```js
const preview = await mk.encounterStaging.preview(encounterData, {
  formation: "cluster",
  visibility: "hidden",
  addToCombat: false
});
```

Prefer these service APIs over reading private flags or Group DOM state directly.

---

# Troubleshooting

## A Group encounter check is due but cannot run

Verify that the active Scene's Group Encounter context resolves a valid RollTable. Use **Encounter Context** in Group Traveling to configure the current Scene.

## Rest Party pauses with a configuration warning

The current danger requires encounter checks but the active Scene has no valid encounter RollTable. Configure the Scene encounter context and continue the same rest.

## Rest Party says Resume Rest

The rest was interrupted. Resolve the encounter/interruption, then explicitly press **Resume Rest**. Staging the encounter does not automatically resume the procedure.

## Stage Encounter cannot deploy

The resolved encounter could not be mapped safely to a world or Compendium Actor. MK-Shadowdark intentionally creates no tokens in that case; use the manual preview as the staging reference.

## Morale does not trigger

Verify that:

- combat has started
- the relevant NPCs are hostile
- the primary active GM is connected
- the hostile force has reached its threshold
- morale has not already been checked for that starting force
- the creature is not using **Immune to morale checks**

## Equipment icons are missing

Verify that the item is actually held/equipped according to Shadowdark data and that Token Equipment Display visibility/settings allow the current user to see it.

---

## Notes

- Settings are grouped in Foundry's module settings menu.
- Base Management was removed from MK-Shadowdark; old API calls receive a compatibility warning.
- The standalone Encounter Engine UI and the separate GM Screen Mock prototype are retired; Group is the supported party/procedure surface.
- Bundled Camping activity icons are from [Game-icons.net](https://game-icons.net/) under CC BY 3.0.

## License

MIT
