# Changelog

## 1.9.17

- Added the selectable Character Dashboard and dashboard-styled Item sheets.
- Improved Focus Tracker, Auto Damage, Death Timer, Corpse Token, Character Sheet Tweaks, Summary Bar, Targeting Assistant, and Detailed Wounds presentation and reliability.
- Removed the Survival Wound Profile feature and the standalone Encounter Engine surface.
- Added the production GM Screen with a Scene-owned Encounter Zone editor, manual Roll Encounter workflow, Danger Level and supporting RollTable slots, GM-only Journal reports, and optional roll debug details.
- Split Trap and Hazard configuration into separate GM Screen generator tabs with three Scene-owned RollTable assignments each; normal Encounter rolls no longer include Trap or Hazard tables.
- Made GM Screen Settings Home feature cards data-driven with consistent typography and per-GM Quick Action visibility controls for every generator/settings feature, including Trap and Hazard.
- Replaced the GM Screen Settlement and Session Log tabs with a permanent four-zone layout: Active Party, Quick Actions, Pinned Documents, and Tables.
- Added an Encounters Quick Action preview dialog with Create, Reroll, and Cancel controls before the GM-only Journal Entry is created.
- Automatically pinned Journals and NPC Actors created by GM Screen generators to the current GM's Pinned Documents zone.
- Changed Trap and Hazard Quick Actions to resolve their assigned generator RollTables and preview Create, Reroll, and Cancel before creating their Journals instead of only opening Settings.
- Replaced GM Screen Settings Home drag sources with per-GM Show in Quick Actions checkboxes that immediately control Quick Action visibility.
- Encounter Zone groups now display collapsed by default in GM Screen Settings.
- Removed the separate Group Management action and moved standalone Time Passes and Roll Encounter actions into the Scene Context row. Roll Encounter now derives its die from Danger (Unsafe 1d6, Risky 2d6, Deadly 3d6) while retaining the legacy grid fallback for other values.
- Matched the Scene Context Time Passes and Roll Encounter controls to the full-height accented button treatment used by the GM Screen strip.
- Added a Shop Generator Settings tab with five Scene-owned linked RollTable assignments for Poor, Standard, and Wealthy shop types, Shop Name/Known For, and Interesting Customer results.
- Split the linked Shop Generator name and Known For assignments into separate First Part, Second Part, and Known For RollTables.
- Shop quality is now rolled from a linked Quality RollTable instead of selected; legacy imported tables use a 1d3 quality roll.
- Rearranged Shop Generator assignments into a compact Title, Description, and Assigned RollTable grid, with a reusable template for other generators.
- Applied the compact Title, Description, and Assigned RollTable template to Trap, Hazard, Tavern, and Location Generator assignments.
- Applied the same compact assignment layout to NPC Name Composition and NPC Traits, with two Possible Syllable rows and three NPC Feature rows.
- Added a Location Generator Settings tab with Scene-owned Descriptor, Location, and Feature RollTable assignments; Create Location now resolves linked tables before its Create/Reroll/Cancel preview.
- Added a Monster Generator Settings tab and Quick Action with Scene-owned Combat, Quality, Strength, Weakness, and three Mutation RollTable assignments; generated monsters are previewed, created as native Shadowdark NPC Actors, and pinned like the other GM Screen generators. Their AC uses the active party's average level + 10, Combat supplies attack bonus and level, and each NPC receives a rolled 1d4 attack count with 1d8 damage.
- Added a Magic Item Generator Settings tab and Quick Action with Scene-owned Name, Bonus, Benefit, Curse, and Personality RollTable assignments; generated results are previewed, created as native Shadowdark Basic Items, and pinned to the current GM's Pinned Documents.
- Removed the legacy Location source-table import prompt and blank-journal fallback; Create Location now requires all three linked Location Generator RollTables.
- Removed the Combat/Round tracker from the GM Screen header.
- Made the right-side Tables zone collapsible so the remaining GM Screen zones can use the freed space.
- Added debounced GM Screen Active Party updates for member hit points and active torch/light changes.
- Removed the GM Status inspect buttons, dialog, and API; Active Party keeps only its compact inline indicators.
- Shortened the Active Party heading to Party and narrowed the party rail further.
- Removed the Party heading and member counter so the party rail header contains only the Group dropdown.
- Moved wound and active-torch counts into the compact HP/AC stats row.
- Fixed Party and Quick Actions to equal-width columns; only Pinned Documents grows with available space.
- Changed Pinned Documents to use two columns when the flexible zone has room.
- Set GM context action buttons to a 40px minimum height with 5px margins instead of forcing full-height stretch.
- Moved the Scene Context dropdowns and Time Passes/Roll Encounter controls into the GM Screen header and darkened the header background.
- Matched the Active Party, Quick Actions, Pinned Documents, and Tables header heights while keeping the party selector compact.
- Moved active Group selection into the Active Party zone as a dropdown listing every available Group, and removed the Group buttons from the GM Screen header.
- Removed displayed dice-formula metadata from GM Screen Tables rows while preserving table search, rolling, and native sheet actions.
- Added GM Screen Session Log tools and source-table browsing improvements.
- Added editable named Encounter Zone groups with multiple collapsible Scene-owned grids and group-specific Roll Zone actions.
- Removed Group elapsed-time/turn tracking and automatic exploration/rest encounter checks; encounter rolls are now explicit GM actions with no pending check queue.
- Removed the GM Screen Procedure control and replaced it with an Encounter Zone selector plus a separate final Roll Encounter header control.
- Enabled Settlement creation for the **NPC Generator** and source-driven Point-of-Interest Location Journals; the generator uses the linked Scene RollTables configured in Compositions.
- Added Scene-owned NPC name and trait compositions with multiple Possible Syllables and NPC Feature tables, configurable second- and third-syllable chances, an optional NPC Identifier table rolled as the second name part, and linked Ancestry, Age, Alignment, Wealth, and Occupation tables.
- Replaced the NPC Generator's single Two-syllable chance with independent 33% defaults for adding a second and a third syllable.
- NPC generation now uses only the linked Scene RollTables; the imported Core NPC table fallback and import/update prompt have been removed. Missing linked tables leave their profile entries blank, and only the NPC name is required.
- NPC generation now rolls Strength, Dexterity, Constitution, Intelligence, Wisdom, and Charisma in order using 3d6, records each roll and Shadowdark modifier in the NPC description, and writes the calculated native modifiers to the NPC sheet.
- Simplified generated NPC ability display to show each final score with its modifier in parentheses.
- Reordered generated NPC profile details so Name and Identifier lead, followed by Features and the remaining traits.
- Removed the Tables-tab Import / Update control; existing RollTables remain searchable, rollable, and editable without source or grouping assumptions in the browser.
- RollTable browser entries now retain Foundry folder paths as groups and display each table's document icon.
- RollTable folder groups in the Tables tab are independently collapsible and start collapsed.
- Added GM Screen configuration Import and Export controls for Scene-owned Encounter Zones, supporting encounter tables, environment context, NPC Compositions, and Tavern Generator assignments.
- Moved GM Screen configuration Import and Export controls from the live GM Screen header to GM Screen Settings Home.
- GM Screen exports now use Foundry's native file-save workflow, matching MK-Compendiums.
- Moved the GM Screen NPC Generator into a separate gear-button Settings window with left-side navigation.
- Added draggable Encounters, NPC Generator, and Tavern Generator shortcuts to the end of their GM Screen Settings Home cards for pinning on Overview; removed the separate Open buttons.
- Added a Tavern Generator Settings tab with Scene-owned drag-and-drop assignments for First Part, Second Part, Known For, Wealth, Poor/Standard/Wealthy Food, and Poor/Standard/Wealthy Drinks RollTables; linked Wealth rolls now choose the matching tier tables and complete food and drink procedure.
- Tavern food and drink generation now rerolls duplicate results so every generated list contains distinct options, with a clear failure when the assigned tables cannot supply enough unique entries.
- Tidied Tavern Journal pages with a Tavern Overview, readable Food and Drinks sections, editable GM Notes, and optional Tavern Generator debug details; generated text now preserves ampersands correctly.
- Hardened Overview shortcut drag-and-drop handling across Foundry drag payload formats and ApplicationV2 identifiers.
- Pinned GM Screen actions now execute Roll Encounter, NPC Generator, and Tavern Generator directly from Overview.
- Moved GM Screen Encounters into the Settings window and removed the Encounters tab from the main GM Screen navigation.
- Removed the Session Log GM Tools button panel and its unused controls.
- Simplified the Tables workspace by removing its redundant RollTables header, keeping search fixed at the top, and limiting scrolling to the folder/table list.

