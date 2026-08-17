import { resolveActorFromUuid } from "../group-sheet/actors.js";
import { APP_ID } from "./gm-screen.js";

function gmScreenApplication(application) {
  return Boolean(
    application
    && (
      application.id === APP_ID
      || application.options?.id === APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === APP_ID
    )
  );
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function buildLightPressure(party = []) {
  const carriers = [];
  let total = 0;

  for (const member of Array.isArray(party) ? party : []) {
    const sources = Array.isArray(member?.light?.items) ? member.light.items : [];
    const count = Math.max(0, Number(member?.light?.total ?? sources.length) || 0);
    if (count <= 0) continue;

    total += count;
    carriers.push({
      actorUuid: String(member?.actorUuid ?? ""),
      name: String(member?.name ?? "Member"),
      count,
      items: sources.map(item => ({
        id: String(item?.id ?? ""),
        name: String(item?.name ?? "Light Source"),
      })),
    });
  }

  return {
    total,
    carrierCount: carriers.length,
    carriers,
    hasLight: total > 0,
    pressureLabel: total > 0 ? `${total} active` : "NO LIGHT",
  };
}

function renderPressureCell(summary) {
  const title = summary.hasLight
    ? `${summary.total} active light source${summary.total === 1 ? "" : "s"} carried by ${summary.carrierCount} active member${summary.carrierCount === 1 ? "" : "s"}`
    : "No active light source among active party members";

  return `
    <div class="mk-gm-light-pressure ${summary.hasLight ? "has-light" : "no-light"}" data-mk-gm-light-pressure title="${escapeHtml(title)}">
      <span>Light</span>
      <strong>${summary.hasLight ? '<i class="fas fa-fire-flame-simple"></i>' : '<i class="fas fa-triangle-exclamation"></i>'} ${escapeHtml(summary.pressureLabel)}</strong>
    </div>
  `;
}

function renderOverviewSummary(summary) {
  if (!summary.hasLight) {
    return `
      <div class="mk-gm-alert is-warning mk-gm-light-alert" data-mk-gm-light-overview>
        <i class="fas fa-fire-flame-simple"></i>
        <span><strong>No active light.</strong> None of the active party members currently has an active Shadowdark light source.</span>
      </div>
    `;
  }

  const carriers = summary.carriers.map(carrier => {
    const names = carrier.items.length
      ? carrier.items.map(item => item.name).join(", ")
      : `${carrier.count} active source${carrier.count === 1 ? "" : "s"}`;
    return `
      <button type="button" class="mk-gm-light-carrier" data-mk-light-carrier="${escapeHtml(carrier.actorUuid)}" title="Open ${escapeHtml(carrier.name)}">
        <i class="fas fa-fire-flame-simple"></i>
        <span>${escapeHtml(carrier.name)}</span>
        <small>${escapeHtml(names)}</small>
      </button>
    `;
  }).join("");

  return `
    <div class="mk-gm-light-overview" data-mk-gm-light-overview>
      <div class="mk-gm-light-overview-heading">
        <strong><i class="fas fa-fire-flame-simple"></i> ${summary.total} active light source${summary.total === 1 ? "" : "s"}</strong>
        <span>${summary.carrierCount} carrier${summary.carrierCount === 1 ? "" : "s"}</span>
      </div>
      <div class="mk-gm-light-carriers">${carriers}</div>
    </div>
  `;
}

async function openCarrier(actorUuid) {
  const actor = await resolveActorFromUuid(String(actorUuid ?? ""));
  if (!actor) return null;
  actor.sheet?.render?.(true);
  return actor;
}

function insertHtml(parent, html) {
  const holder = document.createElement("div");
  holder.innerHTML = html.trim();
  const element = holder.firstElementChild;
  if (element) parent.append(element);
  return element;
}

function decorateLightPressure(application, element, context) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  if (!root) return false;

  const summary = buildLightPressure(context?.party ?? []);
  const strip = root.querySelector(".mk-gm-pressure-strip");
  if (strip) {
    strip.querySelector("[data-mk-gm-light-pressure]")?.remove();
    const combatCell = strip.querySelector(".is-combat");
    const holder = document.createElement("div");
    holder.innerHTML = renderPressureCell(summary).trim();
    const cell = holder.firstElementChild;
    if (cell) strip.insertBefore(cell, combatCell ?? null);
  }

  const panel = root.querySelector('[data-workspace-panel="overview"] .mk-gm-panel:first-child');
  if (panel) {
    panel.querySelector("[data-mk-gm-light-overview]")?.remove();
    const overview = insertHtml(panel, renderOverviewSummary(summary));
    overview?.querySelectorAll?.("[data-mk-light-carrier]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        void openCarrier(button.dataset.mkLightCarrier);
      });
    });
  }

  return true;
}

function registerGmScreenLightPressure() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element, context) => {
    decorateLightPressure(application, element, context);
  });
}

registerGmScreenLightPressure();

export {
  gmScreenApplication,
  buildLightPressure,
  renderPressureCell,
  renderOverviewSummary,
  decorateLightPressure,
  registerGmScreenLightPressure,
};
