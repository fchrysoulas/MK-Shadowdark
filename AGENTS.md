# AGENTS.md

Guidance for AI agents working in this repository.

## Project Overview

- `MK-Shadowdark` is a Foundry VTT module for the Shadowdark RPG system.
- The current compatibility baseline is Foundry VTT v13+ and Shadowdark RPG 4.0.0+. Treat the exact minimum and verified versions in `module.json` as authoritative.
- The module id is `mk-shadowdark`. Keep settings, flags, templates, socket data, assets, and API namespaces scoped to that id.
- `module.json` is the source of truth for module metadata and load order. Feature logic lives in `scripts/`, CSS in `styles/`, Handlebars templates in `templates/`, localization in `lang/`, and bundled media in `assets/`.
- Keep `scripts/mk-shadowdark.js` as the top-level module bootstrap. Every feature owns a dedicated folder under `scripts/`; code consumed across multiple features belongs in `scripts/libs/` instead of a feature folder.
- There is no bundler or transpiler. The checked-in Node harness provides syntax, lint, manifest, and focused unit-test validation without building runtime assets.

## Repository And Editing Rules

- Preserve unrelated working-tree changes. Inspect `git status` and the relevant diff before editing or committing.
- Use browser-compatible JavaScript. Most standalone features use a self-contained IIFE; the Group Sheet and Encounter Engine use explicit ES-module imports.
- Follow the existing architecture of the file being changed instead of converting nearby code to a new pattern without a task-specific reason.
- Keep the manifest version as the only module version source. Runtime logs should read it from `game.modules.get("mk-shadowdark")`; do not add per-file version constants.
- Use the existing `game.modules.get("mk-shadowdark").api` namespace for public feature APIs.
- Keep comments for non-obvious rules, compatibility constraints, migrations, hook timing, or load-order requirements. Avoid path-only comments and repeated headers.
- Add or update localization when a user-facing string belongs in the Shadowdark configuration UI. Existing feature settings currently contain some inline English; do not expand that inconsistency casually.
- Settings are intentionally hybrid: common feature settings are registered in `scripts/libs/settings.js`, while self-contained systems such as Initiative, Morale, Corpse Token, Detailed Wounds, and Encounter Engine register their own settings. Preserve the local pattern and never register the same key twice.
- Preserve the harmless removed Base Management compatibility stub in `scripts/mk-shadowdark.js` unless the task explicitly removes that legacy API.

## Foundry And Shadowdark Compatibility

- Target Foundry v13 and v14 with Shadowdark 4.x. Do not reintroduce Foundry v12 or Shadowdark 3.x compatibility branches.
- Prefer Foundry's namespaced APIs, with narrow fallbacks only where the existing code supports both v13 and v14 application generations.
- Guard optional globals and documents where Foundry hook timing can make them unavailable, including `game`, `ui`, `canvas`, `CONFIG`, and third-party modules.
- Do not assign to imported or system-owned API exports that can be read-only. Targeted Spell DC integration must wrap the roll-dialog class/prototype path; never replace `shadowdark.dice.rollDialog` directly.
- Keep document mutations authority-safe. World migrations and combat automation should run only from the active GM/authoritative client using the established helpers.
- Respect manifest script order. In particular, `scripts/libs/predefined-effects.js` must load before `scripts/auto-damage/damage-traits.js` and `scripts/targeted-spell-dc/targeted-spell-dc.js`.

## UI And Assets

- Scope CSS to module-owned selectors such as `mk-` and the established `sdx-` Group Sheet selectors. Avoid broad rules that leak into core Foundry or Shadowdark sheets.
- Support the render hooks already used by the touched feature rather than assuming one sheet generation or hook name.
- When adding scripts, styles, templates, languages, or runtime assets, update `module.json` and confirm the referenced path is included in the release package.
- Put third-party asset attribution beside the relevant asset family. Effect icon attribution belongs in `assets/icons/effects/ATTRIBUTION.md`; Camping icon attribution belongs in `assets/icons/camping/ATTRIBUTION.md`.
- Keep Group Sheet changes coordinated across `templates/group-sheet.hbs`, `styles/group-sheet.css`, `styles/group-sheet-dashboard.css`, `scripts/group-sheet.js`, and the relevant modules under `scripts/group-sheet/`.
- Preserve the v1.6.0 Group Sheet command dashboard structure and styling, including its generated Party sidebar cards and controls, horizontal narrow-width rail, and bottom Active Torches bar.

## Active Effects, Properties, And Damage

- Module-provided predefined effects are registered centrally in `scripts/libs/predefined-effects.js`. Add new definitions and effect-key translations there rather than registering them in feature consumers.
- The current predefined effects are:

  - **Only Damaged by Magical Sources**: `system.damage.immunity.nonmagical`
  - **Magical Attacks**: `system.damage.source.magical`
  - **Targeted Spell DC**: `system.roll.spell.dc`
  - **Immune to morale checks**: `flags.mk-shadowdark.encounter.moraleImmune`