## 1.9.16

- Added a body-centric **Character Dashboard** opened from player sheets, with a central figure, live Detailed Wounds markers, worn/held and carried gear, and drag-and-drop item assignment to body slots.
- Player characters whose effective CON falls to 0 are now marked Dead; HP healing no longer clears Dead while CON remains at 0.
- Replaced the Detailed Wounds character-sheet tab with an active-wounds summary below Stats; clicking Wounds now opens the full body-location board in a separate window.
- Reworked Detailed Wounds into the requested six-zone location distribution with location-specific severity tables, stored concussion/rest durations, Heart CON saves, fatal wound handling, and exact ability penalties.
- Updated Group Sheet wound summaries to recognize six-zone result records, ignore scars, and show named consequences.
- Added the **Journal Sheet | Use as Default** world setting to enable or disable the MK-Shadowdark Journal sheet as the default for all Journal Entries.
- Set Journal page `h1`, `h2`, and `h3` headings to the dark journal text color.
- Added Journal Entry page categories to the MK-Shadowdark Journal sidebar, with uncategorized pages grouped separately.
- Left-aligned the Journal sidebar title, type, category labels, and page rows.
- The custom Journal Sheet remains display-only; page editing continues through Foundry's native Journal Page editor.
- Temporarily disabled the GM Screen: its Scene Controls button, module API, scripts, and styles no longer load. Group Management, encounter services, and standalone Time Passes remain available.

