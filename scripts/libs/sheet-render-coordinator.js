class SheetRenderCoordinator {
  constructor({ schedule, onError } = {}) {
    this._schedule = schedule ?? (callback => setTimeout(callback, 0));
    this._onError = onError ?? (() => {});
    this._callbacks = [];
    this._pending = new WeakMap();
    this._registrationOrder = 0;
  }

  register(name, callback, { priority = 0 } = {}) {
    if (typeof callback !== "function") {
      throw new TypeError("Sheet render callback must be a function.");
    }

    const entry = {
      name: String(name || "anonymous"),
      callback,
      priority: Number(priority) || 0,
      order: this._registrationOrder++
    };

    this._callbacks.push(entry);
    this._callbacks.sort((left, right) =>
      left.priority - right.priority || left.order - right.order
    );

    return () => {
      const index = this._callbacks.indexOf(entry);
      if (index >= 0) this._callbacks.splice(index, 1);
    };
  }

  queue(app, html, data, hookName = "") {
    if (!app || (typeof app !== "object" && typeof app !== "function")) return false;

    const existing = this._pending.get(app);
    if (existing) {
      if (html !== undefined && html !== null) existing.html = html;
      if (data !== undefined) existing.data = data;
      existing.hookName = hookName || existing.hookName;
      return false;
    }

    const pending = {
      app,
      html,
      data,
      hookName,
      scheduled: true
    };
    this._pending.set(app, pending);

    this._schedule(() => this.flush(app));
    return true;
  }

  flush(app) {
    const pending = this._pending.get(app);
    if (!pending) return false;
    this._pending.delete(app);

    for (const entry of [...this._callbacks]) {
      try {
        entry.callback(pending.app, pending.html, pending.data, {
          hookName: pending.hookName
        });
      } catch (error) {
        this._onError(error, entry, pending);
      }
    }

    return true;
  }
}

export { SheetRenderCoordinator };