- Predefined effects must be usable on any applicable NPC or player character; do not hard-code creature names such as lich.
- Targeted Spell DC reads enabled effects from targeted actors, including effects transferred from embedded Effect items. If several targets supply a DC, use the highest applicable value and show it in the spellcasting dialog.
- The former weapon-specific Temporary Magical Enchantment control was removed. Temporary effects such as Holy Weapon should use the actor-level **Magical Attacks** effect; permanent magic weapons still use Shadowdark's native magical-item data.
- NPC Attack rows display their Properties using the same secondary-line presentation as player attacks. The NPC Attack property selector must list only Shadowdark Property items of type `Weapon`.
- NPC Feature sheets use an **Effects** tab. Enabled Active Effects with Transfer active apply to the owning NPC. Damage resistance, immunity, and vulnerability are represented as transferred Active Effects referencing the same Property UUID as the damage source.
- Preserve the existing migration from legacy actor/NPC Feature trait data into transferring Active Effects. Migrations must be idempotent and active-GM-only.
- Auto Damage treats spells, scrolls, wands, permanent magic items, Magic/Magical Properties, and actor-level **Magical Attacks** as magical sources. Property immunity takes precedence; resistance and vulnerability cancel; resistance halves with a minimum of 1; vulnerability doubles.
- Auto Damage uses Shadowdark's spell damage type to distinguish damage from healing. Healing bypasses damage traits, restores no more than maximum HP, and does not shake the target token.
- Attack and spell roll dialogs require at least one valid canvas token target. Keep their compact target list live, preserve every selected UUID for multi-target automation, and use the first selected target as Shadowdark's primary target.

## Initiative And Morale Invariants

- Player characters keep individual native initiative rolls. All hostile NPC combatants roll once using the highest hostile DEX modifier and share one contiguous enemy initiative slot.
- The first hostile NPC represents the GM's shared enemy turn. Advancing from it must skip the other hostile NPC entries in that shared slot and move to the next eligible non-group combatant, or the next round.
- Enemy initiative chat output reports the number of hostile combatants and whether a morale leader is assigned.
- Morale treats all hostile NPC combatants present at combat start as one enemy force. Reinforcements do not change that baseline automatically.
- Morale resolves at the start of the shared enemy turn: at half force strength, a living assigned leader makes one DC 15 WIS check for the force; without a leader, each eligible survivor checks individually. A solo enemy checks at half HP.
- Failed morale checks apply the module's **Fleeing** status. Creatures with the morale-immunity flag/effect are excluded.
- The Token HUD morale control is for assigning the force leader. The Reset Morale Strength button was intentionally removed; do not reintroduce it.
- Keep initiative and morale coordination explicit. Changes to combat sorting, `nextTurn`, enemy-turn detection, or combat snapshots must be checked against both `scripts/initiative/initiative.js` and `scripts/morale/morale.js`.

## Group Sheet Functionality

- `scripts/group-sheet/group-sheet.js` is the entry point. Keep imports explicit and browser-compatible.
- Group actor state is stored under the module's `group` flag. Normalize or migrate it through existing helpers in `scripts/group-sheet/activities.js`, `scripts/group-sheet/actors.js`, and `scripts/group-sheet/state.js`; do not invent parallel flag shapes.
- Camping tasks use drag-and-drop member assignment, one task per member, local Game-icons.net icons, resource handling, and reset support.
- Travelling tasks are Pathfind, March, Lookout, and Scavenge. Unassigned group members default to Lookout.
- Travelling rolls are submitted manually by players or the GM through Shadowdark's native stat-check dialog so modifiers and ADV/DISADV remain editable. Do not add automatic fallback rolls.
- Progress starts after all required rolls are submitted, then reveals stored results at activity breakpoints. An activity succeeds when at least one assigned roll succeeds; empty activities fail.
- Preserve both module-socket delivery and the chat-flag fallback for active player and observer clients. Keep native roll dialogs layered above the travelling splash.

## Other Feature Invariants

- Corpse Token automation must use the token document whose HP changed, never the user's selected or targeted token. Preserve the standing token's bottom-center fall point and delayed corpse realignment.
- Detailed Wounds applies only to Player actors. Keep the ten-location GM-managed board, severity progression, and its single consolidated penalty effect off NPC sheets.
- Death Timer uses Shadowdark's Dead status and Foundry Active Effect `img`/status data. Healing removes both Death Timer and Dead.
- Equipment Hands and Token Equipment Display must share equipped, stashed, handedness, shield, and `Occupies One Hand` rules.
- Time Passes broadcasts its v1.6-style splash through ChatMessage flags and offers a standalone 1d6/2d6/3d6 public roll from the GM Screen. Any rolled 1 displays the old ENCOUNTER! skull splash as a visual cue only. Never connect it to Group Time, encounter scheduling, resolution, staging, or the Encounter service.

## Validation

- For every changed JavaScript file, run `node --check <path>` when Node is available.
- Validate edited JSON by parsing it, not only by visual inspection.
- Run `git diff --check` and inspect the focused diff before handing off or committing.
- There is no automated test suite. Use targeted mock scripts only when they exercise the changed behavior meaningfully, then verify sheet, chat, combat, token, settings, or canvas behavior in Foundry in proportion to the risk.
- Manual compatibility verification targets Foundry v13/v14 with Shadowdark 4.x. Confirm the running Foundry server is serving the changed local module files rather than a cached or older installation.
- The usual Windows Foundry user-data module path is `%LOCALAPPDATA%\FoundryVTT\Data\modules\mk-shadowdark`. Resolve and verify the exact destination before copying files there.

## Changelog, Versioning, And Delivery

- Add user-visible additions, fixes, and removals to the newest applicable section of `CHANGELOG.md`; do not invent an `Unreleased` convention unless the changelog is deliberately restructured.
- Keep `README.md` aligned with shipped user-facing behavior and Active Effect instructions.
- Increment `module.json` only when the user explicitly asks for a version increment or release preparation.
- Commit, push, tag, publish, or prune branches only when requested. After validated runtime changes, always sync them to the local Foundry installation for testing and report what was copied or removed.
- A local Foundry sync should copy every runtime file changed by the task, preserve the module directory layout, and verify the destination files after copying.