## 1.9.15

- Added a custom Journal Entry sheet matching MK Sandbox Journal's two-pane page browser, including its dark sidebar, muted-gold accents, light content area, and responsive layout.
- Simplified the GM Screen Tables workspace to show only imported source RollTables; Encounter Setup is no longer rendered there.
- Removed the GM Screen Tools workspace, manual generator configuration, and its NPC/Journal creation actions.
- Removed the source-driven NPC and Location generators and their creation buttons from the GM Screen workspaces.
- Removed the hardcoded Overview NPC creation button and its missing-table hover status.
- Removed the NPC Script Macro and its module API surface.
- Split Core NPC Qualities into independent **Appearance**, **Does**, and **Secret** RollTables and rolls.
- Finalized the GM Screen top strip as the authoritative at-table control surface: Terrain, Danger, and Period now save immediately when changed, and the old Save Context action is gone.
- Added **Safe** danger as a real no-encounter state. Safe Exploration accrues no checks, direct encounter checks do not roll, and a rest begun while Safe snapshots zero encounter checks.
- Reworked GM Screen time controls so clicking **Elapsed** advances exactly one canonical turn with no popup or custom-time dialog: Exploration advances 6 minutes, an active Rest advances 1 hour, Combat advances 6 seconds, and elapsed display is limited to hours/minutes.
- Moved session controls into Session Log with a free-text starting date/time label, **Start Session**, and **Reset Timer**. Starting a session records its boundary and Session Log now shows only encounter history from that session onward before applying the existing recent-history cap.
- Bound the GM Screen Resting procedure to the canonical Group rest workflow. Resting can no longer be manually entered or exited from the Procedure selector, while Elapsed remains available during a real active rest.
- Removed the GM Screen presentation-only Hide/Show Active Party and Reset Presentation controls, widened the Time Passes dice selector, and kept Time Passes presentation-only and separate from canonical encounter scheduling.
- Simplified Exploration to actionable pressure only: Turns, Next Check, Due, Encounter Table, and latest check. Terrain, Danger, Period, Turn Length, and Cadence are no longer duplicated inside the workspace.
- Renamed the visible Downtime workspace to **Settlement** while preserving the internal `downtime` compatibility id; the workspace now focuses on Tavern and Shop generation and no longer displays Resting/Camp status.
- Compacted the permanent Active Party rail without restoring collapse controls, keeping HP, AC, status, wounds, Focus, light, effects, Death Timer, and sheet access visible in a denser layout.
- Upgraded Overview into a true home dashboard with compact Procedure/Elapsed, Light, Encounter pressure, and Session summary above the existing per-GM pinned Foundry document shortcuts; pin/unpin remains local and does not force a full GM Screen rerender.
- Added a persistent warning when Scene Danger is changed to Safe while an already-active rest still retains snapshotted encounter checks from the danger cadence that existed when that rest began.
- Preserved the GM Screen's explicit-update architecture: no ambient Actor/Scene/Combat refresh hooks, no duplicate gameplay-state owner, Group Management remains authoritative for marching order/roles/watches/rest controls, Foundry Combat remains authoritative for combat state, and Scene Context remains authoritative for encounter environment state.

## 1.9.14

