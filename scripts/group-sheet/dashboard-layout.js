const MODULE_ID = "mk-shadowdark";
const DASHBOARD_CLASS = "mk-group-command-dashboard";
const COLLAPSED_CLASS = "is-party-sidebar-collapsed";
const STORAGE_PREFIX = `${MODULE_ID}.groupDashboard.sidebarCollapsed`;

const expandedMemberByGroup = new Map();
let activePartyContextMenu = null;
let partyContextMenuPointerHandler = null;
let partyContextMenuKeyHandler = null;

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

function findMemberCard(form, uuid) {
  return Array.from(form.querySelectorAll(".mk-group-member[data-member-uuid]")).find(
    card => card.dataset.memberUuid === uuid
  ) ?? null;
}

function findOriginalAction(form, uuid, selector) {
  return findMemberCard(form, uuid)?.querySelector(selector) ?? null;
}

function forwardClick(target, sourceEvent) {
  if (!target) return;

  target.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    composed: true,
    altKey: Boolean(sourceEvent?.altKey),
    ctrlKey: Boolean(sourceEvent?.ctrlKey),
    metaKey: Boolean(sourceEvent?.metaKey),
    shiftKey: Boolean(sourceEvent?.shiftKey),
    button: Number(sourceEvent?.button ?? 0),
  }));
}

function extractStat(card, label) {
  const prefix = String(label ?? "").trim().toUpperCase();
  const stat = Array.from(card.querySelectorAll(".mk-side-stat")).find(element =>
    String(element.textContent ?? "").trim().toUpperCase().startsWith(prefix)
  );

  return String(stat?.querySelector("strong")?.textContent ?? "-").trim() || "-";
}

function getSidebarStorageKey(app) {
  return `${STORAGE_PREFIX}.${app?.actor?.id ?? "unknown"}`;
}

function getStoredCollapsed(app) {
  try {
    return localStorage.getItem(getSidebarStorageKey(app)) === "true";
  } catch (_error) {
    return false;
  }
}

function setStoredCollapsed(app, collapsed) {
  try {
    localStorage.setItem(getSidebarStorageKey(app), String(Boolean(collapsed)));
  } catch (_error) {
    // Storage can be unavailable in hardened browser shells.
  }
}

function createIconButton({ className, icon, label, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<i class="${icon}" aria-hidden="true"></i>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.(event);
  });
  return button;
}

function createSidebarHeader(app, form, partyCount, rosterCount) {
  const header = document.createElement("header");
  header.className = "mk-party-sidebar-header";

  const title = document.createElement("div");
  title.className = "mk-party-sidebar-title";
  title.innerHTML = `
    <span class="mk-party-sidebar-title-icon"><i class="fas fa-users" aria-hidden="true"></i></span>
    <span class="mk-party-sidebar-title-text">Party</span>
    <strong class="mk-party-sidebar-count" title="Active party / roster">${partyCount}/${rosterCount}</strong>
  `;

  const actions = document.createElement("div");
  actions.className = "mk-party-sidebar-actions";

  const travelReset = form.querySelector("[data-tab='traveling'] [data-action='reset-travel']");
  const campingReset = form.querySelector("[data-tab='camping'] [data-action='reset-travel']");

  if (travelReset) {
    actions.appendChild(createIconButton({
      className: "mk-party-sidebar-reset mk-party-sidebar-reset-travel",
      icon: "fas fa-route",
      label: "Reset travel assignments",
      onClick: event => forwardClick(travelReset, event),
    }));
  }

  if (campingReset) {
    actions.appendChild(createIconButton({
      className: "mk-party-sidebar-reset mk-party-sidebar-reset-camping",
      icon: "fas fa-campground",
      label: "Reset camping assignments",
      onClick: event => forwardClick(campingReset, event),
    }));
  }

  const collapse = createIconButton({
    className: "mk-party-sidebar-collapse",
    icon: "fas fa-angles-left",
    label: "Collapse party sidebar",
    onClick: () => {
      const dashboard = form.querySelector(`.${DASHBOARD_CLASS}`);
      if (!dashboard) return;

      const collapsed = !dashboard.classList.contains(COLLAPSED_CLASS);
      dashboard.classList.toggle(COLLAPSED_CLASS, collapsed);
      collapse.innerHTML = `<i class="fas ${collapsed ? "fa-angles-right" : "fa-angles-left"}" aria-hidden="true"></i>`;
      collapse.title = collapsed ? "Expand party sidebar" : "Collapse party sidebar";
      collapse.setAttribute("aria-label", collapse.title);
      setStoredCollapsed(app, collapsed);
    },
  });

  actions.appendChild(collapse);
  header.append(title, actions);
  return header;
}

