# MK-Shadowdark

Modular quality-of-life tools, gameplay automation, party management, GM tools, and character-sheet enhancements for the **Shadowdark RPG** system on **Foundry VTT**.

MK-Shadowdark uses a **Group-first procedure architecture** while providing two complementary GM-facing surfaces:

1. **Group Management** — the authoritative party/procedure workspace.
2. **GM Screen** — a separate GM-only overview and command surface that consumes the same canonical Group, Scene, Encounter, Combat, and character-feature state.

The Group Sheet remains the gameplay owner for party/procedure state. The GM Screen does not duplicate that state.

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

The old **MK-Shadowdark GM Screen Mock** prototype is not a dependency and is not required for the production GM Screen or any current MK-Shadowdark feature.

---

# Features

## Character and combat automation

- **Auto Damage** — applies targeted attack/spell damage or healing with Shadowdark damage properties and optional token shake feedback.
- **Damage Traits** — Resistance, Immunity, and Vulnerability through Shadowdark Properties and transferring effects.
- **Targeting Assistant** — validates and preserves selected targets for attack/spell automation.
- **Death Timer** — manages Shadowdark death timers while death itself uses Foundry's native Dead status.
- **Detailed Wounds** — GM-managed body-location wounds with automatic penalties for player characters.
- **Editable Quantity** — inventory quantity editing with direct controls.
- **Equipment Hands** — validates equipped weapons, shields, and hand-occupying gear against available hands.
- **Token Equipment Display** — shows held equipment and Quickdraw gear around player tokens.
- **Focus Tracker** — tracks active Focus spells, capacity, maintenance checks, and loss state.
- **Initiative** — grouped hostile initiative while preserving individual player initiatives.
- **Morale Automation** — hostile-force morale, morale leader support, Fleeing, and morale immunity.
- **Targeted Spell DC Effects** — lets targets impose spellcasting DCs through Active Effects.
- **Torch Attack** — uses supported Shadowdark attack APIs for torch attacks.
- **Corpse Token Automation** — replaces dead NPC token art while preserving/restoring token state.
- **Token Shadows** — configurable canvas shadows beneath tokens.

## Group Management

- **Group Sheet** — members, active party, hirelings, mounts, shared inventory, Traveling, Camping, and party resources.
- **Camping Tasks** — Bed Down, Cook, Craft, Entertain, Scavenge, Hunt, Keep Watch, and Predict.
- **Shared Scene Context** — terrain, danger, day/night period, and encounter table belong to the active Scene context.
- **Unified Group Time** — Group procedures store elapsed procedure time while Foundry world time remains the only absolute clock.
- **Marching / Role Context** — Front, Middle, Rear, Scout, Light Bearer, and ordered camp watches.
- **Group Exploration Encounters** — encounter cadence/checks are part of Traveling.
- **Group Resting Interruptions** — Rest Party resolves required encounter checks before benefits/resources finalize.
- **Encounter Staging** — preview-first deployment into the Scene with optional Foundry Combat handoff.
- **GM Member Status** — compact GM-only status affordance for HP/AC/death/wounds/Focus/light/effects.
- **Time Passes** — a GM Screen 1d6/2d6/3d6 selector, standalone public roll, and synchronized v1.6 visual cues with no encounter automation.

## Production GM Screen

MK-Shadowdark includes a **separate GM-only GM Screen** alongside Group Management.

Open it from the **shield button in Token Scene Controls**, or through the module API:

```js
const mk = game.modules.get("mk-shadowdark")?.api;
mk.gmScreen.open();
mk.gmScreen.toggle();
```

The GM Screen is a native Foundry ApplicationV2 surface. It is not a replacement for the Group Sheet and it does not own duplicate gameplay state.

Its production layout contains:

- a persistent active-party/status rail
- a persistent procedure/pressure summary
- a central contextual workspace

Available workspaces, in order, are:

- **Overview** — directly editable Scene Context, Encounter Pressure, Resting, Combat, Morale, and Group/procedure state at a glance.
- **Exploration** — exploration turns, encounter cadence, due checks, Traveling assignments, and exploration generators.
- **Combat** — current Foundry Combat round/turn/combatants and MK Morale overview.
- **Resting** — current rest status, elapsed rest turns, checks remaining, interruption state, Resume Rest, and staging shortcut.
- **Downtime** — settlement-facing generators and downtime tools, including Tavern and Shop creation.
- **Rules** — compact GM Quick Rules for procedure turns, encounter checks, morale, and resting.
- **Tables** — imported Shadowdark source RollTables with search, filtering, rolling, and source metadata.
- **Session Log** — recent canonical Group encounter records with inspection, staging, reveal, and reroll actions.

