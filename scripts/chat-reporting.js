const MODULE_ID = "mk-shadowdark";
const SUBMODULE = "Chat Reporting";
const STYLESHEET_ID = "mk-shadowdark-chat-reporting-styles";
const STYLESHEET_PATH = `modules/${MODULE_ID}/styles/chat-reporting.css`;

const ACTOR_SHEET_RENDER_HOOKS = [
  "renderActorSheet",
  "renderShadowdarkActorSheet",
  "renderShadowdarkActorSheetV2",
  "renderActorSheetShadowdark"
];

ensureStylesheet();

Hooks.once("init", () => log("initialized"));

for (const hookName of ACTOR_SHEET_RENDER_HOOKS) {
  Hooks.on(hookName, (app, html) => {
    try {
      onRenderActorSheet(app, html);
    } catch (error) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | render error`, error);
    }
  });
}

function onRenderActorSheet(app, html) {
  const root = getRootElement(html);
  if (!root?.querySelector || !isShadowdarkPlayerSheet(app, root)) return;

  const actor = app.actor ?? app.object;
  attachNativeLuckWatchers(actor, getSheetForm(root));
}

function attachNativeLuckWatchers(actor, root) {
  if (!actor || !root?.querySelectorAll) return;

  root.querySelectorAll('input[name="system.luck.available"]').forEach(input => {
    if (input.dataset?.sdxLuckChatWatcher === "true") return;
    input.dataset.sdxLuckChatWatcher = "true";
    input.addEventListener("change", event => onNativeLuckAvailableChange(event, actor));
  });

  root.querySelectorAll('input[name="system.luck.remaining"]').forEach(input => {
    if (input.dataset?.sdxLuckChatWatcher === "true") return;
    input.dataset.sdxLuckChatWatcher = "true";
    input.addEventListener("change", event => onNativeLuckRemainingChange(event, actor));
  });
}

async function onNativeLuckAvailableChange(event, actor) {
  try {
    const available = Boolean(event.currentTarget?.checked);
    await reportLuckChange(actor, available, available ? 1 : 0, isPulpMode());
  } catch (error) {
    console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | native luck report error`, error);
  }
}

async function onNativeLuckRemainingChange(event, actor) {
  try {
    const oldRemaining = getLuckRemaining(actor);
    const newRemaining = Number(event.currentTarget?.value ?? 0);
    if (!Number.isFinite(newRemaining) || newRemaining === oldRemaining) return;
    await reportLuckChange(actor, newRemaining > oldRemaining, newRemaining, true);
  } catch (error) {
    console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | native pulp luck report error`, error);
  }
}

export async function reportLuckChange(actor, gainedLuck, remaining, pulpMode = isPulpMode()) {
  const icon = gainedLuck
    ? '<i class="fa-solid fa-check sdx-chat-reporting__luck-icon sdx-chat-reporting__luck-icon--gain"></i>'
    : '<i class="fa-solid fa-xmark sdx-chat-reporting__luck-icon sdx-chat-reporting__luck-icon--remove"></i>';
  const remainingText = pulpMode
    ? ` <span class="sdx-chat-reporting__luck-remaining">Remaining: ${escapeHtml(remaining)}</span>`
    : "";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="sdx-chat-reporting__luck-message">${icon}<strong>${escapeHtml(actor?.name ?? "Character")}</strong> ${gainedLuck ? "gained Luck" : "removed Luck"}.${remainingText}</div>`
  });
}

function ensureStylesheet() {
  if (document.getElementById(STYLESHEET_ID)) return;

  const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
    .find(link => link.href.includes(`/modules/${MODULE_ID}/styles/chat-reporting.css`));
  if (existing) {
    existing.id = STYLESHEET_ID;
    return;
  }

  const link = document.createElement("link");
  link.id = STYLESHEET_ID;
  link.rel = "stylesheet";
  link.href = toFoundryRoute(STYLESHEET_PATH);
  document.head.append(link);
}

function getLuckRemaining(actor) {
  const luck = foundry.utils.getProperty(actor, "system.luck") ?? {};
  const remaining = Number(luck.remaining ?? 0);
  return Number.isFinite(remaining) ? remaining : 0;
}

function isPulpMode() {
  try {
    return Boolean(game.settings.get("shadowdark", "usePulpMode"));
  } catch (_error) {
    return false;
  }
}

function isShadowdarkPlayerSheet(app, root) {
  if (game.system?.id !== "shadowdark") return false;

  const actor = app?.actor ?? app?.object;
  if (!actor || actor.documentName !== "Actor" || isGroupActor(actor)) return false;

  const type = String(actor.type ?? "").toLowerCase();
  const appClasses = Array.from(app?.options?.classes ?? []).join(" ").toLowerCase();
  const isPlayer = type === "player" || appClasses.includes("player");
  if (!isPlayer) return false;

  return Boolean(
    root.matches?.(".shadowdark.sheet")
    || root.querySelector?.(".shadowdark.sheet")
    || root.querySelector?.("header.SD-header")
  );
}

function isGroupActor(actor) {
  try {
    if (actor.getFlag?.(MODULE_ID, "isGroup")) return true;
  } catch (_error) {
    // Foundry v12 may throw on inactive legacy flag scopes.
  }

  return Boolean(actor?._source?.flags?.[MODULE_ID]?.isGroup);
}

function getRootElement(html) {
  return html?.[0] ?? html;
}

function getSheetForm(root) {
  if (root.matches?.("form.shadowdark.sheet.player, form")) return root;
  return root.querySelector?.("form.shadowdark.sheet.player, form") ?? root;
}

function toFoundryRoute(path) {
  const clean = String(path ?? "").replace(/^\/+/, "");
  try {
    if (foundry.utils.getRoute) return foundry.utils.getRoute(clean);
  } catch (_error) {
    // Use the host-root fallback.
  }
  return `/${clean}`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function getModuleVersion() {
  const mod = game.modules.get(MODULE_ID);
  return mod?.version ?? mod?.data?.version ?? "unknown";
}

function log(...args) {
  console.log(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
}
