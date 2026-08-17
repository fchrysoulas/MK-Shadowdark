import test from "node:test";
import assert from "node:assert/strict";

import { SheetRenderCoordinator } from "../scripts/libs/sheet-render-coordinator.js";

function makeScheduler() {
  const jobs = [];
  return {
    jobs,
    schedule(callback) {
      jobs.push(callback);
      return jobs.length;
    },
    runNext() {
      jobs.shift()?.();
    }
  };
}

test("multiple alias events for one sheet coalesce into one callback cycle", () => {
  const scheduler = makeScheduler();
  const calls = [];
  const coordinator = new SheetRenderCoordinator({ schedule: callback => scheduler.schedule(callback) });
  const app = {};

  coordinator.register("feature", (receivedApp, html, data, meta) => {
    calls.push({ receivedApp, html, data, meta });
  });

  assert.equal(coordinator.queue(app, "first", { version: 1 }, "renderActorSheet"), true);
  assert.equal(coordinator.queue(app, "latest", { version: 2 }, "renderPlayerSheetSD"), false);
  assert.equal(scheduler.jobs.length, 1);

  scheduler.runNext();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].receivedApp, app);
  assert.equal(calls[0].html, "latest");
  assert.deepEqual(calls[0].data, { version: 2 });
  assert.equal(calls[0].meta.hookName, "renderPlayerSheetSD");
});

test("different sheet applications receive independent render cycles", () => {
  const scheduler = makeScheduler();
  const calls = [];
  const coordinator = new SheetRenderCoordinator({ schedule: callback => scheduler.schedule(callback) });
  const first = {};
  const second = {};

  coordinator.register("feature", app => calls.push(app));
  coordinator.queue(first, null, null, "one");
  coordinator.queue(second, null, null, "two");

  assert.equal(scheduler.jobs.length, 2);
  scheduler.runNext();
  scheduler.runNext();
  assert.deepEqual(calls, [first, second]);
});

test("callback priority is deterministic and errors do not block later features", () => {
  const scheduler = makeScheduler();
  const order = [];
  const errors = [];
  const coordinator = new SheetRenderCoordinator({
    schedule: callback => scheduler.schedule(callback),
    onError: (error, entry) => errors.push({ error, name: entry.name })
  });

  coordinator.register("late", () => order.push("late"), { priority: 30 });
  coordinator.register("broken", () => {
    order.push("broken");
    throw new Error("boom");
  }, { priority: 20 });
  coordinator.register("early", () => order.push("early"), { priority: 10 });

  coordinator.queue({}, null, null, "renderActorSheet");
  scheduler.runNext();

  assert.deepEqual(order, ["early", "broken", "late"]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].name, "broken");
  assert.equal(errors[0].error.message, "boom");
});

test("unregister removes a feature callback", () => {
  const scheduler = makeScheduler();
  let calls = 0;
  const coordinator = new SheetRenderCoordinator({ schedule: callback => scheduler.schedule(callback) });
  const unregister = coordinator.register("feature", () => { calls += 1; });

  unregister();
  coordinator.queue({}, null, null, "renderActorSheet");
  scheduler.runNext();

  assert.equal(calls, 0);
});
