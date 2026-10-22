# Changelog

## 1.9.35

### Fixed

- Fixed Sundering offers being blocked by unavailable equipment Property names; the timed prompt now opens above other dialogs.

## 1.9.34

### Added

- Isometric encounter board with 6 × 6 to 18 × 18 cells, fixed 5-ft distances, native tokens, snapping, collision checks, and Close/Near ranges.
- Spell area targeting with Near-sized 6 × 6 cubes, Far-sized 12 × 1 lines, circles, and walls on normal and isometric Scenes.
- Fire Wall placement across six connected cells, including bends, with a persistent shaped tile on a successful cast and automatic removal when Focus ends. Damage and wall blocking remain GM-managed.
- Built-in animated fire for Fire Wall tiles, with a per-spell toggle and static fallback for reduced-motion and photosensitive settings.
- Standalone Boat Actors with a Command Deck, hull statistics, crew assignments, cargo, passenger capacity, and Dark/Light themes.
- Per-user Dark/Light themes for Group and Bastion sheets.

### Improved

- Board controls now include a movable GM settings panel, independent width/height resizing, grid positioning, tilt, rotation, line color, and opacity.
- Tokens use bottom-center bases, size-aware occupied cells, drag-only rulers, animated selection arrows, and live red Close-enemy highlights.
- Group Inventory and Boat Cargo share compact item cards, slot counting, individual-card transfers, and discard controls. Observers can transfer shared Group items to their own characters with GM processing.
- Group Sheet headers, asset records, information popups, and totals are more compact; Boat records show live hull, AC, crew, and cargo use.
- Sundering prompts show a 10-second countdown; unanswered prompts take damage. The Death Timer skull follows the portrait crop, and the DTP control uses an hourglass icon.
- Reduced repeated board drawing, token-shadow geometry work, linked-sheet refreshes, and Group light updates; limited tests to the maintained suite.
- Condensed the README and changelog into feature summaries.

### Fixed

- Fixed actor preparation errors from spellcasting-class Active Effects and Item Piles compatibility for Boat and Bastion sheets.
- Corrected Group Inventory card slot costs and warband payroll across boat/bastion assignments, including Granary discounts.

## 1.9.33

- Added the Group Sheet Summary tab for party treasure, payroll, hirelings, warbands, mounts, boats, and bastions. Weekly payroll includes 1 gp per hireling and 3 gp per warband level.
- Added warband cards with live level, AC, HP, and group, boat, or bastion assignments.
- Unified Group Sheet typography, icon tabs, panel headings, and selection styling; removed redundant View buttons.

## 1.9.32

- Moved Death Timer from the Summary Bar onto the player portrait with a larger skull and readable turn count, including native and Character Dashboard sheets; HP remains visible in the bar.

## 1.9.31

- Returned weapon Downtime Upgrades to Details, removed the separate Upgrades tab, and retained compact controls with fixed checkbox widths and aligned labels.
- Added character teachers to Learning Skills: learner and teacher each spend 1 DTP per submitted attempt, with no gold cost and updated balances.

## 1.9.30

- Added Party Treasure fallback for DTP check fees when character gold is insufficient, restricted to assigned groups the trying player can access, with group selection, GM-processed payments and refreshed balances.

## 1.9.29

- Applied the Granary's 3 gp weekly wage reduction to each stationed warband, including quantities, with a minimum of 0 gp, and corrected its description.
- Kept the DTP activity window open after attempts, refreshed its gold and DTP balances and available options, and preserved activity choices and expanded categories.

## 1.9.28

- Moved weapon Downtime Upgrades into a dedicated Upgrades tab, corrected control widths and label alignment, and preserved the selected tab when saving options.

## 1.9.27

- Simplified weapon Downtime Upgrades to a compact list with +1 to hit, +1 to hit and damage, and Increase damage die, and removed the explanatory text.

## 1.9.26

- Added weapon-sheet Downtime Upgrades options for earned Martial Training: +1 to hit, +1 damage, and up to two damage-die increases capped at d12, applied through weapon-specific Active Effects.
- Added a Warbands tab after Hirelings on the Group Sheet, with NPC actor drops, linked sheets, removal controls, and an eight-tab responsive rail.
- Added captain names and NPC crew/warband assignments to Group Sheet boats, with quantities and crew capacity equal to maximum HP; each warband occupies 20 crew slots.

