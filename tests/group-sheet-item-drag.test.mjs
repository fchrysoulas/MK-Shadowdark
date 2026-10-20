import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

class NativeSheet {
  constructor(actor) {
    this.actor = actor;
    this.isEditable = false;
  }
  static get defaultOptions() { return {}; }
  _canDragStart() { return this.isEditable; }
  _canDragDrop() { return this.isEditable; }
  _onDragStart() {}
  _disableFields(form) {
    form.controls.forEach(control => { control.disabled = true; });
  }
}

globalThis.foundry = {
  appv1: { sheets: { ActorSheet: NativeSheet } },
  applications: { ux: { TextEditor: { implementation: { getDragEventData: event => event.data } } } },
  utils: { mergeObject: (base, overrides) => ({ ...base, ...overrides }) },
};
const { MKGroupSheet } = await import("../scripts/group-sheet/sheet.js");
const itemSelector = ".mk-shared-item-row[data-item-id]";

test("shared item rows are configured as Item drag sources", () => {
  const [handler] = MKGroupSheet.defaultOptions.dragDrop;
  assert.equal(handler.dragSelector, itemSelector);
  assert.equal(handler.dropSelector, ".mk-group-sheet");

  const template = readFileSync(new URL("../templates/group-sheet.hbs", import.meta.url), "utf8");
  assert.match(template, /class="mk-shared-item-row" data-item-id="{{id}}"/);
  assert.match(template, /<img[^>]+data-action="open-item"[^>]+draggable="false"/);
});

test("shared Item drags carry a namespaced move request and native Item UUID", () => {
  globalThis.game = { user: { isGM: false } };
  const item = {
    id: "gear", uuid: "Actor.group.Item.gear",
    toDragData: () => ({ type: "Item", uuid: "Actor.group.Item.gear" }),
  };
  const sheet = new MKGroupSheet({
    uuid: "Actor.group", items: new Map([[item.id, item]]), testUserPermission: () => true,
  });
  const payloads = new Map();
  const dataTransfer = { setData: (type, value) => payloads.set(type, value) };
  sheet._onDragStart({ currentTarget: { dataset: { itemId: "gear" } }, dataTransfer });
  assert.equal(dataTransfer.effectAllowed, "move");
  assert.equal(payloads.get("text/plain"), payloads.get("application/json"));
  assert.deepEqual(JSON.parse(payloads.get("text/plain")), {
    type: "Item", uuid: item.uuid,
    "mk-shadowdark": { groupInventoryTransfer: { sourceActorUuid: "Actor.group", sourceItemId: "gear" } },
  });
});

test("stale shared Item rows cannot start a browser image drag", () => {
  globalThis.game = { user: { isGM: true } };
  let prevented = false;
  const sheet = new MKGroupSheet({ items: new Map() });
  sheet._onDragStart({
    currentTarget: { dataset: { itemId: "missing" } }, preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
});

test("observers and owners can drag shared Items without gaining group editing permission", () => {
  for (const ownership of [2, 3]) {
    const user = { id: "player", isGM: false };
    globalThis.game = { user };
    const sheet = new MKGroupSheet({
      testUserPermission(requestingUser, level) {
        assert.equal(requestingUser, user);
        assert.equal(level, "OBSERVER");
        return ownership >= 2;
      },
    });
    assert.equal(sheet._canDragStart(itemSelector), true);
    assert.equal(sheet._canDragDrop(".mk-group-sheet"), false);
    assert.equal(sheet._canDragStart(".mk-group-member"), false);
  }
});

test("shared Item dragging excludes limited or inaccessible groups and missing users", () => {
  globalThis.game = { user: { id: "player", isGM: false } };
  for (const ownership of [0, 1]) {
    const sheet = new MKGroupSheet({ testUserPermission: () => ownership >= 2 });
    assert.equal(sheet._canDragStart(itemSelector), false);
  }
  globalThis.game = {};
  assert.equal(new MKGroupSheet({})._canDragStart(itemSelector), false);
});

test("GMs can drag shared Items and other drag selectors retain native permissions", () => {
  globalThis.game = { user: { isGM: true } };
  const sheet = new MKGroupSheet({});
  assert.equal(sheet._canDragStart(itemSelector), true);
  sheet.isEditable = true;
  assert.equal(sheet._canDragStart(".mk-group-member"), true);
});

test("read-only shared Item names stay interactive while quantities and treasure remain disabled", () => {
  const makeControl = () => ({
    disabled: false,
    removeAttribute(name) { assert.equal(name, "disabled"); },
  });
  const name = makeControl();
  const quantity = makeControl();
  const treasure = makeControl();
  const form = {
    controls: [name, quantity, treasure],
    querySelectorAll(selector) {
      return selector.includes(".mk-shared-item-row [data-action='open-item']") ? [name] : [];
    },
  };
  new MKGroupSheet({})._disableFields(form);
  assert.equal(name.disabled, false);
  assert.equal(quantity.disabled, true);
  assert.equal(treasure.disabled, true);
});

test("dropping a shared Item back onto its group does not duplicate it", async () => {
  const actor = {
    uuid: "Actor.group",
    createEmbeddedDocuments() { assert.fail("Self-drops must not create an Item"); },
  };
  const item = {
    parent: actor,
    toObject() { assert.fail("Self-drops must not copy Item data"); },
  };
  await new MKGroupSheet(actor)._addItemToGroup(item);
});

test("dropping a shared-item transfer onto any Group Sheet leaves it in its source inventory", async () => {
  const sheet = new MKGroupSheet({});
  sheet._addItemToGroup = () => assert.fail("Group transfers must not be copied into another group");
  const result = await sheet._onDrop({
    preventDefault() {}, target: { closest: () => null },
    data: {
      type: "Item", uuid: "Actor.source.Item.gear",
      "mk-shadowdark": { groupInventoryTransfer: { sourceActorUuid: "Actor.source", sourceItemId: "gear" } },
    },
  });
  assert.equal(result, false);
});
