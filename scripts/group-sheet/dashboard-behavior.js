import { resolveActorFromUuid } from "./actors.js";

const MODULE_ID = "mk-shadowdark";
const COLLAPSED_CLASS = "is-party-sidebar-collapsed";
const STORAGE_PREFIX = `${MODULE_ID}.groupDashboard.sidebarCollapsed`;

const expandedMemberByGroup = new Map();
let activeContextMenu = null;
let contextMenuPointerHandler = null;
let contextMenuKeyHandler = null;

function getRootElement(html) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  if (html.jquery) return html[0] ?? null;
  if (Array.isArray(html)) return html[0] ?? null;
  return html[0] ?? null;
}

function getGroupForm(root) {
  if (!root?.querySelector) return null;
  if (root.matches?.("form.mk-group-sheet")) return root;
  return root.querySelector("form.mk-group-sheet");
}

function isGroupSheet(app, form) {
  if (!app?.actor || !form) return false;
  return Boolean(
    app.actor.getFlag?.(MODULE_ID, "isGroup")
    ?? app.actor.flags?.[MODULE_ID]?.isGroup
  );
}

function getSidebar(form) {
  return form?.querySelector?.(":scope > .mk-group-member-source") ?? null;
}

function storageKey(app) {
  return `${STORAGE_PREFIX}.${app?.actor?.id ?? "unknown"}`;
}

function readCollapsed(app) {
  try {
    return localStorage.getItem(storageKey(app)) === "true";
  } catch (_error) {
    return false;
  }
}

function writeCollapsed(app, collapsed) {
  try {
    localStorage.setItem(storageKey(app), String(Boolean(collapsed)));
  } catch (_error) {
    // Browser storage can be unavailable in hardened shells.
  }
}

function setCollapsed(app, form, collapsed) {
  form.classList.toggle(COLLAPSED_CLASS, Boolean(collapsed));
  writeCollapsed(app, collapsed);
  const sidebar = getSidebar(form);
  if (sidebar) {
    sidebar.title = collapsed
      ? "Party rail collapsed. Double-click to expand. Right-click for party actions."
      : "Party rail. Double-click to collapse. Right-click a member for party actions.";
  }
}

function closeContextMenu() {
  activeContextMenu?.remove();
  activeContextMenu = null;

  if (contextMenuPointerHandler) {
    document.removeEventListener("pointerdown", contextMenuPointerHandler, true);
    contextMenuPointerHandler = null;
  }

  if (contextMenuKeyHandler) {
    document.removeEventListener("keydown", contextMenuKeyHandler, true);
    contextMenuKeyHandler = null;
  }
}

function positionContextMenu(menu, event) {
  document.body.appendChild(menu);
  activeContextMenu = menu;

  const maxLeft = Math.max(8, window.innerWidth - menu.offsetWidth - 8);
  const maxTop = Math.max(8, window.innerHeight - menu.offsetHeight - 8);
  menu.style.left = `${Math.min(event.clientX, maxLeft)}px`;
  menu.style.top = `${Math.min(event.clientY, maxTop)}px`;

  contextMenuPointerHandler = pointerEvent => {
    if (!menu.contains(pointerEvent.target)) closeContextMenu();
  };
  contextMenuKeyHandler = keyEvent => {
    if (keyEvent.key === "Escape") closeContextMenu();
  };
  document.addEventListener("pointerdown", contextMenuPointerHandler, true);
  document.addEventListener("keydown", contextMenuKeyHandler, true);
}

