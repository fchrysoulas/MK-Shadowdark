# Changelog

## Unreleased

- Changed Travelling prompts so only player/GM submitted rolls are used; the progress bar now starts after all travelling rolls are complete and reveals stored results at each activity.
- Updated Travelling prompt roll buttons to explicitly request the Shadowdark ability-check dialog so modifiers and ADV/DISADV can be adjusted before rolling.
- Updated Travelling task results so at least one successful traveller roll makes that task a success.

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
- Added legacy `shadowdark-extras` group actor migration for actors created before the module rename.

## 1.0.0

- Renamed package identity to MK-Shadowdark.
- Updated Foundry module ID to `mk-shadowdark`.
- Updated hardcoded module asset, template, flag, and setting scopes.
- Added module manifest, localization, templates, and fallback assets.
