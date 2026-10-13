import test from "node:test";
import assert from "node:assert/strict";
import { changesDtp, getDtp, guardDtpUpdate, renderDtp, saveDtp } from "../scripts/dtp/dtp.js";

function actorWithDtp(value, type = "Player") {
  return {
    type,
    flags: { "mk-shadowdark": { dtp: value } },
    writes: [],
    async setFlag(scope, key, value) {
      this.writes.push({ scope, key, value });
      this.flags[scope][key] = value;
    }
  };
}

function setUser(isGM) {
  globalThis.game = { system: { id: "shadowdark" }, user: { isGM } };
}

class Element {
  constructor(tag, document) {
    this.tagName = tag;
    this.ownerDocument = document;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.attributes = {};
    this.validity = { valid: true };
  }
  append(...children) { this.children.push(...children); }
  insertBefore(child, before) { this.children.splice(this.children.indexOf(before), 0, child); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector === "input" && child.tagName === "input") return child;
      if (selector.startsWith(".") && child.className?.split(" ").includes(selector.slice(1))) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
}

function nativeDetails({ patron = false, observer = false } = {}) {
  const document = { createElement: tag => new Element(tag, document) };
  const grid = new Element("div", document);
  const languages = new Element("div", document);
  languages.style.gridColumn = `span ${patron ? 2 : 3}`;
  languages.querySelector = selector => selector.includes(".tags") ? {} : null;
  grid.append(languages);
  if (patron) grid.append(new Element("div", document));
  return {
    grid, languages,
    app: { actor: actorWithDtp(7), isEditable: !observer },
    root: { querySelector: selector => selector === ".tab-details .background-grid-a" ? grid : null }
  };
}

test("DTP defaults to zero and reads the actor's module flag", () => {
  assert.equal(getDtp(actorWithDtp(undefined)), 0);
  assert.equal(getDtp(actorWithDtp(12)), 12);
  assert.equal(getDtp({ getFlag: () => 8 }), 8);
  for (const value of [-5, "invalid", Infinity]) assert.equal(getDtp(actorWithDtp(value)), 0);
});

test("only GMs can save nonnegative whole DTP values on Player actors", async () => {
  const actor = actorWithDtp(0);
  setUser(false);
  assert.equal(await saveDtp(actor, 20), false);
  assert.equal(actor.writes.length, 0);
  setUser(true);
  for (const value of [-1, 2.5, Infinity, "invalid"]) assert.equal(await saveDtp(actor, value), false);
  assert.equal(await saveDtp(actorWithDtp(0, "NPC"), 5), false);
  assert.equal(await saveDtp(actor, "20"), true);
  assert.deepEqual(actor.writes, [{ scope: "mk-shadowdark", key: "dtp", value: 20 }]);
  assert.equal(getDtp(actor), 20);
});

test("player DTP writes and removals are blocked while ordinary actor updates remain allowed", () => {
  const actor = actorWithDtp(10);
  setUser(false);
  const changes = [
    { "flags.mk-shadowdark.dtp": 100 },
    { flags: { "mk-shadowdark": { dtp: 100 } } },
    { "flags.mk-shadowdark": { dtp: 100 } },
    { "flags.mk-shadowdark.-=dtp": null },
    { flags: { "mk-shadowdark": { "-=dtp": null } } },
    { flags: { "-=mk-shadowdark": null } },
    { "-=flags": null }
  ];
  for (const change of changes) {
    assert.equal(guardDtpUpdate(actor, change), false);
    setUser(true);
    assert.notEqual(guardDtpUpdate(actor, change), false);
    setUser(false);
  }
  assert.equal(guardDtpUpdate(actor, { flags: { "mk-shadowdark": { quickSlots: [] } } }), undefined);
  assert.equal(guardDtpUpdate(actor, { "system.attributes.hp.value": 3 }), undefined);
  assert.equal(changesDtp({ flags: { "mk-shadowdark": {} } }, { recursive: false }), true);
  assert.equal(guardDtpUpdate(actorWithDtp(0, "NPC"), changes[0]), undefined);
});

test("DTP appears once before Languages and saves GM edits independently of the native form", async () => {
  setUser(true);
  const { grid, languages, app, root } = nativeDetails();
  renderDtp(app, root);
  renderDtp(app, [root]);
  assert.equal(grid.children.length, 2);
  assert.equal(grid.children[1], languages);
  assert.equal(languages.style.gridColumn, "span 2");
  const input = grid.children[0].querySelector("input");
  assert.equal(input.value, "7");
  assert.equal(input.readOnly, false);
  assert.equal(input.name, undefined);
  assert.equal(input.attributes["aria-label"], "DTP");
  input.value = "12";
  let stopped = false;
  await input.listeners.change({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(getDtp(app.actor), 12);
  input.value = "-3";
  input.validity.valid = false;
  await input.listeners.change({ stopPropagation() {} });
  assert.equal(input.value, "12");
  assert.equal(app.actor.writes.length, 1);
});

test("players and observers see locked DTP while Patron stays on the Languages row", async () => {
  setUser(false);
  const { grid, languages, app, root } = nativeDetails({ patron: true, observer: true });
  renderDtp(app, root);
  renderDtp(app, root);
  assert.equal(grid.children.length, 3);
  assert.equal(languages.style.gridColumn, "span 1");
  const input = grid.children[0].querySelector("input");
  assert.equal(input.value, "7");
  assert.equal(input.readOnly, true);
  input.value = "99";
  await input.listeners.change({ stopPropagation() {} });
  assert.equal(input.value, "7");
  assert.equal(app.actor.writes.length, 0);
});

test("DTP is omitted from NPC sheets and sheets without native Details", () => {
  setUser(true);
  const { grid, app, root } = nativeDetails();
  app.actor.type = "NPC";
  renderDtp(app, root);
  assert.equal(grid.children.length, 1);
  app.actor.type = "Player";
  renderDtp(app, { querySelector: () => null });
  assert.equal(grid.children.length, 1);
});
