import { AsyncLocalStorage } from "node:async_hooks";
import { handleStoredInventoryRequest, receiveStoredInventoryResult } from "../../scripts/libs/stored-inventory-service.js";

let sequence = 0;

// Represent independent player/GM clients without changing the user in another async operation.
export function installStoredInventoryTransport() {
  const session = globalThis.game;
  const contexts = new AsyncLocalStorage();
  let current = session.user;
  current.active = true;
  const gm = { id: "active-gm", isGM: true, active: true };
  const users = [current, gm];
  users.get = id => users.find(user => user.id === id);
  session.users = users;
  Object.defineProperty(session, "user", {
    configurable: true,
    get: () => contexts.getStore() ?? current,
    set: user => { current = user; },
  });
  const messages = [];
  globalThis.ChatMessage = {
    async create(data) {
      const author = session.user;
      const message = {
        id: `storage-request-${++sequence}`, timestamp: Date.now(), author,
        flags: structuredClone(data.flags),
        getFlag(scope, key) { return this.flags[scope]?.[key]; },
        async update(changes) {
          this.flags["mk-shadowdark"].storedInventoryTransfer = changes["flags.mk-shadowdark.storedInventoryTransfer"];
          contexts.run(author, () => receiveStoredInventoryResult(this, changes, {}, gm.id));
        },
      };
      messages.push(message);
      queueMicrotask(() => {
        void contexts.run(gm, () => handleStoredInventoryRequest(message));
      });
      return message;
    },
  };
  return { gm, users, messages, runAs: (user, operation) => contexts.run(user, operation) };
}