## 1.9.25

- Added a Background / Profession field and an Owner dropdown for Group Sheet hirelings, with owners selected from the group's player characters.
- Added Boats and Bastion tabs after Mounts on the Group Sheet, accepting NPC boat and Bastion actor drops across each tab area, with linked actor cards and removal controls.

## 1.9.24

- Made all DTP activity categories start collapsed and added starred Skulduggery CHA checks for Gain a local rumor (DC 12), Gain a world rumor (DC 20), and Seed a rumor (DC 20).
- Added Carousing* to the DTP menu with the campaign outcome table, individual/shared rolls, participant contributions, outcome-based DTP costs and XP/luck rewards, open event fields (including an optional extra 1d6), Bastion Tavern/Brewery rules, and confirmed campaign time.

## 1.9.23

- Removed the downtime facility confirmation checkbox and tidied chat results, omitting the "No luck tokens" notice and zero-gold costs.
- Fixed player-owned downtime attempts being blocked with an incorrect insufficient DTP/gold warning when Foundry adds the unchanged actor type to the payment update.

## 1.9.22

- Made DTP clickable to choose Spiritualism, Skulduggery, Martial Training, Magical Research, and Learning Skills. Owners can attempt native checks for 1 DTP each; starred activities also deduct 10 gp per PC level. The menu checks class eligibility and resources, confirms facilities, equipment and lodging, and posts results without luck-token rerolls.

## 1.9.21

- Added automatic weekly wage totals for stationed Bastion warbands at 3 gp per level per warband, including quantity and live updates when linked NPC levels change.

## 1.9.20

- Enabled Bastion owners to drag items into and out of the Vault and discard stored items, with ownership checks on both actors for transfers.
- Allowed Aviary, Barracks, Idol, Library, Temple, and Wizard Tower Bastion upgrades to be built up to three times, with independent checkmarks and one upgrade slot per build.
- Added Sundering prompts before Auto Damage applies a melee weapon or NPC attack to a Player character with an equipped Sundering item. The owner can destroy one eligible item to cancel the damage; the GM handles offline owners, and saved decisions protect retries from duplicate destruction.
- Fixed Auto Damage's processing lock so nested chat updates cannot restart an attack that is already being handled.

## 1.9.19

- Added a DTP value box before Languages on the native Player sheet Details tab, matching the XP and Renown boxes.
- DTP starts at 0, persists on the actor, and is editable only by GMs; players and observers see a read-only value.

## 1.9.18

- Published the accumulated Character Dashboard, dashboard-styled Item sheet, Detailed Wounds, and automation improvements described in 1.9.17.
- Restored and expanded the production GM Screen with manual encounter reports, linked-table generators, configurable Quick Actions, and pinned documents.
- Added standalone Bastion Actors with construction and upgrade rules, NPC defenses, and a transferable 100-slot item Vault.
- Updated Magic Item generation to use Type, Qualities, and Personality RollTables and tightened the Group Sheet's responsive tab rail.
- Added independent feature runtime switches and font selectors, and removed retired Survival Wound Profile and standalone Encounter Engine runtime files.

## 1.9.17

- Added the Character Dashboard, dashboard-styled Item sheets, and presentation and reliability improvements for wounds, Focus, damage, death, and targeting.
- Added standalone Bastion Actors with construction, upgrades, NPC defenses, and a transferable 100-slot Vault.
- Rebuilt the GM Screen around Active Party, Quick Actions, Pinned Documents, and Tables, with compact Scene Context controls and a collapsible table browser.
- Added manual Encounter Zone rolls, editable zone grids, Danger-based dice, preview dialogs, and GM-only Journal reports. Removed automatic exploration/rest encounter checks and Group elapsed-time tracking.
- Added linked-table generators for NPCs, shops, taverns, locations, monsters, magic items, traps, and hazards, with Create/Reroll/Cancel previews.
- Added configurable NPC names, traits, and 3d6 ability scores; NPC generation uses Scene-linked tables and leaves unavailable profile fields blank.
- Added tavern wealth-based menus with distinct food and drink results, readable Journal pages, and editable GM notes.
- Updated Magic Item generation to use Type, Qualities, and Personality RollTables.
- Added configurable Quick Actions, draggable generator shortcuts, automatic pinning of generated documents, and Scene configuration import/export from Settings Home.
- Standardized generator table assignments and improved RollTable browsing with collapsed folder groups, document icons, fixed search, and contextual source formulas.
- Added independent feature runtime switches and a Time Passes font selector; disabled features retain their data.
- Made the Summary Bar shortcut row a per-player preference with 12 slots and a compact fixed header position.
- Improved the Group Sheet's responsive tab rail and kept standalone Time Passes separate from encounter automation.
- Removed retired Survival Wound Profile and standalone Encounter Engine interfaces and runtime files.

