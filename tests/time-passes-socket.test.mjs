import test from "node:test";
import assert from "node:assert/strict";

import {
  TIME_PASSES_SPLASH_EVENT,
  createTimePassesSplashEvent,
  isTimePassesSplashEvent
} from "../scripts/time-passes-socket.js";

test("creates a typed Time Passes splash event", () => {
  const payload = { title: "time passes...", durationMs: 2000 };
  const event = createTimePassesSplashEvent(payload, "gm-user");

  assert.deepEqual(event, {
    type: TIME_PASSES_SPLASH_EVENT,
    payload,
    senderId: "gm-user"
  });
});

test("normalizes missing payload and sender", () => {
  assert.deepEqual(createTimePassesSplashEvent(), {
    type: TIME_PASSES_SPLASH_EVENT,
    payload: {},
    senderId: null
  });
});

test("recognizes only valid Time Passes splash events", () => {
  assert.equal(isTimePassesSplashEvent({
    type: TIME_PASSES_SPLASH_EVENT,
    payload: { title: "Encounter" }
  }), true);

  assert.equal(isTimePassesSplashEvent({ type: "other", payload: {} }), false);
  assert.equal(isTimePassesSplashEvent({ type: TIME_PASSES_SPLASH_EVENT }), false);
  assert.equal(isTimePassesSplashEvent({ type: TIME_PASSES_SPLASH_EVENT, payload: [] }), false);
  assert.equal(isTimePassesSplashEvent(null), false);
});
