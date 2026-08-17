const TIME_PASSES_SPLASH_EVENT = "timePassesSplash";

function createTimePassesSplashEvent(payload, senderId = null) {
  return {
    type: TIME_PASSES_SPLASH_EVENT,
    payload: payload && typeof payload === "object" ? payload : {},
    senderId: senderId ?? null
  };
}

function isTimePassesSplashEvent(event) {
  return Boolean(
    event
      && event.type === TIME_PASSES_SPLASH_EVENT
      && event.payload
      && typeof event.payload === "object"
      && !Array.isArray(event.payload)
  );
}

export {
  TIME_PASSES_SPLASH_EVENT,
  createTimePassesSplashEvent,
  isTimePassesSplashEvent
};