- Moved GM Screen Terrain, Danger, and Period editing into the persistent top strip with a staged **Save Context** action; no Scene Context field auto-saves, and one explicit rerender occurs only after a successful save.
- Replaced the Overview status dashboard with a per-GM drag/drop shortcut canvas for UUID-backed Foundry documents such as Journals, Actors, Items, and RollTables; clicking opens the original document and pin/remove operations update locally without a full GM Screen rerender.
- Aligned and vertically corrected Overview shortcut interaction hitboxes.
- Replaced the GM Screen Group Procedure popup with an immediate top-bar dropdown selector.
- Added icons to GM Screen workspace navigation and merged the Resting status surface into Downtime.
- Removed the dedicated GM Screen Rules workspace and its navigation tab; the remaining GM Screen workspaces retain their existing controls.
- Removed Scene Context, Encounter Pressure, Resting, Combat/Morale, and Light summary cards from rendered Overview; active-party Light pressure remains in the persistent top strip.
- Simplified the GM Screen into an explicit-update surface: removed ambient Actor/Scene/Combat/workflow refresh hooks and the generic Refresh button, removed GM Screen Marching Order/role, camp-watch, rest-start/resume, Group Traveling, and Group Camping controls, and kept those authoritative workflows in Group Management.
- Changed Tables Encounter Setup to stage Encounter Zone and Encounter Table until **Save Encounter Setup** is pressed; selecting an Encounter Zone still previews its imported terrain columns without persisting them.
- Removed automatic GM Screen presentation persistence. Selected Group/workspace and party-rail state are now application-local only; party-rail controls remain available without silently writing preferences. Overview document pins are the exception: they are explicit per-GM presentation shortcuts stored as document UUIDs.
- Reorganized the GM Screen into Overview, Exploration, Combat, Resting, Downtime, Rules, Tables, and Session Log; removed GM-facing environment profiles and the dedicated Encounter/Environment tabs, and preserved canonical Encounter Pressure processing in Exploration.
- Fixed Group Exploration so due encounter checks remain due when a missing/invalid encounter table is configured later; ordinary Scene Context edits and no-op saves no longer consume scheduled checks.
- Fixed active Rest cadence so the required encounter-check turns are snapshotted when the rest begins; later Danger changes cannot create retroactive checks or silently skip future checks.
- Reduced persisted Scene Context to the canonical Terrain, Danger, Period, and Encounter Table fields, migrated legacy `profileId` state away from Scenes, removed Profile from Group Traveling and encounter-card presentation, and retained old Profile settings only as hidden compatibility storage.
- Cached RollTable discovery for Encounter Setup, retained explicit world-time resolution for automatic day/night Scene Context, and corrected Combat's human-facing turn number to start at 1.
- Expanded source-table detection/import support to Shadowdark RPG Core v4.9, Player's Guide to the Western Reaches V1, and Cursed Scrolls 1-6 with stable source keys and idempotent RollTable updates.
- Restyled GM Screen dialogs for readable dark-theme controls and migrated its opened menus to Foundry Application V2.
- Added canonical encounter-card parity, recent encounter history, active-party light pressure, Shadowdark procedure quick rules, corrected encounter-pressure labels, and direct encounter actions to the GM Screen.
- Added optional Automated Animations compatibility for Shadowdark 4.x chat messages by mirroring the roll-config item UUID into the top-level Shadowdark flag expected by Foundry v13 AA 6.x; Automated Animations remains optional.

## 1.9.12

- Restored the v1.6.0 Time Passes flow in the GM Screen with a 1d6/2d6/3d6 selector, synchronized opening splash, public roll, and the original visual ENCOUNTER! skull cue when any die shows 1.
- Kept the Time Passes result-of-1 cue presentation-only: it does not schedule, resolve, stage, or create encounters and never calls the Group encounter service.
- Fully separated Group Time from Time Passes so Group Exploration and Resting use only their own procedure-time and encounter mechanisms.

## 1.9.11

- Added a production GM Screen alongside Group Management, with active-party status, procedure pressure, exploration, resting, encounter staging, combat, environment, and quick-rules workspaces backed by existing services.
- Added Group-first procedure state, unified time, marching-order, exploration-role, camp-watch, Scene environment, exploration encounter, interrupted rest, encounter staging, and GM-member-status services without changing the restored Group Sheet structure.
- Retired the standalone Encounter Engine UI in favor of the shared headless encounter service used by Group Exploration and Resting.

## 1.9.10

- Restored the complete v1.6.0 Group Sheet command dashboard, including its Party sidebar cards and controls, compact workspace, responsive layout, and bottom Active Torches bar.

## 1.9.8

