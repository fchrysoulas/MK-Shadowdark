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

function ensureSaveCell(strip, periodCell) {
  let cell = strip?.querySelector?.("[data-mk-context-save-cell]");
  if (cell) return cell;

  cell = globalThis.document?.createElement?.("div");
  if (!cell) return null;
  cell.className = "mk-gm-context-save-cell";
  cell.dataset.mkContextSaveCell = "true";
  cell.hidden = true;
  cell.innerHTML = `
    <span>Context</span>
    <button type="button" data-mk-context-save disabled title="Save Terrain, Danger, and Period">
      <i class="fas fa-floppy-disk"></i> Save Context
    </button>
  `;

  if (periodCell?.after) periodCell.after(cell);
  else strip?.append?.(cell);
  return cell;
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

function sameTopContext(left, right) {
  return left?.terrain === right?.terrain
    && left?.dangerLevel === right?.dangerLevel
    && left?.period === right?.period;
}

function updateSaveState(root, baseline) {
  const strip = root?.matches?.(".mk-gm-pressure-strip")
    ? root
    : root?.querySelector?.(".mk-gm-pressure-strip");
  const cell = strip?.querySelector?.("[data-mk-context-save-cell]");
  const button = cell?.querySelector?.("[data-mk-context-save]");
  const value = readTopContext(strip);
  const dirty = Boolean(value && !sameTopContext(value, baseline));

  if (cell) cell.hidden = !dirty;
  if (button) button.disabled = !dirty;
  return dirty;
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

function decorateTopContext(application, element) {
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

  const saveCell = ensureSaveCell(strip, periodCell);
  const saveButton = saveCell?.querySelector?.("[data-mk-context-save]");
  const refreshDirty = () => updateSaveState(strip, view.persisted);

  for (const select of [terrainSelect, dangerSelect, periodSelect]) {
    select?.addEventListener?.("change", refreshDirty);
  }

  saveButton?.addEventListener?.("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    saveButton.disabled = true;
    try {
      await saveTopContext(application, strip, view.scene);
    } catch (error) {
      console.error("mk-shadowdark | GM Screen Top Context | Save failed", error);
      globalThis.ui?.notifications?.error?.(`Scene context update failed: ${error.message}`);
      refreshDirty();
    }
  });

  refreshDirty();
  return true;
}

function registerTopContextControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    decorateTopContext(application, element);
  });
}

registerTopContextControls();

export {
  gmScreenApplication,
  rootElement,
  pressureCell,
  periodOptions,
  installSelect,
  ensureSaveCell,
  readTopContext,
  sameTopContext,
  updateSaveState,
  saveTopContext,
  decorateTopContext,
  registerTopContextControls,
};
