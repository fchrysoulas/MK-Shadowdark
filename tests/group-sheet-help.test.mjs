import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CAMPING_ACTIVITIES, TRAVEL_ACTIVITIES } from "../scripts/group-sheet/constants.js";

const translations = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const prefix = "MK_SHADOWDARK.groupSheet.help";

class NativeSheet {
  constructor(actor) { this.actor = actor; this.isEditable = false; }
  _disableFields(form) { form.controls.forEach(control => { control.disabled = true; }); }
}

class HelpDialog {
  constructor(options) { this.options = options; }
  render(force) { assert.equal(force, true); return this; }
}

globalThis.foundry = {
  appv1: { sheets: { ActorSheet: NativeSheet } },
  applications: { api: { DialogV2: HelpDialog } },
};
globalThis.game = { user: { isGM: false }, i18n: { localize: key => translations[key] ?? key } };
globalThis.document = {
  createElement: () => ({
    set textContent(value) {
      this.innerHTML = String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    },
  }),
};

const { MKGroupSheet } = await import("../scripts/group-sheet/sheet.js");

test("read-only players can open every section's localized rules without changing group data", () => {
  const sheet = new MKGroupSheet({
    update() { assert.fail("Help must not update the group"); },
    setFlag() { assert.fail("Help must not update group flags"); },
  });
  const sections = Object.keys(translations).flatMap(key => (
    key.startsWith(`${prefix}.`) && key.endsWith(".body") ? [key.slice(prefix.length + 1, -5)] : []
  ));
  assert.equal(sections.length, 13);
  for (const section of sections) {
    const dialog = sheet._showSectionHelp(section);
    assert.equal(dialog.options.window.title, translations[`${prefix}.${section}.title`]);
    assert.ok(dialog.options.content.includes(translations[`${prefix}.${section}.body`]));
    assert.deepEqual(dialog.options.buttons.map(button => button.action), ["close"]);
  }
});

test("Mounts help retains the initiative, movement, carrying and ration rules after removing the inline panel", () => {
  const dialog = new MKGroupSheet({})._showSectionHelp("mounts");
  for (const rule of [
    "acts on the rider's initiative", "entire movement", "5 ×", "use 10 slots", "1 ration each day",
  ]) assert.ok(dialog.options.content.includes(rule), rule);
  const template = readFileSync(new URL("../templates/group-sheet.hbs", import.meta.url), "utf8");
  assert.doesNotMatch(template, /class="mk-mount-rules"/);
  assert.match(template, /data-help-section="mounts"/);
});

test("activity help uses the same tasks, abilities, DCs and descriptions as the activity cards", () => {
  for (const [section, activities] of [["traveling", TRAVEL_ACTIVITIES], ["camping", CAMPING_ACTIVITIES]]) {
    const { content } = new MKGroupSheet({})._showSectionHelp(section).options;
    assert.equal((content.match(/<dt>/g) ?? []).length, activities.length);
    for (const activity of activities) {
      assert.ok(content.includes(activity.name));
      assert.ok(content.includes(`${activity.abilityLabel} · DC ${activity.dc}`));
      assert.ok(content.includes(activity.description));
    }
  }
});

test("unknown help topics cannot open arbitrary content", () => {
  const sheet = new MKGroupSheet({});
  for (const section of [undefined, "__proto__", "unknown", "<script>", {}]) {
    assert.equal(sheet._showSectionHelp(section), null);
  }
});

test("read-only sheets enable help buttons while preserving disabled editing controls", () => {
  const makeControl = () => ({ disabled: false, removeAttribute() {} });
  const help = makeControl();
  const quantity = makeControl();
  const form = {
    controls: [help, quantity],
    querySelectorAll(selector) { return selector.includes("[data-action='section-help']") ? [help] : []; },
  };
  new MKGroupSheet({})._disableFields(form);
  assert.equal(help.disabled, false);
  assert.equal(quantity.disabled, true);
});
