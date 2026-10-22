import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const sourceUrl = new URL("../scripts/quickdraw/quickdraw-icons.js", import.meta.url);

test("Quickdraw relies on the manifest for its stylesheet", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.doesNotMatch(source, /ensureStylesheet/);
  assert.doesNotMatch(source, /STYLESHEET_PATH/);
  assert.doesNotMatch(source, /createElement\(["']link["']\)/);
});

test("Quickdraw collects inventory rows once per logical render", async () => {
  const source = (await readFile(sourceUrl, "utf8")).replace(/\r\n/g, "\n");
  const processBlock = source.match(/function processSheet\(app, html\) \{([\s\S]*?)\n  \}\n\n  function onRender/);

  assert.ok(processBlock, "processSheet block must exist");
  const calls = processBlock[1].match(/getInventoryRows\(html\)/g) ?? [];
  assert.equal(calls.length, 1);
  assert.match(processBlock[1], /refreshQuickdrawRowState\(app, rows\)/);
  assert.match(processBlock[1], /injectQuickdrawToggles\(app, html, rows\)/);
  assert.match(processBlock[1], /sortInventoryGroups\(html, app, rows\)/);
});

test("Quickdraw sorting skips DOM mutation when order is already correct", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const orderChanged = sorted\.some/);
  assert.match(source, /if \(!orderChanged\) continue;/);
});

async function renderFixture() {
  const source = (await readFile(sourceUrl, "utf8")).replace(/^import .*\r?\n/gm, "");
  const queries = [];
  const node = (classes, attributes = {}) => ({ classes: new Set(classes.split(" ")), attributes, removed: false });
  const nodes = {
    root: node("app mk-highlight-equipped"),
    list: node("mk-has-quickdraw-column"),
    toggle: node("mk-quickdraw-toggle"),
    controls: node("mk-has-quickdraw-toggle"),
    row: node("mk-quickdraw-item mk-quickdraw-active", { "data-mk-quickdraw": "true" }),
    card: node("mk-quickdraw-card"),
  };
  class Collection {
    constructor(elements = []) { this.elements = elements; this.length = elements.length; this.jquery = true; }
    find(selector) {
      queries.push(selector);
      const matches = selector === "ol.SD-list.item-list, ul.SD-list.item-list" ? [nodes.list]
        : Object.values(nodes).filter(element => selector.split(",").some(part => {
          const value = part.trim();
          if (value.startsWith(".")) return value.slice(1).split(".").every(name => element.classes.has(name));
          return value === "[data-mk-quickdraw]" && Object.hasOwn(element.attributes, "data-mk-quickdraw");
        }));
      return new Collection(matches);
    }
    first() { return new Collection(this.elements.slice(0, 1)); }
    filter(callback) { return new Collection(this.elements.filter((element, index) => callback(index, element))); }
    closest() { return new Collection([nodes.root]); }
    add(other) { return new Collection([...new Set([...this.elements, ...other.elements])]); }
    remove() { this.elements.forEach(element => { element.removed = true; }); return this; }
    removeAttr(name) { this.elements.forEach(element => { delete element.attributes[name]; }); return this; }
    removeClass(names) {
      for (const element of this.elements) for (const name of names.split(" ")) element.classes.delete(name);
      return this;
    }
    toggleClass(name, active) {
      this.elements.forEach(element => active ? element.classes.add(name) : element.classes.delete(name));
      return this;
    }
  }
  let render;
  vm.runInNewContext(source, {
    console,
    Hooks: { once() {} },
    game: { system: { id: "shadowdark" }, settings: { get: (_module, key) => key !== "debug" } },
    onCharacterSheetRender(name, callback) { assert.equal(name, "Quickdraw"); render = callback; },
    $: value => value instanceof Collection ? value : new Collection(),
  });
  return { nodes, queries, render, html: new Collection([nodes.root]) };
}

test("Group actor renders remove stale Quickdraw controls without scanning inventory or changing flags", async () => {
  for (const group of [
    { getFlag(module, key) { assert.equal(module, "mk-shadowdark"); assert.equal(key, "isGroup"); return true; } },
    { flags: { "mk-shadowdark": { isGroup: true } } },
  ]) {
    const f = await renderFixture();
    f.render({ actor: {
      type: "Player", ...group,
      update() { assert.fail("Rendering must not mutate the group"); },
      setFlag() { assert.fail("Existing item flags must remain intact"); },
    } }, f.html);
    assert.equal(f.nodes.toggle.removed, true);
    assert.equal(f.nodes.card.removed, true);
    assert.equal(f.nodes.list.classes.has("mk-has-quickdraw-column"), false);
    assert.equal(f.nodes.controls.classes.has("mk-has-quickdraw-toggle"), false);
    assert.equal(f.nodes.row.classes.has("mk-quickdraw-item"), false);
    assert.equal(f.nodes.row.classes.has("mk-quickdraw-active"), false);
    assert.equal(Object.hasOwn(f.nodes.row.attributes, "data-mk-quickdraw"), false);
    assert.equal(f.nodes.root.classes.has("mk-highlight-equipped"), false);
    assert.equal(f.queries.some(selector => selector.includes("tab-inventory")), false);
  }
});

test("ordinary Player actors still enter the Quickdraw inventory rendering pipeline", async () => {
  const f = await renderFixture();
  f.render({ actor: { type: "Player", getFlag: () => false } }, f.html);
  assert.equal(f.queries.some(selector => selector.includes("tab-inventory")), true);
  assert.equal(f.nodes.toggle.removed, false);
  assert.equal(f.nodes.root.classes.has("mk-highlight-equipped"), true);
});
