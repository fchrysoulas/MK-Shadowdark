const GM_DIALOG_CLASS = "mk-gm-dialog";

function dialogV2() {
  return globalThis.foundry?.applications?.api?.DialogV2 ?? null;
}

function dialogOptions(config = {}) {
  const {
    title,
    classes = [],
    window = {},
    modal = true,
    ...rest
  } = config;
  const extraClasses = Array.isArray(classes) ? classes : [classes];

  return {
    ...rest,
    classes: [...new Set([GM_DIALOG_CLASS, ...extraClasses.filter(Boolean)])],
    modal,
    window: {
      ...window,
      ...(title && !window.title ? { title } : {}),
    },
  };
}

function notifyUnavailable() {
  globalThis.ui?.notifications?.error?.("Foundry Application V2 dialog support is unavailable.");
}

async function waitForGmDialog(config = {}) {
  const DialogV2 = dialogV2();
  if (typeof DialogV2?.wait !== "function") {
    notifyUnavailable();
    return null;
  }
  return DialogV2.wait(dialogOptions(config));
}

async function confirmGmDialog(config = {}) {
  const DialogV2 = dialogV2();
  if (typeof DialogV2?.confirm !== "function") {
    notifyUnavailable();
    return null;
  }
  return DialogV2.confirm(dialogOptions(config));
}

export {
  GM_DIALOG_CLASS,
  dialogOptions,
  dialogV2,
  waitForGmDialog,
  confirmGmDialog,
};