The **Exploration**, **Combat**, **Resting**, and **Downtime** active tabs use green, red, blue, and dark-blue tints respectively. The former dedicated **Encounter** and **Environment** workspaces are removed; encounter history lives in Session Log, while Scene Context is edited directly on Overview.

The GM Screen reads canonical state from Group, Scene Context, internal encounter services, Encounter Staging, Foundry Combat, Morale, and the prepared GM member-status model. It does not store a second party, procedure clock, encounter, combat, morale, wound, or Focus model.

---

# Source Table Import

The GM Screen **Tables** workspace can import native Foundry RollTables from Markdown transcriptions supplied by the GM. MK-Shadowdark parses the selected files locally and does not bundle the sourcebook table content.

Supported source detection includes:

- **Shadowdark RPG Core Rulebook v4.9**
- **Player's Guide to the Western Reaches V1**
- **Cursed Scroll 1: Diablerie!**
- **Cursed Scroll 2: Red Sands**
- **Cursed Scroll 3: Midnight Sun**
- **Cursed Scroll 4: River of Night**
- **Cursed Scroll 5: Dwellers in the Deep**
- **Cursed Scroll 6: City of Masks**

Imported tables receive stable source keys and metadata. Reimporting the same source table updates the existing RollTable instead of creating a duplicate. Source tables whose dice formula is contextual rather than fixed are preserved as contextual source data and are not exposed as an ordinary generic roll when that would invent a rule the source does not provide.

---

# Group Sheet and Procedure Architecture

The native MK-Shadowdark **Group Sheet** remains the authoritative party/procedure workspace.

Create an Actor and choose **Group** in the Actor creation dialog. MK-Shadowdark creates a normal Foundry Actor using the Group sheet and module flags rather than introducing another core Actor document type.

The Group Sheet structure is intentionally stable. Its main areas remain:

- party / roster member cards
- Traveling
- Camping
- Inventory
- Hirelings
- Mounts

The production GM Screen exists **beside** this interface. New GM overview tools must not require redesigning or replacing the Group Sheet.

## Active party and roster

The Group maintains a roster plus an active-party subset. Procedure assignments, roles, watches, encounter context, Group summaries, and the GM Screen party rail use active members as the canonical party source.

When active membership changes, stale marching/role/watch assignments are normalized.

## Procedure state

The Group procedure service supports:

```text
exploration
resting
combat
downtime
```

This is infrastructure shared by Group procedures and the GM Screen. It is not a second visible navigation system.

## One owner per domain

```text
WHO?       Group active members / roles / watches
WHERE?     Active Scene Context
WHEN?      Group elapsed procedure time + Foundry world time
STATE?     Group procedure state
WHAT?      Internal encounter service
STAGE?     Encounter staging service
COMBAT?    Foundry Combat + MK initiative/morale
VIEW?      Group Management + GM Screen
```

Important invariants:

- Foundry world time is the only absolute clock.
- Group stores elapsed procedure time, not a second world clock.
- Scene Context belongs to Scene state.
- Encounter intervals always mean procedure turns.
- Exploration and Resting decide when encounter checks are due.
- Encounter formulas/tables/reaction/resolution have one internal implementation.
- Time Passes owns only its standalone GM roll and visual cues; Group Time and encounter cadence never call it.
- Encounter staging creates no documents before explicit **Deploy**.
- GM Screen presentation never becomes a duplicate gameplay-state owner.

---

# Encounter Intervals Are Turns

The core cadence rule is:

> **Every encounter interval means a number of procedure turns.**

An interval is never interpreted as a mixed “rounds/hours” value and is not itself a number of hours.

Procedure turn lengths:

- **Exploration:** 6 minutes / 360 seconds per turn.
- **Resting:** 1 hour per turn.

Default danger cadence:

| Danger | Encounter check cadence |
| --- | --- |
| Unsafe | Every 3 turns |
| Risky | Every 2 turns |
| Deadly | Every 1 turn |

