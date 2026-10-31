import type { Storage, StoredKind } from '../../src/storage';

/** A storage in memory, with its texts and set-aside texts open to the test. */
export interface MemoryStorage extends Storage {
  readonly texts: Map<StoredKind, string>;
  readonly asides: Map<StoredKind, string>;
  /** Makes the next writes throw, as a full disk would. */
  failWrites: boolean;
}

export function memoryStorage(initial: Partial<Record<StoredKind, unknown>> = {}): MemoryStorage {
  const texts = new Map<StoredKind, string>();
  for (const [kind, value] of Object.entries(initial) as [StoredKind, unknown][]) {
    texts.set(kind, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const asides = new Map<StoredKind, string>();
  const storage: MemoryStorage = {
    texts,
    asides,
    failWrites: false,
    read: (kind) => texts.get(kind) ?? null,
    write(kind, text) {
      if (storage.failWrites) throw new Error('disk full');
      texts.set(kind, text);
    },
    setAside(kind) {
      const text = texts.get(kind);
      if (text !== undefined) asides.set(kind, text);
      texts.delete(kind);
      return `${kind}.bak`;
    },
    describe: (kind) => `${kind}.json`,
  };
  return storage;
}
