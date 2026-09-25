# MK-Shadowdark

Modular quality-of-life tools, gameplay automation, party management, GM tools, and character-sheet enhancements for the **Shadowdark RPG** system on **Foundry VTT**.

MK-Shadowdark uses a **Group-first procedure architecture** with Group Management as its active GM-facing party/procedure workspace.

The Group Sheet remains the gameplay owner for party/procedure state. The GM Screen is available alongside it as a GM-facing control surface.

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

- **Character Dashboard paper-doll layout** -- the enlarged figure uses consistent equipment slot sizing, a compact centered AC badge, and an item-style Spells slot above Right Hand.
- The character class value in the dashboard header can be edited with the native Shadowdark class selector.
- Paper-doll and Backpack item cards use full-area artwork.
- Item controls and values remain interactive above the expanded artwork.
- The Languages panel uses the same dashboard panel layout as Conditions and retains native language editing.
- The Vitals panel presents stat labels and values above compact progress bars.
- The paper-doll panel supports a narrower minimum width and a larger central character image.
- The dashboard left panel uses a fixed 220-pixel width.
- The three Quick Slots are arranged horizontally below the paper-doll image.
- The side hand and torso slots stay in the upper paper-doll area while Quick Slots use the full row width below it.
- The paper-doll panel uses a shorter minimum height with Quick Slots positioned higher beneath the image.
- Luck is toggled from an icon-only control in the upper-right character header.
- The Luck icon uses a larger borderless presentation with a hover highlight.
- Luck hover feedback is applied to the icon itself without a visible button rectangle.
- Left-click a weapon in the Right Hand paper-doll slot to use the native Shadowdark attack roll; Shift-click skips its prompt.
- Injuries appear below Conditions, while compact paper-doll Backpack and Spells controls expand and collapse a floating extension beside the sheet. Backpack uses fixed-size slots and item cards span their required slot count. Hovering an equipped weapon shows its native actor-derived attack bonus, damage, and properties.
- The Inventory tab uses the same dark cyan dashboard styling as the Character tab while retaining native inventory controls.
- The Spells, Notes, and Effects tabs use the same dark cyan dashboard styling while retaining native controls and editors.
- Choose the Character Dashboard theme from the module's Character Dashboard settings menu: Midnight Cyan preserves the current look, while Ashen OSR adds a darker soot-and-brass treatment for gritty OSR tables.

- **Dashboard Item Sheet** -- when Character Dashboard is enabled, Shadowdark Items open in the same dashboard visual language while retaining native item editing and tabs; disabling Character Dashboard restores the default item sheets.

- **Character Dashboard talents** -- the Talents tab uses the dashboard theme and includes Boons alongside ancestry, class, and level talents.

- **Character Dashboard progression controls** -- edit current/max HP from the Core Stats card and see a level-up indicator when XP reaches the next-level threshold.

- **Character Dashboard spell casting** -- self-range spells selected from the paper-doll Spells popup automatically target the caster's active token.

