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

function decorateLightPressure(application, element, context) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  if (!root) return false;

  const summary = buildLightPressure(context?.party ?? []);
  const strip = root.querySelector(".mk-gm-pressure-strip");
  if (!strip) return false;

  strip.querySelector("[data-mk-gm-light-pressure]")?.remove();
  const combatCell = strip.querySelector(".is-combat");
  const holder = document.createElement("div");
  holder.innerHTML = renderPressureCell(summary).trim();
  const cell = holder.firstElementChild;
  if (cell) strip.insertBefore(cell, combatCell ?? null);
  return Boolean(cell);
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
  decorateLightPressure,
  registerGmScreenLightPressure,
};