# AGENTS.md

Guidance for AI agents working in this repository.

## Project Overview

- `MK-Shadowdark` is a Foundry VTT v12/v13 module for the Shadowdark RPG system 3.5.0+.
- The module id is `mk-shadowdark`; keep setting, flag, template, and asset paths scoped to that id.
- `module.json` is the source of truth for module metadata, loaded ES modules, styles, languages, compatibility, and release URLs.
- Feature logic lives in `scripts/`, CSS in `styles/`, Handlebars templates in `templates/`, localization in `lang/`, and bundled media in `assets/`.

## Coding Conventions

- Use plain browser-compatible JavaScript for Foundry. There is no bundler, package manager, or transpilation step in this repo.
- Keep feature files self-contained IIFEs unless an existing file already establishes a different local pattern.
- Register settings only from `scripts/settings.js`; feature files should read settings rather than registering their own.
- Prefer APIs that work in both Foundry v12 and v13, and guard access to optional globals such as `game`, `ui`, `canvas`, and third-party modules.
- Keep user-facing behavior configurable through Foundry settings when the surrounding feature already follows that pattern.
- Use the manifest version from `game.modules.get("mk-shadowdark")`; do not add per-file version constants.
- Preserve existing compatibility behavior, especially the harmless Base Management API stub in `scripts/mk-shadowdark.js`, unless the task explicitly changes it.
- Avoid repeated file-header comments or path-only comments in JavaScript files. Keep comments only where they explain non-obvious behavior, compatibility constraints, migration rules, or timing/order requirements.

## UI And Assets

- Keep CSS selectors scoped to existing module prefixes such as `sdx-` and avoid leaking broad rules into Foundry or Shadowdark core sheets.
- When adding templates, styles, scripts, languages, or bundled assets, update `module.json` as needed.
- When adding icons or third-party assets, place attribution near the asset source, following `assets/icons/camping/ATTRIBUTION.md`.
- Keep Group Sheet template changes coordinated across `templates/group-sheet.hbs`, `scripts/group-sheet.js`, `scripts/group-sheet/*.js`, and `styles/group-sheet.css`.

## Group Sheet Functionality

- `scripts/group-sheet.js` is the entry point; feature logic is split under `scripts/group-sheet/`. Keep imports explicit and browser-compatible because there is no bundler.
- Group actor state is stored under the module `group` flag. Normalize or migrate it through the existing helpers in `scripts/group-sheet/activities.js` and `scripts/group-sheet/actors.js` rather than writing ad hoc flag shapes.
- Camping tasks support drag-and-drop member assignment, one task per member, default camping resources, local Game-icons.net icons, and reset support.
- Travelling tasks are Pathfind, March, Lookout, and Scavenge. Unassigned group members default to Lookout for prompt rolls.
- Travelling prompts are GM-triggered but all rolls must be made manually by players or the GM. Do not add timed automatic rolls or fallback rolls.
- Travelling prompt roll buttons should open the Shadowdark stat-check dialog through the native Shadowdark API so modifiers and ADV/DISADV can be adjusted. Keep the roll dialog layered above the travelling splash.
- Travelling progress starts only after every required traveller roll is submitted. The bar then reveals stored results at each activity breakpoint.
- A travelling activity succeeds if at least one submitted roll for that activity succeeds. Empty/unassigned activities still count as failures.
- Travelling prompt updates should continue to work through module sockets and the chat-flag fallback for active player/observer clients.

## Feature Notes

- Corpse Token Automation lives in `scripts/corpse-token.js`; if it should be active, ensure it is listed in `module.json` `esmodules`. It is GM-only, watches Shadowdark HP updates, resolves the actual token document whose HP changed, and must never use selected or targeted tokens as the automation position source.
- Corpse Token placement preserves the original standing bottom-center fall point, aligns the visible opaque bottom of the corpse image to that point, and performs delayed realignment so damage shake or other token movement does not move the corpse away from the saved fall point. Manual debug/restore macros may use selected tokens, but automation must not.
- Corpse Token has legacy local settings registration; future setting changes should be coordinated with the central `scripts/settings.js` pattern instead of adding more feature-local settings.
- Death Timer adds a skull-only sheet button without replacing Handlebars templates. At 0 HP, the first click rolls `1d4 + CON mod` with the configured minimum and creates `Death Timer (X)`; later clicks roll `1d20`, where 20 revives at 1 HP, 1 reduces the timer by 2, and 2-19 reduces it by 1. At 0 turns, remove Death Timer and apply the system Dead status; healing removes Death Timer and Dead.
- Equipment Hands validates equipped Shadowdark items against configurable hand slots. Equipped one-handed weapons, shields, and items with the `Occupies One Hand` property use 1 hand; two-handed weapons use 2 hands; the dual-wield setting can disallow more than one weapon.
- Time Passes broadcasts through ChatMessage flags so all clients receive the splash. The flow is pre-splash, public roll, and optional encounter splash; any d6 showing 1 triggers the encounter, including multi-die formulas.

## Validation

- There is no automated test harness checked in. Use targeted static checks where available, then verify behavior manually in Foundry.
- For JavaScript-only changes, run syntax checks with Node if installed, for example `node --check scripts/<file>.js`.
- For manifest or release changes, inspect `module.json` for valid JSON and confirm version/download metadata matches the intended release.
- Manual Foundry verification should use Foundry VTT v12 and v13 with Shadowdark 3.5.0+ and should exercise any touched sheet, chat, token, settings, or canvas behavior.
- For local Foundry testing, the Windows install may be at `E:\Foundry Virtual Tabletop`, with user data under `%LOCALAPPDATA%\FoundryVTT`; verify the running server is actually serving the changed module files before testing.

## Release Notes

- Update `CHANGELOG.md` under `Unreleased` for user-visible fixes, additions, or removals.
- Keep README feature descriptions aligned with shipped behavior when adding or removing visible functionality.