The default occurrence check is **1d6**, with an encounter on **1**.

---

# Group Exploration Encounters

Random encounter timing is integrated directly into **Group Traveling**.

The Group derives completed Exploration turns from unified elapsed Exploration time and calculates how many checks are due from the active Scene's danger interval.

With the default 6-minute Exploration turn:

- Unsafe checks after turns 3, 6, 9, ...
- Risky checks after turns 2, 4, 6, ...
- Deadly checks every turn

If a time advance crosses multiple check boundaries, MK-Shadowdark preserves the exact number of due checks rather than collapsing them into one.

The GM can inspect/process the same due state from Group Traveling or the production GM Screen. Both route to the same Group encounter service. Group Traveling retains encounter-pressure/check-due information, while Scene Context editing is centralized on GM Screen Overview.

## Scene encounter context

The active Scene is the source of truth for:

- terrain
- danger level
- requested/effective day or night period
- explicit encounter-table override
- effective encounter table
- encounter interval/formula

The GM edits exactly four Scene Context inputs directly from **Overview**: **Terrain, Danger, Period, and Encounter Table**. The persisted Scene Context contains those four fields only; there is no GM-facing Profile field or `profileId` in Scene Context state.

The internal encounter resolver still owns one canonical Shadowdark rules definition for cadence, outcome tables, rerolls, and compatibility. That implementation detail is not a Scene Context choice.

## Encounter-table selection

The effective table is selected in this order:

1. explicit Scene table override
2. matching canonical terrain + effective day/night table
3. canonical terrain `any` table
4. world fallback encounter table

If no valid table is configured, a due encounter check is not silently consumed.

---

# Group Resting

The existing **Rest Party** action is a staged procedure rather than an immediate heal/resource button.

A normal Group rest lasts:

- **8 resting turns**
- **1 hour per resting turn**
- **8 hours total**

Required encounter checks happen chronologically before rest benefits finalize.

| Danger | Checks during an 8-turn rest |
| --- | --- |
| Unsafe | Turns 3 and 6 |
| Risky | Turns 2, 4, 6, and 8 |
| Deadly | Every resting turn |

The required check turns are snapshotted when the rest begins. Changing the Scene's Danger while that rest is active affects later rests, not the current check schedule; changing Period or Encounter Table can affect how a later due check resolves, but it cannot add, remove, consume, or skip that rest's scheduled checks.

## Rest order of operations

1. GM confirms the active resting party and intended ration use.
2. Group enters Resting and starts the current rest timeline.
3. Group/Foundry time advances to the next required check turn.
4. The internal encounter service performs the occurrence check and resolves an encounter when triggered.
5. If there is no encounter, resting continues.
6. If an encounter occurs, resting pauses immediately.
7. The GM resolves the interruption and explicitly uses **Resume Rest** from Group Management or the GM Screen.
8. After all required checks and the full eight hours complete, planned resources and benefits finalize.

An interrupted rest consumes **0 planned rations** and grants **0 completed-rest benefits** until successful completion.

Camp-watch assignments are available as procedure context but do not automatically modify encounter odds.

---

# Internal Encounter Resolution

The **old standalone Encounter Engine UI is retired**.

There is no separate:

- Encounter Scene Control button
- standalone Encounter dialog
- RollTable directory Resolve Encounter action
- independent encounter clock
- Time Passes → Encounter Engine auto-resolution path

Encounter rules remain centralized as an internal service consumed by Group Exploration, Group Resting, GM Screen actions, and encounter chat-card workflows.

A resolved encounter can include:

- Actor / creature result
- number appearing
- terrain / danger / day-night / table context
- starting distance
- activity
- awareness
- reaction and disposition
- optional intent
- treasure indication
- morale guidance

The full encounter card is GM-only by default. **Reveal to Players** creates a public version without GM-only details.

## Default Shadowdark encounter fields

- starting distance: 1 Close, 2–4 Near, 5–6 Far on 1d6
- creature activity: Shadowdark 2d6 activity table
- awareness: fiction/hiding/detection procedure
- reaction: 2d6, optionally with one interacting character's CHA modifier where requested
- treasure: 50% wandering-monster indication
- morale guidance based on the resolved creature/count

Text RollTable results may use forms such as:

```text
2d6 Goblins
1d4 Giant Spiders (Night)
3 Bandits (Day)
```

