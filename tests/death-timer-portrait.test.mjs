import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../scripts/summary-bar/summary-bar.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/\}\)\(\);\s*$/, "globalThis.summaryBarHarness = { buildSummaryChips };})();");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

class Element {
  constructor(tag, classes = "") {
    this.tagName = tag;
    this.className = classes;
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.attributes = {};
    this.clientLeft = this.clientTop = this.scrollLeft = this.scrollTop = 0;
    this.style = { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } };
    this.classList = {
      contains: value => this.className.split(" ").includes(value),
      add: value => { if (!this.classList.contains(value)) this.className += ` ${value}`; },
      remove: value => { this.className = this.className.split(" ").filter(entry => entry !== value).join(" "); },
      toggle: (value, enabled) => { if (enabled) this.classList.add(value); else this.classList.remove(value); }
    };
  }
  set innerHTML(value) { this.html = value; }
  get innerHTML() { return this.html ?? escapeHtml(this.textContent ?? ""); }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  prepend(child) { child.parentElement = this; this.children.unshift(child); }
  remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
  closest() { return null; }
  matches(selector) {
    return selector.split(",").some(part => {
      const simple = part.trim().split(/\s+/).at(-1);
      const [tag, ...classes] = simple.split(".");
      return (!tag || tag === this.tagName) && classes.every(value => this.classList.contains(value));
    });
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getBoundingClientRect() { return this.rect; }
}

function rectangle(left, top, width, height) { return { left, top, width, height, right: left + width, bottom: top + height }; }

function fixture({ dashboard = false, bar = true, hp = 0, state = { dead: false, turns: 3 } } = {}) {
  const root = new Element("form", "shadowdark sheet player");
  const host = new Element(dashboard ? "div" : "header", dashboard ? "mk-dashboard-portrait-frame" : "SD-header");
  const portrait = new Element("img", dashboard ? "mk-dashboard-portrait" : "portrait");
  host.rect = rectangle(100, 200, 600, 130);
  portrait.rect = rectangle(102, 210, 110, 110);
  host.append(portrait);
  root.append(host);
  const settings = {
    characterSheetTweaksSummaryBar: bar, deathTimerEnabled: true, deathTimerIcon: "fa-solid fa-skull",
    characterSheetTweaksBarElements: "HP,DT", summaryBarDebug: false
  };
  const actor = {
    documentName: "Actor", type: "Player", isOwner: true, id: "hero", name: "Hero",
    system: { attributes: { hp: { value: hp, max: 10 } } }, getFlag: () => false
  };
  let render;
  const activated = [];
  const context = {
    console, document: { createElement: tag => new Element(tag) },
    Hooks: { once() {} },
    onCharacterSheetRender: (_name, callback) => { render = callback; },
    game: { system: { id: "shadowdark" }, user: { isGM: false }, settings: { get: (_scope, key) => settings[key] } },
    foundry: { utils: { getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object) } },
    MKShadowdarkDeathTimer: { getState: () => state, activate: async actor => activated.push(actor) }
  };
  vm.runInNewContext(source, context);
  return {
    root, host, portrait, actor, settings, state, context, activated,
    render: () => render({ actor, element: root }, root, {}),
    control: () => root.querySelector(".mk-death-timer-portrait")
  };
}

test("the Death Timer is clickable on the portrait, while legacy DT entries never appear in the bar", async () => {
  const f = fixture();
  f.render();
  const control = f.control();
  assert.equal(control.parentElement, f.host);
  assert.equal(control.style.left, "57px");
  assert.equal(control.style.top, "65px");
  assert.equal(control.attributes["aria-label"], "Death Timer: 3 turn(s) remaining");
  assert.match(control.innerHTML, /fa-solid fa-skull/);
  assert.match(control.innerHTML, /<span>3<\/span>/);
  let prevented = false;
  let stopped = false;
  await control.listeners.click({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.equal(prevented && stopped, true);
  assert.equal(f.activated[0], f.actor);
  const chips = f.context.summaryBarHarness.buildSummaryChips(f.actor, {});
  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, "HP");
  assert.equal(chips[0].value, "0/10");
  assert.doesNotMatch(f.root.querySelector(".mk-character-sheet-bar").innerHTML, /death-timer|>DT</);
});

test("portrait controls stay independent of Summary Bar visibility and are replaced on rerenders", () => {
  const f = fixture({ bar: false });
  f.render();
  f.state.turns = 2;
  f.render();
  assert.equal(f.root.querySelectorAll(".mk-death-timer-portrait").length, 1);
  assert.match(f.control().innerHTML, /<span>2<\/span>/);
  assert.equal(f.root.querySelector(".mk-character-sheet-bar"), null);
  f.actor.system.attributes.hp.value = 1;
  f.render();
  assert.equal(f.control(), null);
  assert.equal(f.host.classList.contains("mk-death-timer-portrait-host"), false);
});

test("the portrait control is positioned after the Summary Bar establishes the final header layout", () => {
  const f = fixture();
  f.host.getBoundingClientRect = () => rectangle(100, 200, 600, f.root.classList.contains("mk-summary-bar-in-header") ? 130 : 110);
  f.portrait.getBoundingClientRect = () => rectangle(102, f.root.classList.contains("mk-summary-bar-in-header") ? 210 : 200, 110, 110);
  f.render();
  assert.equal(f.control().style.top, "65px");
  f.render();
  assert.equal(f.control().style.top, "65px");
});

test("cropping either side of a bust preserves the portrait's horizontal center", () => {
  for (const [imageLeft, expectedLeft] of [[-10, "55px"], [480, "545px"]]) {
    const f = fixture({ bar: false });
    f.portrait.rect = rectangle(imageLeft, 150, 330, 330);
    f.render();
    assert.equal(f.control().style.left, expectedLeft);
    assert.equal(f.control().style.top, "65px");
  }
});

test("Dashboard portraits stay centered even when their overview tab is hidden during a render", () => {
  const f = fixture({ dashboard: true, bar: false });
  f.host.rect = f.portrait.rect = rectangle(0, 0, 0, 0);
  f.render();
  assert.equal(f.control().parentElement, f.host);
  assert.equal(f.control().style.left, "50%");
  assert.equal(f.control().style.top, "50%");
});

test("Dead and observer portraits remain readable without enabling the death-check action", () => {
  const f = fixture({ bar: false, state: { dead: true, turns: null } });
  f.render();
  assert.equal(f.control().disabled, true);
  assert.match(f.control().innerHTML, /<span>Dead<\/span>/);
  f.state.dead = false;
  f.actor.isOwner = false;
  f.render();
  assert.equal(f.control().disabled, true);
  assert.match(f.control().innerHTML, /<span>-<\/span>/);
});

test("the feature setting, actor type and group exclusion control whether a portrait control appears", () => {
  for (const change of [
    f => { f.settings.deathTimerEnabled = false; },
    f => { f.actor.type = "NPC"; },
    f => { f.actor.getFlag = () => true; },
    f => { f.actor.system.attributes.hp.value = 4; }
  ]) {
    const f = fixture({ bar: false });
    change(f);
    f.render();
    assert.equal(f.control(), null);
  }
});
