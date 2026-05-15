/* ---------------------------------------- */
/* MK-Shadowdark - Editable Qty         */
/* ---------------------------------------- */

(() => {
  const MODULE_ID = "mk-shadowdark";
  const FEATURE = "EditableQty";
  const VERSION = "1.1.0";

  const SETTING_ENABLED = "editableQtyEnabled";

  function log(...args) {
    console.log(`${MODULE_ID} | ${FEATURE} v${VERSION} |`, ...args);
  }

  function getPropertySafe(object, path) {
    try {
      return foundry.utils.getProperty(object, path);
    } catch (_err) {
      return undefined;
    }
  }

  function normalizeText(text) {
    return String(text ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function toInt(value, fallback = 0) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function getQtyPath(item) {
    const candidates = [
      "system.quantity.value",
      "system.quantity",
      "system.qty.value",
      "system.qty",
      "system.amount.value",
      "system.amount"
    ];

    for (const path of candidates) {
      const value = getPropertySafe(item, path);

      if (value === undefined || value === null) continue;

      if (typeof value === "number") return path;

      if (typeof value === "string" && value.trim() !== "") {
        const n = Number.parseInt(value, 10);
        if (Number.isFinite(n)) return path;
      }
    }

    return null;
  }

  function getQtyValue(item, path) {
    const value = getPropertySafe(item, path);
    return Math.max(0, toInt(value, 1));
  }

  function userCanEditItem(item, actor) {
    if (game.user?.isGM) return true;
    if (item?.isOwner) return true;
    if (actor?.isOwner) return true;

    try {
      return item.testUserPermission(game.user, "OWNER");
    } catch (_err) {
      return false;
    }
  }

  function findHeaderQtyIndex(container) {
    if (!container) return -1;

    const possibleHeaders = container.querySelectorAll(
      "thead tr, .items-header, .item-list-header, .inventory-header, .gear-header, .list-header, header"
    );

    for (const header of possibleHeaders) {
      const children = Array.from(header.children);
      if (!children.length) continue;

      const index = children.findIndex((child) => {
        const text = normalizeText(child.textContent);
        return text === "qty" || text === "quantity";
      });

      if (index >= 0) return index;
    }

    return -1;
  }

  function findQtyCellFromTable(row) {
    const table = row.closest("table");
    if (!table) return null;

    const headerCells = Array.from(table.querySelectorAll("thead th, thead td"));
    const index = headerCells.findIndex((cell) => {
      const text = normalizeText(cell.textContent);
      return text === "qty" || text === "quantity";
    });

    if (index < 0) return null;

    const cells = Array.from(row.children);
    return cells[index] ?? null;
  }

  function findQtyCellFromClasses(row) {
    const selectors = [
      ":scope > .item-quantity",
      ":scope > .quantity",
      ":scope > .qty",
      ":scope > .item-qty",
      ":scope > [data-quantity]",
      ":scope > [data-qty]",
      ":scope > [class*='quantity']",
      ":scope > [class*='qty']"
    ];

    for (const selector of selectors) {
      const cell = row.querySelector(selector);
      if (cell) return cell;
    }

    return null;
  }

  function findQtyCellFromNearbyHeader(row) {
    let container = row.parentElement;

    for (let i = 0; i < 5 && container; i++) {
      const index = findHeaderQtyIndex(container);

      if (index >= 0) {
        const children = Array.from(row.children);
        return children[index] ?? null;
      }

      container = container.parentElement;
    }

    return null;
  }

  function findQtyCell(row) {
    if (!row) return null;

    return (
      findQtyCellFromClasses(row) ||
      findQtyCellFromTable(row) ||
      findQtyCellFromNearbyHeader(row)
    );
  }

  function findItemRow(element) {
    return (
      element.closest("tr") ||
      element.closest("li") ||
      element.closest(".item") ||
      element.closest(".inventory-item") ||
      element.closest(".item-row") ||
      element
    );
  }

  function setQtyControlsDisabled(input, disabled) {
    const wrapper = input.closest(".sdx-qty-wrapper");
    if (!wrapper) {
      input.disabled = disabled;
      return;
    }

    for (const control of wrapper.querySelectorAll("button, input")) {
      control.disabled = disabled;
    }
  }

  async function confirmDeleteAtZero(item) {
    const itemName = escapeHTML(item.name);

    return Dialog.confirm({
      title: "Delete Item?",
      content: `
        <div class="sdx-delete-zero-dialog">
          <p><strong>${itemName}</strong> has reached quantity 0.</p>
          <p>Do you want to delete this item from the character sheet?</p>
        </div>
      `,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
  }

  async function deleteItemFromActor(item, actor) {
    if (!item) return;

    if (actor?.deleteEmbeddedDocuments) {
      await actor.deleteEmbeddedDocuments("Item", [item.id]);
      return;
    }

    await item.delete();
  }

  async function maybeDeleteAtZero(item, actor) {
    if (!item || !actor) return;

    const shouldDelete = await confirmDeleteAtZero(item);

    if (!shouldDelete) return;

    try {
      await deleteItemFromActor(item, actor);
      ui.notifications?.info(`${item.name} deleted.`);
      log(`Deleted ${item.name} because quantity reached 0.`);
    } catch (err) {
      console.error(`${MODULE_ID} | ${FEATURE} | Failed to delete item`, err);
      ui.notifications?.error(`Could not delete ${item.name}.`);
    }
  }

  async function commitQtyValue(item, actor, qtyPath, input, nextValue) {
    if (!item || !qtyPath || !input) return;
    if (input.dataset.sdxCommitting === "true") return;

    const currentValue = toInt(
      input.dataset.sdxCurrentQty ?? getPropertySafe(item, qtyPath),
      1
    );

    nextValue = Math.max(0, toInt(nextValue, currentValue));
    input.value = nextValue;

    if (nextValue === currentValue) {
      if (nextValue === 0) await maybeDeleteAtZero(item, actor);
      return;
    }

    input.dataset.sdxCommitting = "true";
    setQtyControlsDisabled(input, true);

    try {
      await item.update({ [qtyPath]: nextValue });

      input.dataset.sdxCurrentQty = String(nextValue);
      input.value = nextValue;

      log(`Updated ${item.name} qty from ${currentValue} to ${nextValue}`);

      if (nextValue === 0) {
        await maybeDeleteAtZero(item, actor);
      }
    } catch (err) {
      console.error(`${MODULE_ID} | ${FEATURE} | Failed to update quantity`, err);
      ui.notifications?.error(`Could not update quantity for ${item.name}.`);

      input.value = currentValue;
      input.dataset.sdxCurrentQty = String(currentValue);
    } finally {
      input.dataset.sdxCommitting = "false";
      setQtyControlsDisabled(input, false);
    }
  }

  function buildQtyButton(label, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("sdx-qty-button");
    button.textContent = label;
    button.title = title;
    return button;
  }

  function buildQtyInput(item, qtyPath, actor) {
    const currentQty = getQtyValue(item, qtyPath);

    const wrapper = document.createElement("div");
    wrapper.classList.add("sdx-qty-wrapper");

    const minusButton = buildQtyButton("-", "Decrease quantity");

    const input = document.createElement("input");
    input.classList.add("sdx-qty-input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.value = currentQty;
    input.title = "Edit quantity";
    input.dataset.sdxEditableQty = "true";
    input.dataset.sdxCurrentQty = String(currentQty);
    input.dataset.sdxCommitting = "false";

    const plusButton = buildQtyButton("+", "Increase quantity");

    const stop = (event) => {
      event.stopPropagation();
    };

    for (const element of [minusButton, input, plusButton]) {
      element.addEventListener("click", stop);
      element.addEventListener("mousedown", stop);
      element.addEventListener("mouseup", stop);
      element.addEventListener("pointerdown", stop);
      element.addEventListener("dblclick", stop);
    }

    minusButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const currentValue = toInt(input.value, 0);
      const nextValue = Math.max(0, currentValue - 1);

      await commitQtyValue(item, actor, qtyPath, input, nextValue);
    });

    plusButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const currentValue = toInt(input.value, 0);
      const nextValue = currentValue + 1;

      await commitQtyValue(item, actor, qtyPath, input, nextValue);
    });

    input.addEventListener("keydown", async (event) => {
      event.stopPropagation();

      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        input.value = input.dataset.sdxCurrentQty ?? "1";
        input.blur();
      }
    });

    input.addEventListener("change", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      await commitQtyValue(item, actor, qtyPath, input, input.value);
    });

    wrapper.appendChild(minusButton);
    wrapper.appendChild(input);
    wrapper.appendChild(plusButton);

    return wrapper;
  }

  function injectStyles() {
    if (document.getElementById("sdx-editable-qty-styles")) return;

    const style = document.createElement("style");
    style.id = "sdx-editable-qty-styles";
    style.textContent = `
      .sdx-qty-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 2px;
        width: 100%;
      }

      .sdx-qty-button {
        width: 1.15rem;
        min-width: 1.15rem;
        height: 1.15rem;
        padding: 0;
        margin: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: var(--font-size-11, 11px);
        line-height: 1;
        color: inherit;
        background: rgba(255, 255, 255, 0.16);
        border: 1px solid rgba(0, 0, 0, 0.35);
        border-radius: 3px;
        cursor: pointer;
      }

      .sdx-qty-button:hover {
        background: rgba(255, 255, 255, 0.32);
      }

      .sdx-qty-input {
        width: 2.15rem;
        min-width: 2.15rem;
        max-width: 2.15rem;
        height: 1.15rem;
        padding: 0 2px;
        text-align: center;
        font-size: var(--font-size-12, 12px);
        line-height: 1;
        color: inherit;
        background: rgba(255, 255, 255, 0.18);
        border: 1px solid rgba(0, 0, 0, 0.35);
        border-radius: 3px;
      }

      .sdx-qty-input:focus {
        outline: 1px solid rgba(0, 0, 0, 0.65);
        background: rgba(255, 255, 255, 0.35);
      }

      .sdx-qty-button:disabled,
      .sdx-qty-input:disabled {
        opacity: 0.6;
        cursor: default;
      }

      .sdx-qty-input::-webkit-inner-spin-button,
      .sdx-qty-input::-webkit-outer-spin-button {
        opacity: 0.5;
      }

      .sdx-delete-zero-dialog p {
        margin: 0.35rem 0;
      }
    `;

    document.head.appendChild(style);
  }

  function applyEditableQty(app, html) {
    if (!game.settings.get(MODULE_ID, SETTING_ENABLED)) return;

    const root = html?.[0] ?? html;
    if (!(root instanceof HTMLElement)) return;

    const actor = app?.actor ?? app?.object;
    if (!actor || actor.documentName !== "Actor") return;
    if (!actor.items) return;

    injectStyles();

    const elements = Array.from(root.querySelectorAll("[data-item-id]"));
    const processedRows = new WeakSet();

    for (const element of elements) {
      const row = findItemRow(element);
      if (!row || processedRows.has(row)) continue;

      processedRows.add(row);

      const itemId =
        element.dataset.itemId ||
        row.dataset.itemId ||
        row.closest("[data-item-id]")?.dataset.itemId;

      if (!itemId) continue;

      const item = actor.items.get(itemId);
      if (!item) continue;

      if (!userCanEditItem(item, actor)) continue;

      const qtyPath = getQtyPath(item);
      if (!qtyPath) continue;

      const qtyCell = findQtyCell(row);
      if (!qtyCell) continue;

      if (qtyCell.querySelector("[data-sdx-editable-qty='true']")) continue;

      qtyCell.innerHTML = "";
      qtyCell.appendChild(buildQtyInput(item, qtyPath, actor));
    }
  }

  Hooks.once("init", () => {
    log("init (settings registered in settings.js)");
  });

  Hooks.on("renderActorSheet", applyEditableQty);

  Hooks.on("renderApplication", (app, html, data) => {
    if (!app?.actor && app?.object?.documentName !== "Actor") return;
    applyEditableQty(app, html, data);
  });
})();