function configureMemberDrag(app, form, element, uuid, isActivePartyMember) {
  // The party sidebar is the shared drag source for activity and mount
  // assignments. It must not inherit the availability state of the hidden
  // activity-roster button, which can be stale or be absent on another tab.
  const canAssign = Boolean(isActivePartyMember);

  element.draggable = Boolean(canAssign);
  element.classList.toggle("is-unavailable", !canAssign);

  if (!canAssign) {
    element.title = "Move this character to the active party before assigning an activity or mount.";
    return;
  }

  element.addEventListener("dragstart", event => {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;

    app._campingDragActorUuid = uuid;
    dataTransfer.effectAllowed = "move";
    try {
      dataTransfer.setData("application/x-mk-shadowdark-camping-member", uuid);
    } catch (_error) {
      // Some browser shells only allow standard drag data types.
    }
    dataTransfer.setData("text/plain", uuid);
    element.closest(".mk-party-member")?.classList.add("is-dragging");
  });

  element.addEventListener("dragend", () => {
    app._campingDragActorUuid = "";
    element.closest(".mk-party-member")?.classList.remove("is-dragging");
    form.querySelectorAll(".mk-travel-card.is-drag-over, .mk-mount-card.is-rider-drag-over").forEach(card => {
      card.classList.remove("is-drag-over");
      card.classList.remove("is-rider-drag-over");
    });
  });
}

function closePartyContextMenu() {
  activePartyContextMenu?.remove();
  activePartyContextMenu = null;

  if (partyContextMenuPointerHandler) {
    document.removeEventListener("pointerdown", partyContextMenuPointerHandler, true);
    partyContextMenuPointerHandler = null;
  }

  if (partyContextMenuKeyHandler) {
    document.removeEventListener("keydown", partyContextMenuKeyHandler, true);
    partyContextMenuKeyHandler = null;
  }
}

