import { getGroupRestState } from "../group-sheet/rest-encounters.js";
import {
  getSceneEnvironmentContext,
  setSceneEnvironmentContext,
} from "../libs/environment-context.js";
import {
  buildEnvironmentEditorView,
  dangerOptions,
  terrainOptions,
} from "./environment-controls.js";
import { APP_ID } from "./gm-screen.js";
import { resolveGmScreenGroup } from "./view-model.js";

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

function rootElement(element) {
  if (element?.querySelector) return element;
  if (element?.[0]?.querySelector) return element[0];
  return null;
}

function pressureCell(root, label) {
  const expected = String(label ?? "").trim().toLowerCase();
  return Array.from(root?.querySelectorAll?.(".mk-gm-pressure-strip > div") ?? [])
    .find(cell => String(cell.querySelector?.("span")?.textContent ?? "").trim().toLowerCase() === expected)
    ?? null;
}

function periodOptions(selected) {
  return `
    <option value="auto" ${selected === "auto" ? "selected" : ""}>Auto</option>
    <option value="day" ${selected === "day" ? "selected" : ""}>Day</option>
    <option value="night" ${selected === "night" ? "selected" : ""}>Night</option>
  `;
}

function installSelect(cell, {
  label,
  name,
  options,
  disabled = false,
  title = "",
} = {}) {
  if (!cell) return null;
  cell.dataset.mkContextControl = name;
  cell.innerHTML = `
    <span>${label}</span>
    <select name="${name}" ${disabled ? "disabled" : ""} ${title ? `title="${title}"` : ""}>
      ${options}
    </select>
  `;
  return cell.querySelector(`select[name="${name}"]`);
}

function readTopContext(root) {
  const strip = root?.matches?.(".mk-gm-pressure-strip")
    ? root
    : root?.querySelector?.(".mk-gm-pressure-strip");
  if (!strip) return null;

  const read = name => String(strip.querySelector?.(`select[name="${name}"]`)?.value ?? "");
  return {
    terrain: read("terrain").trim() || "Default",
    dangerLevel: read("dangerLevel"),
    period: read("period"),
  };
}

async function saveTopContext(application, root, scene) {
  const value = readTopContext(root);
  if (!value || !scene) return null;
  if (!globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change the Scene context.");
    return null;
  }

  const current = getSceneEnvironmentContext(scene);
  const result = await setSceneEnvironmentContext({
    ...current,
    ...value,
    tableUuid: current.tableUuid,
  }, scene);

  await application?.render?.({ force: true });
  return result;
}

function bindTopContextAutosave(application, strip, scene, controls = []) {
  for (const select of controls.filter(Boolean)) {
    select.addEventListener?.("change", async event => {
      event.stopPropagation();
      for (const control of controls.filter(Boolean)) control.disabled = true;
      try {
        await saveTopContext(application, strip, scene);
      } catch (error) {
        console.error("mk-shadowdark | GM Screen Top Context | Save failed", error);
        globalThis.ui?.notifications?.error?.(`Scene context update failed: ${error.message}`);
        for (const control of controls.filter(Boolean)) control.disabled = false;
      }
    });
  }
  return true;
}

function activeRestRetainsChecks(restState, dangerLevel) {
  const active = ["checking", "interrupted"].includes(String(restState?.workflow?.status ?? ""));
  return dangerLevel === "safe"
    && active
    && restState?.cadenceSnapshotted === true
    && Array.isArray(restState?.checkTurns)
    && restState.checkTurns.length > 0;
}

function renderRestSnapshotWarning(cell, visible) {
  cell?.querySelector?.("[data-mk-rest-snapshot-warning]")?.remove?.();
  if (!cell || !visible) return false;
  const warning = globalThis.document?.createElement?.("small");
  if (!warning) return false;
  warning.dataset.mkRestSnapshotWarning = "true";
  warning.className = "mk-gm-context-warning";
  warning.textContent = "Active rest keeps its original encounter schedule";
  warning.title = "This rest started before the Scene became Safe, so its snapshotted encounter checks still apply.";
  cell.append(warning);
  return true;
}

async function decorateTopContext(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = rootElement(element);
  const strip = root?.querySelector?.(".mk-gm-pressure-strip");
  if (!strip) return false;

  const view = buildEnvironmentEditorView();
  if (!view?.scene) return false;

  const terrainCell = pressureCell(root, "Terrain");
  const dangerCell = pressureCell(root, "Danger");
  const periodCell = pressureCell(root, "Period");
  if (!terrainCell || !dangerCell || !periodCell) return false;

  const terrainSelect = installSelect(terrainCell, {
    label: "Terrain",
    name: "terrain",
    options: terrainOptions(view.terrains, view.stored.terrain),
    disabled: view.terrains.length === 0,
    title: view.terrains.length
      ? "Scene terrain"
      : "Configure an Encounter Zone in Tables to populate Terrain",
  });
  const dangerSelect = installSelect(dangerCell, {
    label: "Danger",
    name: "dangerLevel",
    options: dangerOptions(view.rules, view.stored.dangerLevel),
    title: "Scene danger level",
  });
  const periodSelect = installSelect(periodCell, {
    label: "Period",
    name: "period",
    options: periodOptions(view.stored.period),
    title: "Scene day/night period",
  });

  const group = await resolveGmScreenGroup(application.groupActorUuid ?? "");
  const restState = group ? getGroupRestState(group) : null;
  renderRestSnapshotWarning(
    dangerCell,
    activeRestRetainsChecks(restState, view.stored.dangerLevel),
  );

  bindTopContextAutosave(application, strip, view.scene, [terrainSelect, dangerSelect, periodSelect]);
  return true;
}

function registerTopContextControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    void decorateTopContext(application, element);
  });
}

registerTopContextControls();

export {
  gmScreenApplication,
  rootElement,
  pressureCell,
  periodOptions,
  installSelect,
  readTopContext,
  saveTopContext,
  bindTopContextAutosave,
  activeRestRetainsChecks,
  renderRestSnapshotWarning,
  decorateTopContext,
  registerTopContextControls,
};