- **Auto Damage** — applies targeted attack/spell damage or healing from Shadowdark's native main and damage rolls, routes HP changes through the native `Actor.applyDamage` API, and supports Shadowdark damage properties with optional token shake feedback. Custom chat text without a native damage roll is ignored. Enable Auto Damage Debug Mode when detailed browser-console processing logs are needed.
- **Damage Traits** — Resistance, Immunity, and Vulnerability through Shadowdark Properties and transferring effects.
- **Targeting Assistant** — validates and preserves selected targets for attack/spell automation. Self-range spells automatically use the casting character's active token and do not require a manual target.
- **Spell Effects** — successful targeted spells apply linked Shadowdark Spell Effect items to every selected target, including their duration and embedded Active Effects. Focus sessions retain their cast targets and remove the linked effect when Focus ends or breaks.
- **Death Timer** — manages Shadowdark death timers while death itself uses Foundry's native Dead status. Death checks use Shadowdark's normal/advantage/disadvantage prompt. Damage reduces an active timer by 1, or by 2 for a critical hit, with the reduction posted to chat. Auto Damage retry recovery also handles HP changes that completed before a pending transaction resumed. Enable Death Timer Debug Mode for detailed browser-console diagnostics.
- Player characters are marked Dead when their effective CON reaches 0, including reductions from wound penalties.
- **Detailed Wounds** — shows active injuries below character Stats and opens a GM-managed six-zone wound board. A `2d10` roll selects one of Head, Right/Left Arm, Body, or Right/Left Leg and then resolves a location-specific severity result, including stored rest durations, CON saves, native Dead status, automatic ability penalties, and named consequences in Group status summaries. The collapsed Wound History panel records optional informational timestamps, session markers, source notes, and outcome transitions; GMs can add, edit, or remove history without changing the mechanical wound record.
- **Character Dashboard** — an alternative player sheet selected through **Sheet Configuration → This Sheet → MK-Shadowdark: Character Dashboard**. Its themeable Midnight Cyan or Ashen OSR overview shows the character portrait, core stats, a paper-doll Armor Class badge, a side Luck toggle, clickable ability checks, live Detailed Wounds markers, hand equipment, body armor, three paper-doll Quick Slots, a Backpack with empty boxes for available gear slots, and the editable character details. Drag existing gear onto the hand or torso slots to assign it; drag any Item type into a Quick Slot for one-click access, including items from native inventory lists, other actors, world items, or compendiums. Other body locations appear only when wounded. Native Shadowdark combat, inventory, spells, talents, effects and notes remain available in the top tabs. No launch button is added to the standard sheet.
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
- **Shared Scene Context** — terrain, danger, and day/night period belong to the active Scene context.
- **Marching / Role Context** — Front, Middle, Rear, Scout, Light Bearer, and ordered camp watches.
- **Encounter Staging** — preview-first deployment into the Scene with optional Foundry Combat handoff.
- **Time Passes** — a standalone GM public roll with synchronized v1.6 visual cues and no encounter automation; the action opens its existing dice-choice flow.

## GM Screen

The GM Screen is available to GMs through its shield button in the Token Scene Controls. The `mk.gmScreen` API is also loaded for macros and integrations. Group Management remains the authoritative owner of party and procedure state; encounter services, source-table import, and standalone Time Passes remain available alongside it.

The GM Screen implementation is a native Foundry ApplicationV2 surface. It is not a replacement for the Group Sheet and it does not own duplicate gameplay state.

The **GM Screen | Encounter Roll Debug Mode** setting is disabled by default. Roll Encounter Journal pages use a readable encounter-report layout with the selected table and its three encounter supporting tables separated into category groups: Danger Level, Starting Distance, and Activity. When enabled, the report includes dice formulas, roll totals, and result numbers; otherwise it retains the encounter context and table result text while hiding dice, roll details, and result numbers. Trap and Hazard generator tables are independent and are never rolled by Roll Encounter.

The **GM Screen | Tavern Generator Debug Mode** setting is disabled by default. Tavern Journal pages show a tidy Tavern Overview, distinct food and drinks lists, and editable GM Notes without source tables, dice formulas, or roll totals. When enabled, the page adds the source and full roll details for troubleshooting.

The GM Screen is intentionally a **manual-update surface** for outside changes. It does not subscribe to ambient Scene, Combat, or MK workflow changes in order to force background rerenders, and it does not expose a generic Refresh button. The Active Party is a narrow exception: member HP and active light/torch changes rerender the open screen after a short debounce. Direct GM Screen actions rerender when they complete. The former Hide/Show Active Party rail and Reset GM Screen Presentation controls are retired.

Its production layout contains:

- a persistent active-party/status rail
- a persistent Scene Context strip within the darker header
- **Encounter Zone, Terrain, Danger, and Period selectors in the top strip**
- the active Group selector in the **Active Party** zone
- standalone **Time Passes** and **Roll Encounter** actions in the top strip
- a gear button that opens **GM Screen Settings** in a separate window
- four permanent main-screen zones: **Active Party**, **Quick Actions**, **Pinned Documents**, and **Tables**

Terrain, Danger, and Period **save immediately when their dropdown changes**. There is no Save Context button. The saved Scene Context then rerenders the GM Screen once so all four zones use the new values.

The top strip selects the Scene's Encounter Zone, Terrain, Danger, and Period for the manual **Roll Encounter** action. Roll Encounter uses **1d6** for Unsafe, **2d6** for Risky, and **3d6** for Deadly; other danger values retain the configured Encounter Zone grid fallback. The module does not maintain a Group elapsed-time clock or a GM Screen turn counter; Foundry world time and Foundry Combat remain the authoritative time/round surfaces.

