import { readFile, writeFile } from "node:fs/promises";

async function replaceInFile(path, replacements) {
  let source = await readFile(path, "utf8");

  for (const { from, to, label } of replacements) {
    if (!source.includes(from)) {
      throw new Error(`${path}: expected block not found for ${label}`);
    }
    source = source.replace(from, to);
  }

  await writeFile(path, source, "utf8");
  console.log(`Updated ${path}`);
}

await replaceInFile("scripts/quickdraw/quickdraw-icons.js", [
  {
    label: "adapter import",
    from: 'import { evaluateQuickdrawLimitDetails } from "./quickdraw-limit.js";\n',
    to: 'import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";\nimport { evaluateQuickdrawLimitDetails } from "./quickdraw-limit.js";\n'
  },
  {
    label: "duplicate hook constants",
    from: `  const ACTOR_SHEET_RENDER_HOOKS = [\n    "renderActorSheet",\n    "renderActorSheetSD",\n    "renderPlayerSheetSD",\n    "renderShadowdarkActorSheet",\n    "renderShadowdarkActorSheetV2",\n    "renderActorSheetShadowdark"\n  ];\n  const renderRetryTimers = new WeakMap();\n`,
    to: ""
  },
  {
    label: "feature retry scheduling",
    from: `    processSheet(app, $html);\n    scheduleRenderRetries(app, $html);\n  }\n\n  function scheduleRenderRetries(app, fallbackHtml) {\n    const existingTimers = renderRetryTimers.get(app) ?? [];\n    existingTimers.forEach(timer => window.clearTimeout(timer));\n\n    const timers = [50, 250].map(delay => window.setTimeout(() => {\n      const currentHtml = asJQuery(app?.element);\n      const $html = currentHtml?.length ? currentHtml : fallbackHtml;\n      if (!$html?.length) return;\n\n      processSheet(app, $html);\n    }, delay));\n\n    renderRetryTimers.set(app, timers);\n  }\n`,
    to: `    processSheet(app, $html);\n  }\n`
  },
  {
    label: "direct hook registration",
    from: `  for (const hookName of ACTOR_SHEET_RENDER_HOOKS) {\n    Hooks.on(hookName, onRender);\n  }\n`,
    to: `  onCharacterSheetRender("Quickdraw", onRender, { priority: 20 });\n`
  }
]);

await replaceInFile("scripts/summary-bar/summary-bar.js", [
  {
    label: "adapter import",
    from: 'import { reportLuckChange } from "../chat-reporting/chat-reporting.js";\n',
    to: 'import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";\nimport { reportLuckChange } from "../chat-reporting/chat-reporting.js";\n'
  },
  {
    label: "duplicate hook constants",
    from: `  const ACTOR_SHEET_RENDER_HOOKS = [\n    "renderActorSheet",\n    "renderActorSheetSD",\n    "renderPlayerSheetSD",\n    "renderShadowdarkActorSheet",\n    "renderShadowdarkActorSheetV2",\n    "renderActorSheetShadowdark"\n  ];\n`,
    to: ""
  },
  {
    label: "direct hook registration",
    from: `  for (const hookName of ACTOR_SHEET_RENDER_HOOKS) {\n    Hooks.on(hookName, (app, html, data) => {\n      try {\n        onRenderActorSheet(app, html, data);\n      } catch (err) {\n        console.error(\`${"${MODULE_ID}"} v${"${getModuleVersion()}"} | ${"${SUBMODULE}"} | render error\`, err);\n      }\n    });\n  }\n`,
    to: `  onCharacterSheetRender("Summary Bar", onRenderActorSheet, { priority: 20 });\n`
  }
]);

await replaceInFile("scripts/minimize-sheet/minimize-sheet.js", [
  {
    label: "adapter import",
    from: '(() => {\n',
    to: 'import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";\n\n(() => {\n'
  },
  {
    label: "duplicate hook constants",
    from: `  const ACTOR_SHEET_RENDER_HOOKS = [\n    "renderActorSheet",\n    "renderActorSheetSD",\n    "renderPlayerSheetSD",\n    "renderShadowdarkActorSheet",\n    "renderShadowdarkActorSheetV2",\n    "renderActorSheetShadowdark"\n  ];\n`,
    to: ""
  },
  {
    label: "direct hook registration",
    from: `  for (const hookName of ACTOR_SHEET_RENDER_HOOKS) {\n    Hooks.on(hookName, (app, html) => {\n      try {\n        onRenderActorSheet(app, html);\n      } catch (error) {\n        console.error(\`${"${MODULE_ID}"} v${"${getModuleVersion()}"} | ${"${SUBMODULE}"} | render error\`, error);\n      }\n    });\n  }\n`,
    to: `  onCharacterSheetRender("Minimize Sheet", onRenderActorSheet, { priority: 40 });\n`
  }
]);

