# Changelog

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