The main screen always shows these four zones from left to right:

- **Active Party** — a Group selector listing every available Group, followed by the selected Group's members with HP, AC, and compact status indicators. There is no separate GM Status inspect button or dialog.
- **Quick Actions** — Encounters, Trap Generator, Hazard Generator, NPC Generator, Monster Generator, Magic Item Generator, Tavern Generator, Shop Generator, and Create Location. These actions run their generators directly, and the Settings Home checkboxes control which actions are visible on the main GM Screen. Encounters, Trap, Hazard, Monster, and Magic Item preview their generated results in a GM dialog with **Create**, **Reroll**, and **Cancel** before creating their Journal Entries, NPC Actors, or Items.
- **Pinned Documents** — a per-GM workspace for Journal entries/pages, Actors, Items, RollTables, and other UUID-backed Foundry documents. Drag a document into the zone to pin it; removing a pin deletes only that shortcut.
- **Tables** — existing world RollTables with a fixed search control, rolling, native sheet access, independently collapsible Foundry folder grouping that starts collapsed, and document icons. The entire Tables zone can be collapsed into a right-side rail when more room is needed for the other zones. Only the folder/table list scrolls. The browser does not import or update tables or infer source metadata; existing imported RollTables remain usable like any other world table.

Every GM Screen Settings feature card on Home provides a **Show in Quick Actions** checkbox for **Encounters**, **Trap Generator**, **Hazard Generator**, **NPC Generator**, **Monster Generator**, **Magic Item Generator**, **Tavern Generator**, **Shop Generator**, and **Create Location**. These visibility choices are stored per GM and update the main screen immediately. NPC generation is configured in **GM Screen Settings -> NPC Generator**, Monster generation in **GM Screen Settings -> Monster Generator**, and magic item generation in **GM Screen Settings -> Magic Item Generator**.
- **GM Screen Settings** — a separate gear-button window with left-side tabs. **Encounters** contains one or more named, collapsible Encounter Zone grids with eight default rows plus three optional RollTable drop areas for Danger Level, Starting Distance, and Activity. In Edit mode, edit each zone name, add or remove zones, and drag RollTables from Foundry onto zone cells or the encounter detail boxes. **Trap Generator** and **Hazard Generator** each provide exactly three Scene-owned RollTable assignments; these assignments are independent from Roll Encounter. In View mode, expand a zone and use its Roll Zone action or click an assigned cell. **Roll Encounter** uses the selected terrain and zone, and records the configured encounter detail tables in a GM-only Journal Entry page. **NPC Generator** contains the Scene-owned RollTable assignments for generated NPC names and traits. Name parts use **Prefix**, one or more **Possible Syllables** tables, **Suffix**, and an optional **NPC Identifier** table rolled as the second name part. Trait assignments cover **Ancestry**, **Age**, **Alignment**, **Wealth**, multiple **NPC Features**, and **Occupation**. Linked tables are rolled when available; missing entries remain blank, and only the NPC name is required. The configurable **Second syllable chance** and **Third syllable chance** decide whether one, two, or three syllable tables are rolled; they default to 33% each. Every generated NPC also receives six ordered 3d6 ability rolls; the rolls and modifiers are recorded in the description and the native NPC ability modifiers are populated on the sheet. **Tavern Generator** contains Scene-owned drag-and-drop assignments for **First Part**, **Second Part**, **Known For**, **Wealth**, **Poor Food**, **Standard Food**, **Wealthy Food**, **Poor Drinks**, **Standard Drinks**, and **Wealthy Drinks** RollTables. The Wealth result is randomly rolled as Poor, Standard, or Wealthy; it determines the complete procedure: Poor rolls 2 times on Poor Drinks and 3 Poor Food entries, Standard rolls 3 times on Standard Drinks plus 1 Poor Food and 2 Standard Food entries, and Wealthy rolls 4 times on Wealthy Drinks plus 2 Standard Food and 2 Wealthy Food entries. Food prices remain tier-specific: 1d4 cp for Poor, 1d6 sp for Standard, and 1d8 gp for Wealthy. Food and drink results are rerolled when they duplicate an earlier result in the same tavern, so each generated list contains distinct options; generation reports an error if the assigned tables cannot provide enough unique results. The first two name rolls are joined to form the tavern name, and Known For supplies the tavern's distinguishing result. When any Tavern assignment is configured, those linked tables are used by **Create Tavern**; otherwise existing imported source tables remain available for legacy scenes.
- **Shop Generator** contains eight Scene-owned drag-and-drop assignments: **Quality**, **First Part**, **Second Part**, **Known For**, **Poor Shop**, **Standard Shop**, **Wealthy Shop**, and **Interesting Customer**. Quality is rolled as Poor, Standard, or Wealthy and chooses the matching shop table; the GM does not select it. When any Shop assignment is configured, **Create Shop** uses only those linked tables; incomplete assignments are reported to the GM. With no linked assignments, imported Core source tables remain available for legacy scenes, with quality rolled on 1d3.
- **Location Generator** contains three Scene-owned drag-and-drop assignments: **Descriptor**, **Location**, and **Feature**. **Create Location** requires all three linked tables; incomplete or unavailable assignments are reported to the GM and no legacy source/import or blank-journal fallback is offered. Location generation previews all three independent results before creating and pinning the Journal.
- **Monster Generator** contains seven Scene-owned drag-and-drop assignments: **Combat**, **Quality**, **Strength**, **Weakness**, **Mutation 1**, **Mutation 2**, and **Mutation 3**. Monster generation requires all seven linked tables, previews every result with **Create**, **Reroll**, and **Cancel**, then creates and pins a native Shadowdark NPC Actor. The active party's average character level is the PL; the NPC AC is PL + 10, the Combat result supplies both attack bonus and level, the attack count is rolled on 1d4, and its attack deals 1d8 damage.
- **Magic Item Generator** contains five Scene-owned linked RollTable assignments: **Name**, **Bonus**, **Benefit**, **Curse**, and **Personality**. It previews every result with **Create**, **Reroll**, and **Cancel**, then creates and pins a native Shadowdark **Basic** Item with `magicItem` enabled and the rolled attributes recorded in its description.
- **GM Screen transfer** — use the GM Screen Settings Home **Export** and **Import** controls to save or restore the active Scene's Encounter Zones, supporting encounter RollTables, environment context, NPC Compositions, Tavern Generator assignments, Shop Generator assignments, Location Generator assignments, Monster Generator assignments, and Magic Item Generator assignments. RollTable references include names for unique-name remapping; unavailable references remain visible as unavailable. Journals, Actors, global settings, and temporary workspace presentation state are not included.