function menuButton(label, onClick, { danger = false, disabled = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  if (danger) button.classList.add("is-danger");
  button.addEventListener("click", async () => {
    closeContextMenu();
    await onClick?.();
  });
  return button;
}

async function openMember(uuid) {
  const actor = await resolveActorFromUuid(uuid);
  actor?.sheet?.render(true);
}

function openMemberContextMenu(app, card, event) {
  closeContextMenu();

  const uuid = card.dataset.memberUuid;
  const name = String(card.querySelector(".mk-member-name")?.textContent ?? "Character").trim();
  const active = card.dataset.partyActive === "true";
  const menu = document.createElement("div");
  menu.className = "mk-party-member-context-menu";
  menu.setAttribute("role", "menu");

  menu.append(
    menuButton(active ? "Move to Roster" : "Add to Active Party", () => app._setPartyMemberActive(uuid, !active), {
      disabled: !game.user?.isGM,
    }),
    menuButton("Open Character Sheet", () => openMember(uuid)),
    menuButton(`Remove ${name} from Group`, () => app._removeGroupMember(uuid, { confirm: true }), {
      danger: true,
      disabled: !game.user?.isGM,
    })
  );

  positionContextMenu(menu, event);
}

function configureMemberExpansion(app, sidebar, card) {
  const uuid = card.dataset.memberUuid;
  card.classList.toggle("is-expanded", expandedMemberByGroup.get(app.actor.id) === uuid);

  card.addEventListener("click", event => {
    if (event.target.closest("button, input, select, a")) return;

    const expanding = !card.classList.contains("is-expanded");
    sidebar.querySelectorAll(".mk-group-member.is-expanded").forEach(other => {
      if (other !== card) other.classList.remove("is-expanded");
    });

    card.classList.toggle("is-expanded", expanding);
    if (expanding) expandedMemberByGroup.set(app.actor.id, uuid);
    else if (expandedMemberByGroup.get(app.actor.id) === uuid) expandedMemberByGroup.delete(app.actor.id);
  });
}

function configureMemberDrag(app, form, card) {
  const active = card.dataset.partyActive === "true";
  card.draggable = active;
  card.classList.toggle("is-roster-member", !active);

  const travel = String(card.dataset.travelAssignment ?? "").trim();
  const camping = String(card.dataset.campingAssignment ?? "").trim();
  const assignments = [
    travel ? `Travelling: ${travel}` : "",
    camping ? `Camping: ${camping}` : "",
  ].filter(Boolean);
  if (assignments.length) card.setAttribute("aria-label", assignments.join("; "));

  if (!active) return;

  card.addEventListener("dragstart", event => {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;

    app._campingDragActorUuid = card.dataset.memberUuid;
    dataTransfer.effectAllowed = "move";
    try {
      dataTransfer.setData("application/x-mk-shadowdark-camping-member", card.dataset.memberUuid);
    } catch (_error) {
      // Some browser shells only allow standard drag data types.
    }
    dataTransfer.setData("text/plain", card.dataset.memberUuid);
    card.classList.add("is-dragging");
  });

  card.addEventListener("dragend", () => {
    app._campingDragActorUuid = "";
    card.classList.remove("is-dragging");
    form.querySelectorAll(".mk-travel-card.is-drag-over, .mk-mount-card.is-rider-drag-over").forEach(target => {
      target.classList.remove("is-drag-over", "is-rider-drag-over");
    });
  });
}

function configureSidebar(app, form) {
  const sidebar = getSidebar(form);
  if (!sidebar || sidebar.dataset.mkNativeDashboardBound === "true") return;
  sidebar.dataset.mkNativeDashboardBound = "true";
  sidebar.dataset.partyMemberDropzone = "true";
  sidebar.setAttribute("aria-label", "Party roster");

  setCollapsed(app, form, readCollapsed(app));

  sidebar.addEventListener("dblclick", event => {
    if (event.target.closest("button, input, select, a")) return;
    setCollapsed(app, form, !form.classList.contains(COLLAPSED_CLASS));
  });

  sidebar.addEventListener("dragenter", event => {
    event.preventDefault();
    sidebar.classList.add("is-drag-over");
  });
  sidebar.addEventListener("dragover", event => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    sidebar.classList.add("is-drag-over");
  });
  sidebar.addEventListener("dragleave", event => {
    if (!sidebar.contains(event.relatedTarget)) sidebar.classList.remove("is-drag-over");
  });
  sidebar.addEventListener("drop", () => sidebar.classList.remove("is-drag-over"));

  sidebar.querySelectorAll(".mk-group-member[data-member-uuid]").forEach(card => {
    configureMemberExpansion(app, sidebar, card);
    configureMemberDrag(app, form, card);
    card.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      openMemberContextMenu(app, card, event);
    });
  });
}

function onRenderGroupSheet(app, html) {
  closeContextMenu();
  const root = getRootElement(html);
  const form = getGroupForm(root);
  if (!isGroupSheet(app, form)) return;
  configureSidebar(app, form);
}

Hooks.on("renderActorSheet", onRenderGroupSheet);
Hooks.on("renderMKGroupSheet", onRenderGroupSheet);
Hooks.on("renderSDXGroupSheet", onRenderGroupSheet);