Direct world/Compendium Actor results are preferred for reliable staging Actor resolution.

---

# Encounter Staging

A resolved GM encounter card includes **Stage Encounter**, and the production GM Screen can route the latest Group encounter into the same staging service.

```text
Encounter card -> Options -> Preview -> Deploy
```

No Actor import, Token creation, or Combat creation happens during Preview.

Staging supports:

- count adjustment
- reference: originating Group token, selected token, or Scene center
- direction
- compact cluster / line / ring formation
- grid spacing
- hidden / visible deployment
- optional Close/Near/Far distance offset suggestion
- optional Foundry Combat handoff

World Actors are reused. Compendium Actors can be previewed without import and are imported only after explicit Deploy. If a safe Actor source cannot be resolved, no tokens are created.

When **Add to Combat** is selected, the created TokenDocuments enter Foundry Combat through supported document APIs. MK-Shadowdark does not automatically roll initiative or start the round.

A Resting encounter remains interrupted until the GM explicitly resumes the rest.

---

# GM Member Status

The permanent Group member-card layout remains effectively unchanged apart from one compact **GM-only status affordance**.

The same prepared member-status model is used by the production GM Screen party rail.

It summarizes:

- current/max HP
- AC
- native Dead state
- MK Death Timer turns
- Detailed Wounds totals/severity
- active Focus sessions and pending Focus loss
- active Shadowdark light sources
- active, non-suppressed Actor effects/statuses

Presentation severity:

- **Normal** — no notable warning state
- **Attention** — ordinary wounds, Focus, or effects worth reviewing
- **Critical** — 0 HP, Dead/death timer, Critical/Destroyed wound, or pending Focus loss

No copy of this character state is persisted on the Group or GM Screen.

---

# Morale Automation

MK-Shadowdark includes combat-aware Shadowdark morale automation.

At combat start, the primary active GM snapshots the hostile NPC force. That starting force remains the morale baseline even if combatants are later added/removed.

## Trigger

- **Multiple hostile NPCs:** morale checks when living members fall to half or fewer of the starting force.
- **Solo hostile NPC:** morale checks at half HP or lower while still alive.

Morale evaluation is synchronized to the hostile side's turn rather than firing in the middle of damage resolution.

## Roll

```text
1d20 + WIS modifier vs DC 15
```

## Morale leader

The GM can mark one hostile NPC token as **Morale Leader** from the Token HUD.

If an eligible living leader exists, the leader rolls for the force. On failure, remaining morale-eligible enemies are marked **Fleeing**. Without a leader, eligible survivors roll individually.

## Morale immunity

Use the predefined effect:

**Immune to morale checks**

It sets the canonical MK morale-immunity state and excludes that actor from morale rolls/Fleeing application.

The GM Screen displays current Foundry Combat and MK Morale context without replacing the Combat Tracker or creating another morale model.

---

# Time Passes

Time Passes restores the v1.6.0 standalone GM flow. In the GM Screen, choose **1d6**, **2d6**, or **3d6**, then press **Time Passes**. The synchronized splash/progress display appears for all clients and the selected dice are published as a public chat roll after the splash completes. If any selected d6 shows **1**, the original synchronized **ENCOUNTER!** skull splash is displayed.

The result-of-1 behavior is a visual cue only. It does not schedule, resolve, stage, or create an encounter, and it never calls the Encounter service. Encounter timing belongs exclusively to Group Exploration and Resting.

Group Time is fully separate and does not invoke Time Passes for rolls or presentation.

---

# Damage Traits

Create or use a Shadowdark **Property** item such as `Fire`, then select that Property on a weapon, spell, or NPC attack. On a target NPC Feature, add a Damage Trait effect and choose Resistance, Immunity, or Vulnerability with the matching Property.

- **Resistance** halves matching damage, rounding down with a minimum of 1.
- **Immunity** prevents matching damage.
- **Vulnerability** doubles matching damage.
- Immunity takes precedence; matching Resistance + Vulnerability cancel.

The predefined **Magical Attacks** effect makes weapon/NPC attacks count as magical. The predefined **Only Damaged by Magical Sources** effect blocks nonmagical-source Auto Damage. The predefined **Immune to morale checks** effect is consumed by Morale Automation.

---

# Paper Chat

