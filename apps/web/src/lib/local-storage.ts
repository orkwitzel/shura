import type { Storage, StoredKind } from '@shura/client-core';

/** The `localStorage` key each stored kind lives under. */
export const STORAGE_KEYS: Readonly<Record<StoredKind, string>> = {
  settings: 'shura.settings',
  records: 'shura.records',
};

const where = (key: string) => `localStorage["${key}"]`;

/**
 * Settings and records in two `localStorage` keys (design §13.1, Storage; §13.2). Each write
 * replaces a key's text all at once. Text set aside goes to a backup key beside it
 * (`shura.records.bak`, then `.bak-2` and so on), never over an older backup, so nothing is
 * dropped. `localStorage` is looked up on each call, since a browser that blocks it throws on
 * access: the stores turn that into a message.
 */
export function createLocalStorage(): Storage {
  return {
    read: (kind) => localStorage.getItem(STORAGE_KEYS[kind]),
    write: (kind, text) => localStorage.setItem(STORAGE_KEYS[kind], text),
    setAside(kind) {
      const key = STORAGE_KEYS[kind];
      const text = localStorage.getItem(key);
      let aside = `${key}.bak`;
      for (let n = 2; localStorage.getItem(aside) !== null; n++) aside = `${key}.bak-${n}`;
      if (text !== null) localStorage.setItem(aside, text);
      localStorage.removeItem(key);
      return where(aside);
    },
    describe: (kind) => where(STORAGE_KEYS[kind]),
  };
}
