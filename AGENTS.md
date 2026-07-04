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

## UI And Assets

- Keep CSS selectors scoped to existing module prefixes such as `sdx-` and avoid leaking broad rules into Foundry or Shadowdark core sheets.
- When adding templates, styles, scripts, languages, or bundled assets, update `module.json` as needed.
- When adding icons or third-party assets, place attribution near the asset source, following `assets/icons/camping/ATTRIBUTION.md`.
- Keep Group Sheet template changes coordinated across `templates/group-sheet.hbs`, `scripts/group-sheet.js`, and `styles/group-sheet.css`.

## Validation

- There is no automated test harness checked in. Use targeted static checks where available, then verify behavior manually in Foundry.
- For JavaScript-only changes, run syntax checks with Node if installed, for example `node --check scripts/<file>.js`.
- For manifest or release changes, inspect `module.json` for valid JSON and confirm version/download metadata matches the intended release.
- Manual Foundry verification should use Foundry VTT v12 and v13 with Shadowdark 3.5.0+ and should exercise any touched sheet, chat, token, settings, or canvas behavior.

## Release Notes

- Update `CHANGELOG.md` under `Unreleased` for user-visible fixes, additions, or removals.
- Keep README feature descriptions aligned with shipped behavior when adding or removing visible functionality.