- Reworked the Group Sheet dashboard to use its native template structure and behavior, preserving the Party rail and drag-and-drop task zones without a reconstructed layout layer.
- Added versioned, idempotent migrations for legacy Damage Traits and morale-immunity data so existing worlds adopt the current Active Effect and actor-state formats safely.
- Moved Equipment Hands runtime bookkeeping off Actor documents and tightened equipment-change detection to avoid unnecessary updates and persistent transient state.

## 1.9.7

- Updated Focus Tracker to use the Shadowdark 4 casting flow exclusively, with guarded migration of legacy focus state and capacity overrides.
- Stabilized Corpse Token and Detailed Wounds data with explicit, bounded legacy migrations that preserve current-schema state.
- Moved torch attacks into a dedicated Shadowdark 4-native feature and updated Targeted Spell DC to use public spell hooks with live target changes.
- Unified character-sheet render coordination to avoid duplicate feature work and reduce unnecessary Quickdraw inventory processing.
- Centralized feature settings, predefined-effect identifiers, and equipment hand classification so runtime consumers share one authoritative definition.
- Hardened module bootstrap loading, removed redundant stylesheet injection, and preserved Group Sheet compatibility while renaming its implementation class.

## 1.9.6

- Attack and spell roll windows now prompt for a valid canvas target, display the current target selection live, and preserve all selected targets for automation.
- Auto Damage now reads Shadowdark's spell damage type, applying damaging spells as damage and healing spells as healing up to the target's maximum HP.
- Removed the inadvertently restored Reset Morale Strength control from the Token HUD.
- Fixed Auto Damage hit shakes on Foundry VTT v13+ by offsetting the rendered token mesh without changing TokenDocument coordinates, then restoring its authoritative rendered position after the effect.
- Fixed revived Corpse Tokens jumping back to their previous death position whenever HP changed, and ensured later deaths capture the token's current position.

## 1.9.5

- Consolidated the module-provided predefined Active Effects into a shared registry so they are registered consistently across actor and item sheets.

## 1.9.4

- Added the predefined **Immune to Morale Checks** Active Effect for creatures that should not participate in morale checks.

## 1.9.3

- Morale checks now resolve only at the start of the shared enemy turn, preventing them from interrupting player turns or unrelated combat updates.
- Updated the Fleeing status icon and standardized grouped-enemy morale chat output.

## 1.9.2

- Reworked morale to treat all hostile NPC combatants as one enemy force instead of separate NPC groups.
- At half strength, an assigned living leader makes one morale check for the force; without one, each remaining eligible NPC checks individually.
- Failed morale checks now automatically apply the **Fleeing** status to the affected enemies.

## 1.9.1

- Fixed grouped enemy initiative so **Next Turn** skips the remaining NPC entries in the shared enemy slot and advances to the next eligible combatant.
- Enemy initiative chat rolls now report the hostile-combatant count and whether a morale leader is assigned.
- Removed the Reset Morale Strength control from the Token HUD.

## 1.9.0

- Added grouped hostile-enemy initiative: all hostile NPCs share one roll using the highest DEX modifier, while player characters retain individual initiative rolls.
- Added morale automation for hostile NPCs: makes one DC 15 WIS check per group at half strength, or per solo enemy at half HP, with automatic identical-NPC grouping, GM Token HUD controls, visibility settings, and reset support.

## 1.8.0

- Added target-aware Active Effect spell DC overrides. Any targeted actor can use `system.roll.spell.dc` (for example, `18`) to set the caster's spellcasting DC before the roll dialog opens, regardless of Change mode.
- Added a predefined **Targeted Spell DC** effect with a default DC of 18.
- Targeted spell DCs are now stated in the spellcasting dialog heading, including on Foundry VTT v13.
- Foundry VTT v13 target-DC detection now reads enabled effects directly from Effect items embedded on the target, even when the Active Effect's Transfer option is disabled.
- Fixed Foundry VTT v13 startup by integrating through the roll-dialog class instead of attempting to replace the system's read-only `dice.rollDialog` export.
- NPC Attack rows now display their selected Properties on the same secondary line and with the same styling as player weapon attacks.
- The NPC Attack Property picker now lists only Properties whose type is **Weapon**.
- Added a predefined **Only Damaged by Magical Sources** effect. Auto Damage now blocks nonmagical sources while allowing spells, magic items, actor-level magical attacks, and attacks with a Magic/Magical Property.
- Replaced the weapon-specific Temporary Magical Enchantment control with a predefined actor-level **Magical Attacks** effect suitable for Holy Weapon and similar effects.
- Added bundled Game-Icons.net artwork for the Targeted Spell DC, Magical Attacks, and Only Damaged by Magical Sources predefined effects.
- Replaced the custom NPC Feature Traits tab with an Effects tab backed by transferring Active Effects. Existing resistance, immunity, and vulnerability assignments migrate automatically without losing their Property references.

