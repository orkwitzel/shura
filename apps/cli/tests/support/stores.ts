import type { Storage, StoredKind } from '@shura/client-core';
import { type CliStores, openStores } from '../../src/config/stores';

/** Settings and records stores over storage in memory, starting with nothing saved. */
export function memoryStores(): CliStores {
  const texts = new Map<StoredKind, string>();
  const storage: Storage = {
    read: (kind) => texts.get(kind) ?? null,
    write: (kind, text) => void texts.set(kind, text),
    setAside: (kind) => {
      texts.delete(kind);
      return `${kind}.bak`;
    },
    describe: (kind) => kind,
  };
  return openStores(storage);
}