function openPartyContextMenu(app, form, card, event) {
  closePartyContextMenu();

  const uuid = card.dataset.memberUuid;
  const name = String(card.querySelector(".mk-member-name")?.textContent ?? "Character").trim();
  const isActivePartyMember = card.dataset.partyActive === "true";
  const menu = document.createElement("div");
  menu.className = "mk-party-member-context-menu";
  menu.setAttribute("role", "menu");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.setAttribute("role", "menuitem");
  toggle.textContent = isActivePartyMember ? "Move to Roster" : "Add to Active Party";
  toggle.disabled = !game.user.isGM;
  toggle.title = game.user.isGM
    ? `${toggle.textContent}: ${name}`
    : "Only the GM can change the active party";
  toggle.addEventListener("click", async () => {
    closePartyContextMenu();
    await app._setPartyMemberActive(uuid, !isActivePartyMember);
  });

  const open = document.createElement("button");
  open.type = "button";
  open.setAttribute("role", "menuitem");
  open.textContent = "Open Character Sheet";
  open.addEventListener("click", clickEvent => {
    closePartyContextMenu();
    forwardClick(findOriginalAction(form, uuid, "[data-action='open-member']"), clickEvent);
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.setAttribute("role", "menuitem");
  remove.className = "is-danger";
  remove.textContent = "Remove from Group";
  remove.disabled = !game.user.isGM;
  remove.title = game.user.isGM
    ? `Remove ${name} from the group`
    : "Only the GM can remove group members";
  remove.addEventListener("click", async () => {
    closePartyContextMenu();
    await app._removeGroupMember(uuid, { confirm: true });
  });

  menu.append(toggle, open, remove);
  document.body.appendChild(menu);
  activePartyContextMenu = menu;

  const maxLeft = Math.max(8, window.innerWidth - menu.offsetWidth - 8);
  const maxTop = Math.max(8, window.innerHeight - menu.offsetHeight - 8);
  menu.style.left = `${Math.min(event.clientX, maxLeft)}px`;
  menu.style.top = `${Math.min(event.clientY, maxTop)}px`;

  partyContextMenuPointerHandler = pointerEvent => {
    if (!menu.contains(pointerEvent.target)) closePartyContextMenu();
  };
  partyContextMenuKeyHandler = keyEvent => {
    if (keyEvent.key === "Escape") closePartyContextMenu();
  };
  document.addEventListener("pointerdown", partyContextMenuPointerHandler, true);
  document.addEventListener("keydown", partyContextMenuKeyHandler, true);
}

function appendAssignmentIndicator(portrait, kind, activityName) {
  if (!activityName) return;

  const indicator = document.createElement("span");
  indicator.className = `mk-party-member-assignment mk-party-member-assignment-${kind}`;
  indicator.title = `${kind === "travel" ? "Travelling" : "Camping"}: ${activityName}`;
  indicator.setAttribute("aria-label", indicator.title);
  portrait.appendChild(indicator);
}

function createMemberSummary(app, form, card) {
  const uuid = card.dataset.memberUuid;
  const name = String(card.querySelector(".mk-member-name")?.textContent ?? "Unknown").trim();
  const className = String(card.querySelector(".mk-member-class")?.textContent ?? "").trim();
  const image = card.querySelector(".mk-member-image")?.getAttribute("src") ?? "icons/svg/mystery-man.svg";
  const hpText = String(card.querySelector(".mk-hp-text")?.textContent ?? "-").trim();
  const hpWidth = card.querySelector(".mk-hp-fill")?.style?.width ?? "0%";
  const ac = extractStat(card, "AC");
  const level = extractStat(card, "LVL");
  const slots = extractStat(card, "Slots");
  const xp = extractStat(card, "XP");
  const isActivePartyMember = card.dataset.partyActive === "true";

  const details = document.createElement("details");
  details.className = "mk-party-member";
  details.dataset.memberUuid = uuid;
  details.classList.toggle("is-roster-member", !isActivePartyMember);

  const previouslyExpanded = expandedMemberByGroup.get(app.actor.id);
  details.open = previouslyExpanded === uuid;

  const summary = document.createElement("summary");
  summary.className = "mk-party-member-summary";
  configureMemberDrag(app, form, summary, uuid, isActivePartyMember);

  const portraitButton = document.createElement("button");
  portraitButton.type = "button";
  portraitButton.className = "mk-party-member-portrait";
  portraitButton.title = `Open ${name}`;
  portraitButton.setAttribute("aria-label", `Open ${name}`);
  const portraitImage = document.createElement("img");
  portraitImage.src = image;
  portraitImage.alt = name;
  portraitButton.appendChild(portraitImage);
  appendAssignmentIndicator(portraitButton, "travel", card.dataset.travelAssignment);
  appendAssignmentIndicator(portraitButton, "camping", card.dataset.campingAssignment);
  portraitButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    forwardClick(findOriginalAction(form, uuid, "[data-action='open-member']"), event);
  });

  const identity = document.createElement("div");
  identity.className = "mk-party-member-identity";
  const identityName = document.createElement("strong");
  identityName.textContent = name;
  const identityClass = document.createElement("span");
  identityClass.textContent = className || "Party member";
  identity.append(identityName, identityClass);

  const hp = document.createElement("div");
  hp.className = "mk-party-member-hp";
  hp.innerHTML = `
    <span>${hpText}</span>
    <span class="mk-party-member-hp-track"><span class="mk-party-member-hp-fill" style="width:${hpWidth}"></span></span>
  `;

  const quickStats = document.createElement("div");
  quickStats.className = "mk-party-member-quick-stats";
  quickStats.innerHTML = `
    <span title="Armor Class">AC <strong>${ac}</strong></span>
    <span title="Level">LVL <strong>${level}</strong></span>
  `;

  const chevron = document.createElement("span");
  chevron.className = "mk-party-member-chevron";
  chevron.innerHTML = '<i class="fas fa-chevron-down" aria-hidden="true"></i>';

  summary.append(portraitButton, identity, hp, quickStats, chevron);

  const panel = document.createElement("div");
  panel.className = "mk-party-member-panel";

  const abilityGrid = document.createElement("div");
  abilityGrid.className = "mk-party-member-abilities";

  card.querySelectorAll(".mk-ability-button[data-ability]").forEach(original => {
    const ability = original.dataset.ability;
    const label = String(original.querySelector("span")?.textContent ?? ability ?? "").trim();
    const modifier = String(original.querySelector("strong")?.textContent ?? "0").trim();

    const button = document.createElement("button");
    button.type = "button";
    button.className = "mk-party-ability-button";
    button.dataset.ability = ability;
    button.title = `Roll ${label}`;
    button.innerHTML = `<span>${label}</span><strong>${modifier}</strong>`;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      forwardClick(findOriginalAction(
        form,
        uuid,
        `[data-action='roll-ability'][data-ability='${ability}']`
      ), event);
    });

    abilityGrid.appendChild(button);
  });

  const meta = document.createElement("div");
  meta.className = "mk-party-member-meta";
  meta.innerHTML = `
    <span>XP <strong>${xp}</strong></span>
    <span class="${card.querySelector(".mk-side-stat.mk-danger") ? "mk-danger" : ""}">Slots <strong>${slots}</strong></span>
  `;

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "mk-party-member-open";
  openButton.innerHTML = '<i class="fas fa-up-right-from-square" aria-hidden="true"></i><span>Open Sheet</span>';
  openButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    forwardClick(findOriginalAction(form, uuid, "[data-action='open-member']"), event);
  });

  panel.append(abilityGrid, meta, openButton);
  details.append(summary, panel);

  details.addEventListener("toggle", () => {
    if (!details.open) {
      if (expandedMemberByGroup.get(app.actor.id) === uuid) {
        expandedMemberByGroup.delete(app.actor.id);
      }
      return;
    }

    expandedMemberByGroup.set(app.actor.id, uuid);
    details.parentElement?.querySelectorAll("details.mk-party-member[open]").forEach(other => {
      if (other !== details) other.open = false;
    });
  });

  details.addEventListener("contextmenu", event => {
    event.preventDefault();
    event.stopPropagation();
    openPartyContextMenu(app, form, card, event);
  });

  return details;
}