## 1.7.0

- Added native Shadowdark Property selectors to spells and NPC attacks, plus NPC Feature Property effects for resistance, immunity, and vulnerability.
- Auto Damage now aggregates matching effects from all NPC Features and reports the calculation; resistance halves damage with a minimum of 1, immunity prevents it, and vulnerability doubles it.
- Moved Creature Properties off actor sheets into a dedicated NPC Feature **Traits** tab with separate Resistances, Immunities, and Vulnerabilities Property boxes. Existing actor-level assignments migrate into an embedded **Creature Properties** NPC Feature.
- Removed world-Property creation buttons from all module Property selectors; selectors now attach existing Properties only.
- Restricted Detailed Wounds sheets, mutations, API results, and penalty effects to Player actors; NPC sheets no longer show the Wounds tab.
- Added a distinct active Temporary Magical Enchantment marker on weapon sheets, preserving Shadowdark's permanent Magical Item state.

## 1.6.0

- Reworked Detailed Wounds into a GM-managed ten-location status board with direct worsen/improve controls and a `2d10` random-wound procedure.
- Added location and severity dice handling, including Dice So Nice red severity dice, configurable status progression, and mapped body-location labels.
- Added automatic Shadowdark ability penalties for wounded, critical, and destroyed locations, displayed on each location card and managed through a single actor effect.

## 1.5.0

- Added an optional Detailed Wounds character-sheet tab for tracking injuries by body location, severity, description, and date.
- Added location summaries, critical-wound counts, healing and clearing controls, read-only handling, and a public wounds API for integrations.

## 1.4.0

- Raised the minimum supported versions to Foundry VTT v13 and Shadowdark RPG 4.0.0.
- Removed Foundry VTT v12 and Shadowdark RPG 3.x compatibility branches in favor of the v13+ namespaced APIs and Shadowdark 4.x actor-system actions.
- Updated Death Timer's built-in Dead status normalization to use `StatusEffectConfig.name`, avoiding the removed `label` property in Foundry VTT v14.

## 1.3.1

- Fixed Summary Bar shortcuts so class abilities can be dragged from the Abilities tab.
- Restored spell shortcut casting for Foundry v12 / Shadowdark 3.x while retaining newer Shadowdark support.

## 1.3.0

- Added configurable Group Sheet activity columns, defaulting to four activities per row.
- Added configurable background images for every Group Sheet tab.
- Reworked Camping resources by removing water tracking and adding party rest with evenly distributed ration consumption.
- Added a configurable second Summary Bar row with 10 icon-only shortcuts by default for abilities, attacks, spells, and potions.
- Added drag support for character-sheet spells and red shortcut styling for lost spells.
- Added torch equipment integration: lighting a torch equips it, torches have a manual equipped toggle, and equipped torches appear as `1d4` melee attacks.

## 1.2.3

- Expanded the Group Sheet with hirelings, mounts, active torch tracking, shared carrying capacity, and improved travelling and camping interactions.
- Added GM-configured Rollable Tables for Temperature and Wind Speed. Weather results are summarized on the Group Sheet, retain their full details on hover, post to chat, and animate through Dice So Nice when available.

## 1.2.2

- Moved Summary Bar rest handling into a dedicated module.
- Reworked the Group Sheet party sidebar into a full roster with a GM right-click menu for moving characters between the active party and roster.
- Added travelling and camping assignment indicators to party portraits.

## 1.2.1

- Added a Summary Bar rest button with configurable Normal and Grinder recovery, including class abilities, lost spells, full or hit-die HP recovery, Grinder spell selection, and Dice So Nice animations for recovery rolls.
- Added a configurable Token Equipment Display for held and Quickdraw item icons, including hand assignment, paired two-handed occupancy with a grayed secondary icon, optional border styling, independent opacity controls, Quickdraw icon padding, visibility controls, item interactions, and live item updates.

## 1.2.0

- Sorted the module's feature settings submenus alphabetically by name.
- Added twelve Paper Chat themes with a GM visual editor for synchronized, theme-specific chat-message styling.
- Added width and height controls to the Character Sheet and Paper Chat visual style editors.
- Added an opt-in Paper Chat setting that applies the selected background and supporting palette to player-sheet content and the active tab, preserving the header and inactive navigation.
- Fixed Focus spell casting in Foundry VTT v12 attempting to position an unbound Token HUD.

## 1.1.3

