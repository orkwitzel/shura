import type { Storage, StoredKind } from '@shura/client-core';
import { type CliStores, openStores } from '../../src/config/stores';

/**
 * Settings and records stores over storage in memory, starting with `config` and `records` as
 * saved (objects as JSON), or nothing.
 */
export function memoryStores(files: { config?: unknown; records?: unknown } = {}): CliStores {
  const texts = new Map<StoredKind, string>();
  const put = (kind: StoredKind, value: unknown) =>
    texts.set(kind, typeof value === 'string' ? value : JSON.stringify(value));
  if (files.config !== undefined) put('settings', files.config);
  if (files.records !== undefined) put('records', files.records);
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