Pinned Documents are presentation-only state stored on the current GM user as document UUIDs. They do not copy Journal/Actor/Item content and do not become Scene, Group, encounter, combat, morale, wound, or Focus state. Journals and NPC Actors created by the GM Screen generators are automatically pinned for the current GM. Pinning or removing a shortcut updates the Pinned Documents zone directly and does not force a full GM Screen rerender.

The Settings **Encounters**, **Trap Generator**, and **Hazard Generator** tabs use distinct tints. Encounter Zones display collapsed by default; expand a zone when you need to inspect or edit its grid. The main screen has no Settlement or Session Log tabs; it always shows Active Party, Quick Actions, Pinned Documents, and Tables. Encounter Zone, Terrain, Danger, and Period are selected from the persistent top strip. **Roll Encounter** rolls the selected zone's terrain die, the assigned terrain cell's RollTable, and each configured Danger Level, Starting Distance, and Activity RollTable. Trap and Hazard assignments are not included in encounter rolls.

The GM Screen reads canonical state from Group, Scene Context, internal encounter services, Encounter Staging, Foundry Combat, Morale, and the prepared Active Party status model. It does not store a second party, procedure clock, encounter, combat, morale, wound, or Focus model.

The GM Screen Settings Home **Export** button saves a versioned JSON configuration for the active Scene through Foundry's native file-save workflow. **Import** opens the standard JSON file chooser, validates the file, and asks for confirmation before replacing the current Scene's GM Screen configuration. Imported RollTable UUIDs are reused when available, or remapped by an exact unique table name; ambiguous or missing tables are left unresolved and reported to the GM.

## Journal Entries