- Added Focus Tracker with native Shadowdark 3.x/4.x casting support, configurable capacity and reminders, compact chat controls, summary-bar and token effect icons, legacy migration, and critical-failure spell-loss handling.
- Added a v12-v14-compatible character-sheet height toggle that minimizes to the Summary Bar, restores the previous height, and keeps its implementation isolated in `scripts/minimize-sheet/minimize-sheet.js`.
- Refined the Quick inventory card to show its source analysis on hover or keyboard focus, and reorganized the Quickdraw and Focus Tracker scripts into feature folders.

## 1.1.2

- Added an optional per-item slot value to Quickdraw `gear()` expressions, such as `gear("bandolier", 2)`.
- Added a native-style Quickdraw inventory sidebar card showing current/total selections and the evaluated actor and gear sources.

## 1.1.1

- Refactored Quickdraw controls and per-group inventory sorting, and added safe per-character limit expressions with ability references, minimum/maximum functions, and carried gear counts.
- Revised Encounter Engine Phase 1 to follow the Shadowdark random encounter procedure by default.
- Added Unsafe, Risky, and Deadly danger levels with checks every 3, 2, or 1 crawling rounds/travel hours and encounters on 1 on 1d6.
- Corrected starting distance to 1 Close, 2-4 Near, and 5-6 Far on 1d6.
- Replaced the default activity table with Shadowdark's 2d6 Hunting, Eating, Building/Nesting, Socializing/Playing, Guarding, and Sleeping results.
- Corrected reactions to the Shadowdark 2d6 attitude ranges and added optional interacting-character CHA modifiers that record the character revealing their presence and position.
- Replaced default random surprise rolls with GM-selected awareness states based on the fiction, hiding, and detection checks.
- Added the 50% wandering-monster treasure check.
- Replaced generated morale scores with Shadowdark morale guidance: DC 15 WIS at half group strength or half solo HP, including morale immunity detection.
- Made Intent and dice-based surprise optional expanded procedures, disabled in the Shadowdark Core profile.
- Added automatic migration of the original default profile's terrain and RollTable assignments into the revised Shadowdark Core profile.
- Retained the Time Passes prompt for 1d6, 2d6, or 3d6; an encounter occurs if any selected die shows 1.
- Updated the Encounter Engine API to version 2 with separate `check` and `resolve` methods.

## 1.1.0

- Reorganized settings into compact per-feature screens and expanded Character Sheet styling with typography, color, imagery, spacing, border/navigation states, source detection, and saved-change validation.
- Split Summary Bar and Luck reporting into independent features with fixed styles, and integrated Death Timer display states into the Summary Bar.
- Improved Quickdraw behavior and Foundry v13/v14 presentation, including control targeting, inventory alignment, active-state isolation, and fixed stylesheet ownership.
- Added the optional Weapon Properties on New Line feature and moved module-managed interface rules out of editable Character Sheet CSS.
- Consolidated migrations and compatibility fixes, standardized module-owned `mk-` identifiers and `SUBMODULE` labels, preserved native Shadowdark styles for blank settings, and fixed blank Actor creation.
- Added Encounter Engine Phase 1 with terrain and time-of-day-aware RollTable selection, interactive GM chat cards, scene context flags, and Time Passes integration.

## 1.0.7

- Added Foundry VTT v14 compatibility and verified Shadowdark RPG 4.0.6 support.
- Updated the Group Sheet to use Foundry's namespaced legacy Actor Sheet and Actor collection APIs.
- Updated hidden transport chat messages to use chat message styles instead of the removed message type constants.
- Added direct Shadowdark 4 damage-roll detection for Auto Damage.
- Updated Quickdraw inventory selectors for the Shadowdark 4 player sheet.

## 1.0.6

- Fixed the Create Actor dialog so the Group option is appended without hiding Shadowdark's normal actor types or showing the obsolete Base type.
- Added an image file picker to the Time Passes skull icon path setting.
- Fixed Character Sheet Tweaks so player-only summary bar controls do not appear on Group Sheets.
- Fixed Character Sheet Tweaks summary bar ability buttons in Foundry v13 by using Shadowdark's native stat-check API.

## 1.0.5

- Changed Corpse Token image selection to require a configured image picker setting instead of using a hardcoded default image.
- Added scoped Shadowdark player sheet typography and navigation styling to Character Sheet Tweaks.
- Updated Character Sheet header background paths under `images/` to resolve from the Foundry host root.
- Extended Character Sheet Tweaks visual styling to Shadowdark NPC actor sheets and item sheets while keeping player-only controls on player sheets.
- Moved Group creation into the standard Create Actor type dropdown and removed the separate Actor Directory Group button.

