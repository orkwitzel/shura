import type { Storage, StoredKind } from '@shura/client-core';

/** A storage in memory, with its texts and set-aside texts open to the test. */
export interface MemoryStorage extends Storage {
  readonly texts: Map<StoredKind, string>;
  readonly asides: Map<StoredKind, string>;
}

/** Storage in memory, starting with `initial` as stored (objects as JSON), or nothing. */
export function memoryStorage(initial: Partial<Record<StoredKind, unknown>> = {}): MemoryStorage {
  const texts = new Map<StoredKind, string>();
  for (const [kind, value] of Object.entries(initial) as [StoredKind, unknown][]) {
    texts.set(kind, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const asides = new Map<StoredKind, string>();
  return {
    texts,
    asides,
    read: (kind) => texts.get(kind) ?? null,
    write: (kind, text) => void texts.set(kind, text),
    setAside(kind) {
      const text = texts.get(kind);
      if (text !== undefined) asides.set(kind, text);
      texts.delete(kind);
      return `${kind} backup`;
    },
    describe: (kind) => `the ${kind}`,
  };
}