The **Journal Sheet | Use as Default** world setting is enabled by default. When enabled, all Foundry Journal Entries use the module's MK Sandbox Journal-matched two-pane sheet, presenting their pages through a dark sidebar with category headings and page navigation plus a light content area with the same spacing, typography, muted-gold accents, and responsive layout. The custom sheet is display-only; use Foundry's native Journal Page editor to edit page content. Disable it to leave Foundry's normal Journal sheet as the default; the MK-Shadowdark sheet remains available for individual selection.

---

# RollTable Browser

The **Tables** zone lists the RollTables that already exist in the world. Use the fixed search field to find a table, **Roll** to draw from it, or open its native Foundry sheet for editing. Foundry folder paths are retained as independently collapsible grouping headings that start collapsed, and each table displays its document icon. Only the folder/table list scrolls beneath the search area. Existing imported RollTables remain available, but the zone does not expose an Import / Update procedure and does not infer source books or source metadata.

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

Marching order and exploration-role editing remain in Group Management. The production GM Screen no longer edits watches or starts/resumes rests.

## Active party and roster

The Group maintains a roster plus an active-party subset. Procedure assignments, roles, watches, encounter context, Group summaries, and the GM Screen party rail use active members as the canonical party source.

When active membership changes, stale marching/role/watch assignments are normalized.

## Procedure state

The Group procedure service supports:

```text
exploration
combat
downtime
```

This is infrastructure shared by Group procedures and the GM Screen. It is not a second visible navigation system.

## One owner per domain

```text
WHO?       Group active members / roles / watches
WHERE?     Active Scene Context
WHEN?      Foundry world time + Foundry Combat
STATE?     Group procedure state
WHAT?      Manual GM Screen Encounter Zone roll
STAGE?     Encounter staging service
COMBAT?    Foundry Combat + MK initiative/morale
VIEW?      Group Management + GM Screen
```

Important invariants:

- Foundry world time is the only absolute clock.
- Scene Context belongs to Scene state.
- Encounter rolls are explicit GM actions from the GM Screen Settings Encounters tab.
- Legacy encounter formulas/tables/reaction/resolution remain available for existing chat-card records and integrations, but they are not scheduled automatically.
- Time Passes owns only its standalone GM roll and visual cues; no encounter workflow calls it.
- Encounter staging creates no documents before explicit **Deploy**.
- GM Screen presentation never becomes a duplicate gameplay-state owner.

# Manual Encounter Zone Rolls

Encounter timing is no longer advanced by a module clock. The GM decides when to roll from the selected Scene terrain and Encounter Zone using the **Roll Encounter** button in the top strip or the **Encounters** Quick Action. The Quick Action previews the result and offers **Create**, **Reroll**, and **Cancel** before creating its Journal Entry. The **Trap Generator** and **Hazard Generator** Quick Actions use their own three assigned RollTables and offer the same preview controls before creating their Journal Entries.

There is no encounter cadence, due-check queue, or Group turn counter.

The roll sequence is:

1. Roll the selected terrain's Encounter Zone die.
2. Use that result to select the terrain row's RollTable and roll it.
3. Roll each configured Danger Level, Starting Distance, and Activity table.
4. Write one GM-only Journal Entry page containing the encounter context and results.

Trap and Hazard generators have separate settings tabs with three RollTable assignments each. The debug setting controls only dice formulas, roll totals, and result numbers; table result text remains visible to the GM.

---

# Group Encounter Resolution

The former automatic Group encounter timing feature and its separate entry points have been removed. The remaining headless encounter service is retained for existing encounter cards, rerolls, and staging integrations; it does not own a clock or create pending checks.

The old standalone Encounter Engine UI is retired.

There is no separate:

- Encounter Scene Control button
- standalone Encounter dialog
- RollTable directory Resolve Encounter action
- pending encounter-check queue
- Time Passes → encounter auto-resolution path

Encounter rules remain centralized as compatibility services for legacy encounter chat-card workflows.

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

A resolved GM encounter card includes **Stage Encounter**, and the production GM Screen can route encounter history into the same staging service.

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

To resume rest, use the Group Management rest workflow.

---

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

Foundry Combat and MK Morale remain authoritative outside the GM Screen. The GM Screen keeps only the compact active-combat round indicator in its pressure strip; combat tracking and morale controls remain in Foundry's native Combat Tracker and the core automation surfaces.

---

# Time Passes