Paper Chat provides twelve paper-inspired chat themes plus a GM visual editor. Theme-specific typography, colors, images, borders, sizing, spacing, radius, and alignment can be customized and synchronized to clients.

---

# Quickdraw Limit Expressions

Quickdraw limits are evaluated per character. Examples:

```text
3
max(1, @dex.mod)
max(1, @dex.mod + gear("bandolier", 2))
3 + gear("potion belt", 3)
```

- `@dex.mod` and other numeric actor roll-data paths are supported.
- `gear("name")` counts matching carried, non-stashed item quantities.
- `gear("name", slots)` multiplies matching quantity by the supplied slot bonus.
- Supported operators: `+`, `-`, `*`, `/`, `%`, `^`.
- Supported functions include `min`, `max`, `floor`, `ceil`, `round`, `trunc`, `abs`, and `clamp`.
- Result is rounded down. `0` means unlimited. Invalid expressions fall back to `3`.

---

# Token Equipment Display

Token Equipment Display uses the same equipped/stashed/handedness rules as Equipment Hands.

- one-handed gear appears on left/right hand sides
- two-handed gear occupies both displayed hand slots, with the secondary occupancy icon grayed out
- held/stashed gear is omitted from the Quickdraw row
- item icons can open/use/roll items according to module settings
- visibility, opacity, scale, anchors, offsets, borders, and Quickdraw presentation are configurable

---

# Focus Tracker

Focus Tracker integrates with Shadowdark 4.x spellcasting. Successful Focus spells start tracked sessions; failed maintenance checks end Focus, and critical failures can also mark the spell lost for the day.

The public API is available at:

```js
game.modules.get("mk-shadowdark").api.focus
```

The Group/GM member-status model consumes canonical Focus state rather than storing another copy.

---

# Targeted Spell DC Effects

A target can impose a spellcasting DC with an Active Effect change such as:

| Key | Mode | Value |
| --- | --- | --- |
| `system.roll.spell.dc` | Any | `18` |

The predefined **Targeted Spell DC** effect starts at DC 18 and can be edited. When multiple protected targets are selected, the highest applicable DC is used.

---

# Internal / Macro APIs

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
mk.gmScreen
```

The compatibility `mk.encounters` surface is headless. It exposes encounter services, not the retired standalone Encounter dialog.

Examples:

```js
const check = await mk.encounterService.check();
const resolved = await mk.encounterService.resolve({ tableUuid: "RollTable.YOUR_TABLE_ID" });

const preview = await mk.encounterStaging.preview(encounterData, {
  formation: "cluster",
  visibility: "hidden",
  addToCombat: false
});

mk.gmScreen.open();
```

Prefer canonical service APIs over private flags or rendered DOM state.

---

# Troubleshooting

## The GM Screen button is missing

The production GM Screen is GM-only. Use the **Token Scene Controls** and look for the shield button. The same screen can be opened with `game.modules.get("mk-shadowdark").api.gmScreen.open()` after the module is ready.

## A Group encounter check is due but cannot run

Verify the active Scene resolves a valid encounter RollTable through the Scene Context configuration on GM Screen Overview.

## Rest Party pauses with a configuration warning

The current danger requires encounter checks but the Scene has no valid encounter table. Configure the Scene Context and continue the same rest.

## Rest Party says Resume Rest

The rest was interrupted. Resolve the encounter/interruption, then explicitly press **Resume Rest** from Group Management or the GM Screen.

## Stage Encounter cannot deploy

The encounter could not be mapped safely to a world or Compendium Actor. MK-Shadowdark intentionally creates no tokens in that case.

## Morale does not trigger

Verify that combat has started, the NPCs are hostile, the primary active GM is connected, the hostile force reached its threshold, morale was not already checked, and the creature is not morale-immune.

## Equipment icons are missing

Verify the item is actually held/equipped according to Shadowdark data and Token Equipment Display visibility/settings allow the current user to see it.

---

## Notes

- Settings are grouped in Foundry's module settings menu.
- Base Management was removed from MK-Shadowdark; old compatibility API calls warn instead of creating the removed actor type.
- The standalone Encounter Engine UI and the old GM Screen Mock prototype are retired.
- **Group Management and the production GM Screen are both supported and coexist.**
- Bundled Camping activity icons are from [Game-icons.net](https://game-icons.net/) under CC BY 3.0.

## License

MIT