await replaceInFile("scripts/detailed-wounds/detailed-wounds.js", [
  {
    label: "adapter import",
    from: '(() => {\n',
    to: 'import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";\n\n(() => {\n'
  },
  {
    label: "duplicate render hooks and microtask retry",
    from: `  const RENDER_HOOKS = [\n    "renderActorSheet",\n    "renderActorSheetV2",\n    "renderShadowdarkActorSheet",\n    "renderShadowdarkActorSheetV2",\n    "renderActorSheetShadowdark"\n  ];\n\n  for (const hookName of RENDER_HOOKS) {\n    Hooks.on(hookName, (app, html) => {\n      injectWoundsTabSafely(app, html);\n      queueMicrotask(() => injectWoundsTabSafely(app, html));\n    });\n  }\n`,
    to: `  onCharacterSheetRender("Detailed Wounds", injectWoundsTabSafely, { priority: 30 });\n`
  }
]);

await replaceInFile("scripts/focus-spell-tracker/focus-spell-tracker.js", [
  {
    label: "adapter import",
    from: 'import { planLegacyFocusMigration } from "./focus-migration.js";\n',
    to: 'import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";\nimport { planLegacyFocusMigration } from "./focus-migration.js";\n'
  },
  {
    label: "duplicate render hooks and retries",
    from: `  const actorRenderHooks = [\n    "renderActorSheet",\n    "renderActorSheetSD",\n    "renderPlayerSheetSD",\n    "renderShadowdarkActorSheet",\n    "renderShadowdarkActorSheetV2",\n    "renderActorSheetShadowdark"\n  ];\n\n  for (const hook of actorRenderHooks) {\n    Hooks.on(hook, (app, html) => {\n      renderActorFocus(app, html);\n      window.setTimeout(() => renderActorFocus(app, html), 0);\n      window.setTimeout(() => renderActorFocus(app, html), 125);\n    });\n  }\n`,
    to: `  onCharacterSheetRender("Focus Tracker", renderActorFocus, { priority: 30 });\n`
  }
]);

await replaceInFile("scripts/sheet-style-editor/sheet-style-editor.js", [
  {
    label: "adapter import",
    from: '(() => {\n',
    to: 'import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";\n\n(() => {\n'
  },
  {
    label: "duplicate hook constants",
    from: `  const ACTOR_SHEET_RENDER_HOOKS = [\n    "renderActorSheet",\n    "renderActorSheetSD",\n    "renderPlayerSheetSD",\n    "renderShadowdarkActorSheet",\n    "renderShadowdarkActorSheetV2",\n    "renderActorSheetShadowdark"\n  ];\n`,
    to: ""
  },
  {
    label: "direct hook registration",
    from: `  for (const hookName of ACTOR_SHEET_RENDER_HOOKS) {\n    Hooks.on(hookName, (app, html) => {\n      try {\n        onRenderActorSheet(app, html);\n      } catch (error) {\n        console.error(\`${"${MODULE_ID}"} | ${"${SUBMODULE}"} | render error\`, error);\n      }\n    });\n  }\n`,
    to: `  onCharacterSheetRender("Sheet Style Editor", onRenderActorSheet, { priority: 50 });\n`
  }
]);

await replaceInFile("scripts/character-sheet-tweaks/character-sheet-tweaks.js", [
  {
    label: "adapter import",
    from: '(() => {\n',
    to: 'import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";\n\n(() => {\n'
  },
  {
    label: "duplicate actor hook constants",
    from: `  const ACTOR_SHEET_RENDER_HOOKS = [\n    "renderActorSheet",\n    "renderShadowdarkActorSheet",\n    "renderShadowdarkActorSheetV2",\n    "renderActorSheetShadowdark"\n  ];\n\n`,
    to: ""
  },
  {
    label: "direct actor hook registration",
    from: `  for (const hookName of ACTOR_SHEET_RENDER_HOOKS) {\n    Hooks.on(hookName, (app, html) => {\n      try {\n        onRenderActorSheet(app, html);\n      } catch (err) {\n        console.error(\`${"${MODULE_ID}"} v${"${getModuleVersion()}"} | ${"${SUBMODULE}"} | render error\`, err);\n      }\n    });\n  }\n\n`,
    to: `  onCharacterSheetRender("Character Sheet Tweaks", onRenderActorSheet, { priority: 10 });\n\n`
  }
]);

await replaceInFile("scripts/equipment-hands/equipment-hands.js", [
  {
    label: "adapter import",
    from: '(() => {\n',
    to: 'import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";\n\n(() => {\n'
  },
  {
    label: "direct actor hook registrations",
    from: `  Hooks.on("renderActorSheet", onRenderActorSheet);\n  Hooks.on("renderShadowdarkActorSheet", onRenderActorSheet);\n  Hooks.on("renderShadowdarkActorSheetV2", onRenderActorSheet);\n  Hooks.on("renderActorSheetShadowdark", onRenderActorSheet);\n`,
    to: `  onCharacterSheetRender("Equipment Hands", onRenderActorSheet, { priority: 60 });\n`
  }
]);

console.log("Shared sheet render adapter refactor applied successfully.");