Time Passes restores the v1.6.0 standalone GM flow. In the GM Screen, choose **1d6**, **2d6**, or **3d6**, then press **Time Passes**. The synchronized splash/progress display appears for all clients and the selected dice are published as a public chat roll after the splash completes. If any selected d6 shows **1**, the original synchronized **ENCOUNTER!** skull splash is displayed.

The result-of-1 behavior is a visual cue only. It does not schedule, resolve, stage, or create an encounter, and it never calls the legacy Encounter service. Time Passes has no connection to encounter timing. Group Time is fully separate and does not invoke Time Passes.

---

# Damage Traits

Create or use a Shadowdark **Property** item such as `Fire`, then select that Property on a weapon, spell, or NPC attack. On a target NPC Feature, add a Damage Trait effect and choose Resistance, Immunity, or Vulnerability with the matching Property.

- **Resistance** halves matching damage, rounding down with a minimum of 1.
- **Immunity** prevents matching damage.
- **Vulnerability** doubles matching damage.
- Immunity takes precedence; matching Resistance + Vulnerability cancel.

The predefined **Magical Attacks** effect makes weapon/NPC attacks count as magical. The predefined **Only Damaged by Magical Sources** effect blocks nonmagical sources while allowing spells, magic items, actor-level magical attacks, and attacks with a Magic/Magical Property. The predefined **Immune to morale checks** effect is consumed by Morale Automation.

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

Active Focus spells appear at the start of the actor sheet's Spells tab, before Spells Known, with the current Focus capacity, spell name, maintenance status, pending-check count, and direct Check, Open, and End controls. Focus maintenance checks do not require a canvas target; the initial Focus spell cast still uses normal spell targeting, except Self spells that automatically target the caster. Chat reminders use the same explicit actions; hold Shift while choosing Check to skip the native prompt when appropriate.

The public API is available at:

```js
game.modules.get("mk-shadowdark").api.focus
```

The Group/GM Active Party model consumes canonical Focus state rather than storing another copy.

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
mk.groupAssignments
mk.groupEncounters
mk.timePasses
mk.focus
mk.morale
mk.tokenEquipment
mk.characterDashboard
```

`mk.groupEncounters` exposes the Group-owned encounter service and staging helpers.

Examples:

```js
const check = await mk.groupEncounters.check();
const resolved = await mk.groupEncounters.resolve({ tableUuid: "RollTable.YOUR_TABLE_ID" });

const preview = await mk.groupEncounters.staging.preview(encounterData, {
  formation: "cluster",
  visibility: "hidden",
  addToCombat: false
});

```

Prefer canonical service APIs over private flags or rendered DOM state.

---

# Troubleshooting

## The GM Screen button is missing

The shield button is available to GMs in the Token Scene Controls. If it is missing, verify that the module is enabled, the current user is a GM, and the world is serving the current `module.json` rather than a cached module installation.

## I need to roll an encounter

Select a Scene terrain and Encounter Zone, then configure one or more named Encounter Zone grids and supporting RollTables in **GM Screen -> gear -> Encounters**. Press **Roll Encounter** to roll the selected zone. There is no pending encounter-check queue or elapsed-time trigger to process.

## Scene Context changes do not affect the other GM Screen zones

Terrain, Danger, and Period auto-save when their top-strip dropdown changes and then perform one explicit GM Screen rerender. There is no Save Context button. The Tables zone is reserved for browsing imported source RollTables and existing world RollTables.

## I cannot select Terrain

Terrain choices in the top strip come from the active Scene's configured Encounter Zone columns. The Tables zone browses existing world RollTables and does not determine terrain sources.

## A Pinned Document shortcut disappeared from the source document

Pinned Documents stores only the document UUID as a per-GM shortcut. It does not copy the source document. If the original Actor, Journal, Item, RollTable, or other document is deleted, the shortcut can no longer open it and may be removed from Pinned Documents.

## The GM Screen does not update after a general external Actor, Scene, or Combat change

This is intentional for general outside changes. The Active Party has a narrow live-refresh path for member HP and active light/torch status; use an explicit GM Screen action, change a top context dropdown, or reopen the screen when you want the rest of the four-zone surface rebuilt.

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
- The standalone encounter UI and the old GM Screen Mock prototype are retired.
- **Group Management and the production GM Screen are both supported and coexist.**
- Bundled Camping activity icons are from [Game-icons.net](https://game-icons.net/) under CC BY 3.0.

## License

MIT
