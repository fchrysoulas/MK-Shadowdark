import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  activeInteractiveControl,
  applicationRoot,
  flushDeferredGmScreenRender,
  mergeDeferredRenderOptions,
  shouldDeferGmScreenRender,
  takeDeferredRenderOptions,
} from "../scripts/gm-screen/interaction-refresh-guard.js";

const runtime = fs.readFileSync(
  new URL("../scripts/gm-screen/interaction-refresh-guard.js", import.meta.url),
  "utf8",
);
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

function fakeControl(tag = "select") {
  return {
    matches(selector) {
      return selector.split(",").some(part => part.trim().startsWith(tag));
    },
  };
}

function fakeApplication(active = null) {
  const root = {
    querySelector() {},
    contains(node) {
      return node === active;
    },
  };
  return {
    rendered: true,
    element: root,
    root,
  };
}

test("GM Screen interaction guard recognizes a focused select inside the application", () => {
  const select = fakeControl("select");
  const application = fakeApplication(select);
  const documentRef = { activeElement: select };

  assert.equal(applicationRoot(application), application.root);
  assert.equal(activeInteractiveControl(application, documentRef), select);
  assert.equal(shouldDeferGmScreenRender(application, documentRef), true);
});

test("GM Screen interaction guard ignores focus outside the application", () => {
  const select = fakeControl("select");
  const application = fakeApplication(null);
  const documentRef = { activeElement: select };

  assert.equal(activeInteractiveControl(application, documentRef), null);
  assert.equal(shouldDeferGmScreenRender(application, documentRef), false);
});

test("deferred GM Screen refresh options coalesce until focus leaves", () => {
  const application = fakeApplication(null);

  mergeDeferredRenderOptions(application, { force: true });
  mergeDeferredRenderOptions(application, { parts: ["main"] });

  assert.deepEqual(takeDeferredRenderOptions(application), {
    force: true,
    parts: ["main"],
  });
  assert.equal(takeDeferredRenderOptions(application), null);
});

test("pending GM Screen refresh flushes once no form control is active", () => {
  const application = fakeApplication(null);
  const calls = [];
  mergeDeferredRenderOptions(application, { force: true });

  const flushed = flushDeferredGmScreenRender(
    application,
    function render(options) {
      calls.push({ self: this, options });
    },
    { activeElement: null },
  );

  assert.equal(flushed, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].self, application);
  assert.deepEqual(calls[0].options, { force: true });
});

test("pending GM Screen refresh remains deferred while a dropdown has focus", () => {
  const select = fakeControl("select");
  const application = fakeApplication(select);
  const calls = [];
  mergeDeferredRenderOptions(application, { force: true });

  const flushed = flushDeferredGmScreenRender(
    application,
    options => calls.push(options),
    { activeElement: select },
  );

  assert.equal(flushed, false);
  assert.equal(calls.length, 0);
  assert.deepEqual(application._mkDeferredInteractiveRenderOptions, { force: true });
});

test("interaction guard loads directly after the GM Screen and before live refresh", () => {
  const gmIndex = manifest.esmodules.indexOf("scripts/gm-screen/gm-screen.js");
  const guardIndex = manifest.esmodules.indexOf("scripts/gm-screen/interaction-refresh-guard.js");
  const refreshIndex = manifest.esmodules.indexOf("scripts/gm-screen/live-refresh.js");

  assert.ok(gmIndex >= 0);
  assert.ok(guardIndex > gmIndex);
  assert.ok(refreshIndex > guardIndex);
});

test("interaction guard protects native selects and flushes on focusout", () => {
  assert.match(runtime, /"select"/);
  assert.match(runtime, /"input"/);
  assert.match(runtime, /"textarea"/);
  assert.match(runtime, /focusout/);
  assert.match(runtime, /shouldDeferGmScreenRender\(this\)/);
  assert.match(runtime, /mergeDeferredRenderOptions\(this, options\)/);
});