## 1.9.16

- Added the body-centric Character Dashboard with live wound markers, equipment slots, and drag-and-drop inventory assignment.
- Moved Detailed Wounds into a separate board opened from the character-sheet summary, with six wound zones, location-specific severity, recovery durations, fatal wounds, and ability penalties.
- Marked characters Dead at effective CON 0 and prevented HP healing from clearing that state while CON remains 0.
- Updated Group wound summaries to show named consequences and ignore scars.
- Added Journal page categories, heading and sidebar styling, and the Use as Default setting; editing remains in Foundry's native page editor.
- Temporarily disabled the GM Screen while preserving Group Management, encounter services, and standalone Time Passes.

## 1.9.15

- Added the custom two-pane Journal sheet with a dark sidebar, light content area, and responsive layout.
- Simplified GM Screen Tables to source RollTables; removed the old Tools workspace, NPC Script Macro, and NPC/Location creation controls.
- Split Core NPC Qualities into Appearance, Does, and Secret tables.
- Made Scene Context changes save immediately and added Safe danger with no new encounter checks; active rests retain their original cadence.
- Made Elapsed advance one canonical turn and tied Resting to the Group rest workflow.
- Added session start/reset controls and filtered encounter history to the current session.
- Compacted the permanent Party rail and Overview status cards, retained per-GM document shortcuts, and renamed Downtime to Settlement.
- Kept Time Passes separate from encounter scheduling and preserved explicit GM Screen updates without ambient refresh hooks.

## 1.9.14

- Reorganized GM Screen workspaces and controls, with staged Scene Context saves, a Procedure dropdown, and drag-and-drop document shortcuts on Overview.
- Consolidated status displays and retained Group Management as the owner of travel, camping, marching order, and rest controls.
- Removed generic refresh controls and automatic presentation persistence; document pins remain saved per GM.
- Staged Encounter Zone and table assignments until Save Encounter Setup, while retaining zone previews.
- Fixed due encounter checks surviving missing-table configuration and preserved the encounter cadence captured when a rest begins.
- Reduced Scene Context to Terrain, Danger, Period, and Encounter Table, with legacy profile migration.
- Expanded source-table support to Core v4.9, Western Reaches, and Cursed Scrolls 1–6; cached table discovery and improved encounter history, pressure, quick rules, and actions.
- Migrated GM Screen dialogs to Application V2 and added optional Automated Animations compatibility for Shadowdark 4.x chat messages.

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

- Added Quickdraw limit expressions using ability scores, minimum/maximum functions, and carried gear counts, with improved controls and inventory sorting.
- Aligned the Encounter Engine with Shadowdark's danger cadence, starting distances, activities, 2d6 reactions, treasure chance, and morale rules.
- Added optional interacting-character CHA modifiers and replaced random surprise with GM-selected awareness.
- Made Intent and dice-based surprise optional, disabled in the Core profile, and migrated existing table assignments.
- Retained the Time Passes dice prompt and introduced Encounter Engine API v2 with separate check and resolve methods.

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

- Fixed Death Timer status icons for Foundry v13 and improved death-related chat cards.
- Added Traveling assignments for Pathfind, March, Lookout, and Scavenge, with synchronized player/observer splashes and ordered result displays.
- Added configurable preparation and progress timing, compact party cards, critical-result marks, and automatic splash closing.
- Used WIS for Pathfind and INT for Scavenge, with native check dialogs and improved ADV/DISADV and dialog layering.
- Fixed stale result marks, success/failure parsing, and chat-card synchronization during manual and automatic roll resolution.
- Updated Token Shadows and character-sheet default appearance settings.

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
