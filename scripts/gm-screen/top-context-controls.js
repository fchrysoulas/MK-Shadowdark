import {
  getSceneEnvironmentContext,
  setSceneEnvironmentContext,
} from "../libs/environment-context.js";
import {
  buildEnvironmentEditorView,
  dangerOptions,
  terrainOptions,
} from "./environment-controls.js";
import { rollEncounterZone } from "./exploration-zone-grid.js";
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function encounterZoneOptions(zones = [], selected = "") {
  const normalized = (Array.isArray(zones) ? zones : [])
    .map((zone, index) => ({
      id: String(zone?.id ?? `zone-${index + 1}`).trim(),
      title: String(zone?.title ?? `Encounter Zone ${index + 1}`).trim() || `Encounter Zone ${index + 1}`,
    }))
    .filter(zone => zone.id);

  if (!normalized.length) {
    return '<option value="" selected>No Encounter Zone configured</option>';
  }

  const selectedId = normalized.some(zone => zone.id === String(selected ?? ""))
    ? String(selected)
    : normalized[0].id;
  return normalized.map(zone => `
    <option value="${escapeHtml(zone.id)}" ${zone.id === selectedId ? "selected" : ""}>${escapeHtml(zone.title)}</option>
  `).join("");
}

function encounterZoneTerrains(zones = [], selectedZoneId = "") {
  const selected = (Array.isArray(zones) ? zones : [])
    .find(zone => String(zone?.id ?? "") === String(selectedZoneId ?? ""));
  return Array.isArray(selected?.terrains) ? selected.terrains : [];
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

function installEncounterZoneSelector(cell, {
  zones = [],
  selectedZoneId = "",
  disabled = false,
} = {}) {
  if (!cell) return null;
  const label = String(cell.querySelector?.("span")?.textContent ?? "Encounter").trim() || "Encounter";
  const zoneDisabled = disabled || !zones.length;
  cell.dataset.mkEncounterZoneSelector = "true";
  cell.innerHTML = `
    <span>${label}</span>
    <select name="encounterZone" data-mk-gm-encounter-zone-selector ${zoneDisabled ? "disabled" : ""} title="Select the Encounter Zone to roll" aria-label="Select Encounter Zone">
      ${encounterZoneOptions(zones, selectedZoneId)}
    </select>
  `;
  return cell.querySelector("[data-mk-gm-encounter-zone-selector]");
}

function installEncounterRollControl(cell, { disabled = false, title = "" } = {}) {
  if (!cell) return null;
  cell.dataset.mkEncounterRollControl = "true";
  cell.innerHTML = `
    <button type="button" class="mk-gm-encounter-roll mk-gm-context-action" data-mk-gm-roll-encounter-zone ${disabled ? "disabled" : ""} ${title ? `title="${title}"` : ""}>
      <i class="fas fa-swords"></i> Roll Encounter
    </button>
  `;
  return cell.querySelector("[data-mk-gm-roll-encounter-zone]");
}

function bindEncounterZoneSelector(application, selector, {
  zones = [],
  terrainCell = null,
  strip = null,
  scene = null,
  storedTerrain = "Default",
} = {}) {
  if (!selector) return false;
  selector.addEventListener?.("change", event => {
    event.stopPropagation();
    const zoneId = String(event.currentTarget?.value ?? "");
    application.encounterZoneId = zoneId;

    const terrains = encounterZoneTerrains(zones, zoneId);
    const currentTerrain = readTopContext(strip)?.terrain ?? storedTerrain;
    const terrainSelect = installSelect(terrainCell, {
      label: "Terrain",
      name: "terrain",
      options: terrainOptions(terrains, currentTerrain),
      disabled: terrains.length === 0,
      title: terrains.length
        ? "Scene terrain available in the selected Encounter Zone"
        : "The selected Encounter Zone has no terrain columns",
    });

    bindTopContextAutosave(application, strip, scene, [terrainSelect]);
    if (terrainSelect?.value && terrainSelect.value !== currentTerrain) {
      void saveTopContext(application, strip, scene).catch(error => {
        console.error("mk-shadowdark | GM Screen Top Context | Zone terrain update failed", error);
        globalThis.ui?.notifications?.error?.(`Encounter Zone terrain update failed: ${error.message}`);
      });
    }
  });
  return true;
}

function readEncounterZoneSelection(root) {
  const strip = root?.matches?.(".mk-gm-pressure-strip")
    ? root
    : root?.querySelector?.(".mk-gm-pressure-strip");
  return String(strip?.querySelector?.('select[name="encounterZone"]')?.value ?? "").trim();
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

function bindEncounterRollButton(button, strip, scene) {
  if (!button) return false;
  button.addEventListener?.("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    try {
      const context = readTopContext(strip);
      const zoneId = readEncounterZoneSelection(strip);
      await rollEncounterZone(context?.terrain ?? "", scene, {
        zoneId,
        dangerLevel: context?.dangerLevel,
      });
    } catch (error) {
      console.error("mk-shadowdark | GM Screen Encounter Zone | Roll failed", error);
      globalThis.ui?.notifications?.error?.(`Encounter Zone roll failed: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  });
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
  const encounterZoneCell = pressureCell(root, "Encounter Zone");
  const encounterRollCell = pressureCell(root, "Roll Encounter");
  if (!terrainCell || !dangerCell || !periodCell || !encounterZoneCell || !encounterRollCell) return false;

  const zones = Array.isArray(view.encounterZones) ? view.encounterZones : [];
  const currentZoneId = String(application.encounterZoneId ?? "");
  const selectedZoneId = zones.some(zone => zone.id === currentZoneId)
    ? currentZoneId
    : String(zones[0]?.id ?? "");
  application.encounterZoneId = selectedZoneId;
  const selectedZoneTerrains = encounterZoneTerrains(zones, selectedZoneId);
  const terrainChoices = selectedZoneTerrains.length ? selectedZoneTerrains : view.terrains;

  const terrainSelect = installSelect(terrainCell, {
    label: "Terrain",
    name: "terrain",
    options: terrainOptions(terrainChoices, view.stored.terrain),
    disabled: terrainChoices.length === 0,
    title: terrainChoices.length
      ? "Scene terrain available in the selected Encounter Zone"
      : "No Encounter Zone is configured for this scene",
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
  const encounterZoneSelect = installEncounterZoneSelector(encounterZoneCell, {
    zones,
    selectedZoneId,
    disabled: view.terrains.length === 0 || zones.length === 0,
  });
  const encounterButton = installEncounterRollControl(encounterRollCell, {
    disabled: terrainChoices.length === 0 || zones.length === 0,
    title: zones.length && terrainChoices.length
      ? "Roll the selected Encounter Zone terrain"
      : "No Encounter Zone is configured for this scene",
  });

  bindTopContextAutosave(application, strip, view.scene, [terrainSelect, dangerSelect, periodSelect]);
  bindEncounterZoneSelector(application, encounterZoneSelect, {
    zones,
    terrainCell,
    strip,
    scene: view.scene,
    storedTerrain: view.stored.terrain,
  });
  bindEncounterRollButton(encounterButton, strip, view.scene);
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
  encounterZoneOptions,
  encounterZoneTerrains,
  installSelect,
  installEncounterZoneSelector,
  installEncounterRollControl,
  bindEncounterZoneSelector,
  readEncounterZoneSelection,
  readTopContext,
  saveTopContext,
  bindTopContextAutosave,
  bindEncounterRollButton,
  decorateTopContext,
  registerTopContextControls,
};
