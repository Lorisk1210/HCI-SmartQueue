type EmailStore = {
  uidToEmail: Map<string, string>;
  lastNotifiedAt: Map<string, number>;
};

declare global {
  // eslint-disable-next-line no-var
  var __notifyStore: EmailStore | undefined;
}

function createStore(): EmailStore {
  return {
    uidToEmail: new Map<string, string>(),
    lastNotifiedAt: new Map<string, number>(),
  };
}

export function getNotifyStore(): EmailStore {
  if (!globalThis.__notifyStore) {
    globalThis.__notifyStore = createStore();
  }
  return globalThis.__notifyStore;
}


