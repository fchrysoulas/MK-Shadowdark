# Changelog

## Unreleased

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
- Added a v12-v14-compatible character-sheet height toggle that minimizes to the Summary Bar, restores the previous height, and keeps its implementation isolated in `scripts/minimize-sheet.js`.
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