function createSidebar(app, form) {
  const memberCards = Array.from(form.querySelectorAll(".mk-group-member-source .mk-group-member[data-member-uuid]"));
  const sidebar = document.createElement("aside");
  sidebar.className = "mk-group-party-sidebar";
  sidebar.setAttribute("aria-label", "Party roster");
  sidebar.dataset.partyMemberDropzone = "true";
  sidebar.title = game.user.isGM
    ? "Drop a player character here to add them to the party"
    : "Only the GM can add party members";

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

  sidebar.addEventListener("drop", () => {
    sidebar.classList.remove("is-drag-over");
  });

  const partyCount = memberCards.filter(card => card.dataset.partyActive === "true").length;
  sidebar.appendChild(createSidebarHeader(app, form, partyCount, memberCards.length));

  const list = document.createElement("div");
  list.className = "mk-party-sidebar-list";

  if (memberCards.length) {
    memberCards.forEach(card => list.appendChild(createMemberSummary(app, form, card)));
  } else {
    const empty = document.createElement("div");
    empty.className = "mk-party-sidebar-empty";
    empty.innerHTML = '<i class="fas fa-user-plus" aria-hidden="true"></i><span>Drop actors onto the sheet to build the party.</span>';
    list.appendChild(empty);
  }

  sidebar.appendChild(list);
  return sidebar;
}

function applyDashboardLayout(app, html) {
  const root = getRootElement(html);
  const form = getGroupForm(root);
  if (!isGroupSheet(app, form)) return;
  if (form.querySelector(`.${DASHBOARD_CLASS}`)) return;

  const header = form.querySelector(":scope > .mk-group-header");
  const nav = form.querySelector(":scope > .mk-group-nav");
  const content = form.querySelector(":scope > .mk-group-content");
  if (!header || !nav || !content) return;

  const dashboard = document.createElement("div");
  dashboard.className = DASHBOARD_CLASS;

  const workspace = document.createElement("section");
  workspace.className = "mk-group-workspace";
  workspace.append(nav, content);

  const sidebar = createSidebar(app, form);
  dashboard.append(sidebar, workspace);
  header.insertAdjacentElement("afterend", dashboard);

  const collapsed = getStoredCollapsed(app);
  dashboard.classList.toggle(COLLAPSED_CLASS, collapsed);
  const collapseButton = sidebar.querySelector(".mk-party-sidebar-collapse");
  if (collapseButton && collapsed) {
    collapseButton.innerHTML = '<i class="fas fa-angles-right" aria-hidden="true"></i>';
    collapseButton.title = "Expand party sidebar";
    collapseButton.setAttribute("aria-label", collapseButton.title);
  }

  form.classList.add("mk-group-dashboard-enabled");
}

function onRenderGroupSheet(app, html) {
  closePartyContextMenu();
  applyDashboardLayout(app, html);
}

Hooks.on("renderActorSheet", onRenderGroupSheet);
Hooks.on("renderMKGroupSheet", onRenderGroupSheet);
Hooks.on("renderSDXGroupSheet", onRenderGroupSheet);