## 1.0.4

- Changed Travelling prompts so only player/GM submitted rolls are used; the progress bar now starts after all travelling rolls are complete and reveals stored results at each activity.
- Updated Travelling prompt roll buttons to explicitly request the Shadowdark ability-check dialog so modifiers and ADV/DISADV can be adjusted before rolling.
- Updated Travelling task results so at least one successful traveller roll makes that task a success.
- Updated Group Sheet dropdown menus to use dark themed option lists.
- Added editable Travelling miles-per-hour and intended-hex count fields to the Group Sheet toolbar.
- Removed the Luck Reroll chat button feature.

## 1.0.3

- Fixed Death Timer token effect icons in Foundry VTT v13 by using ActiveEffect `img` data and a status id.
- Added larger Death Timer/Dead icons in a two-column chat message layout, using `blood-drop-red.png` for Death Timer roll chat icons.
- Added Traveling task assignments to the Group Sheet with Pathfind, March, Lookout, and Scavenge tasks.
- Added a GM-triggered Traveling roll progress splash for all active clients with player token/activity cards and ordered travel progress.
- Added automatic left-to-right Traveling resolution, using each character's best relevant ability, defaulting unassigned group members to Lookout, and marking empty travel stages as failures.
- Fixed the Travelling splash broadcast so active player and observer clients receive it through a chat-flag fallback in addition to module sockets.
- Added a settings-driven Travelling progress animation that resolves rolls at each icon breakpoint and shows success/failure marks under the progress bar.
- Added double Travelling result marks for critical successes and critical failures.
- Fixed Travelling result marks so successful automatic rolls render as green V markers instead of fallback failure X markers.
- Fixed Travelling prompts clearing stale success/failure marks before each new prompt starts.
- Added automatic Travelling splash close after 20 seconds.
- Updated Travelling rolls so Pathfind always uses WIS and Scavenge always uses INT.
- Added a configurable Travelling prep delay, defaulting to 10 seconds, where players can roll their assigned/default travel stat before automatic breakpoint rolls begin.
- Tightened the Travelling splash player cards to fit five per row on desktop and added success/failure outcome labels to Travelling roll chat messages.
- Updated player-triggered Travelling rolls to open the standard Shadowdark ability check dialog with ADV/DISADV choices.
- Fixed the standard Travelling player roll dialog layering so it opens above the Travelling splash.
- Updated automatic Travelling fallback rolls to use the same Shadowdark ability-check chat cards as player rolls, fast-forwarded as standard rolls.
- Updated resolved Travelling progress labels to show Success or Failure based on V/X totals while keeping all result marks visible.
- Fixed Travelling Shadowdark roll outcome parsing so successful check cards are counted as V marks instead of false failures.
- Fixed Travelling roll resolution to wait for the matching Shadowdark chat card before counting manual or automatic rolls, preventing completed players from being rolled again at the timer breakpoint.
- Updated Token Shadows default values to start enabled with a wider, taller, softer-positioned shadow profile.
- Updated Character Sheet default values for the summary bar layout, font scale, value font size, button radius, position, and logo visibility.

## 1.0.2

- Added Foundry VTT v13 compatibility while retaining v12 support.
- Updated the Group Sheet travel tab into a Camping tab with camping procedure text, campfire rules, and revised camping task names/descriptions.
- Added a compact Camping task board with local Game-icons.net activity icons, Foundry tooltips, and drag-and-drop member assignment from the roster.
- Enforced one Camping task assignment per member and added assignment reset support.
- Reworked Group Sheet member cards into a side-by-side layout with larger borderless portraits and compact six-stat rows.
- Set Group actors to use a safe `1/1` HP default to avoid Health Estimate errors.
- Removed the obsolete Corpse Token debug coordinates setting from the settings menu.
- Removed stale Base Management manifest and localization entries.
- Consolidated feature logging/version display around the module manifest version instead of per-file version numbers.
- Added local attribution for bundled Game-icons.net Camping icons.

## 1.0.1

- Fixed Group Sheet template/CSS mismatch for travel cards, party treasure, inventory empty state, and notes.
- Fixed malformed `.sdx-member-main` CSS block.
- Added safer Group Sheet window sizing, tab visibility rules, and responsive member row layout.

## 1.0.0

- Renamed package identity to MK-Shadowdark.
- Updated Foundry module ID to `mk-shadowdark`.
- Updated hardcoded module asset, template, flag, and setting scopes.
- Added module manifest, localization, templates, and fallback assets.
