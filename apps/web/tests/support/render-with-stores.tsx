import {
  type AppStores,
  createRecordsStore,
  createSettingsStore,
  type StoredKind,
} from '@shura/client-core';
import { ClientCoreProvider } from '@shura/client-core/react';
import { type RenderResult, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { DEFAULT_BINDINGS } from '@/config/default-bindings';
import { type MemoryStorage, memoryStorage } from './memory-storage';

export interface RenderWithStoresOptions {
  /** What storage holds before the stores load (objects as JSON). */
  readonly stored?: Partial<Record<StoredKind, unknown>>;
  /** The route to start on: `/` by default. */
  readonly path?: string;
}

export interface RenderWithStoresResult extends RenderResult {
  /** The fresh settings and records stores the UI was given. */
  readonly stores: AppStores;
  /** The storage under them. */
  readonly storage: MemoryStorage;
  /** The route the app is on now. */
  readonly location: () => string;
  /** The routes visited, oldest first, as a browser history would hold them. */
  readonly history: readonly string[];
  /** Goes to `path`, as following a link would. */
  readonly navigate: (path: string) => void;
}

/**
 * Renders `ui` as the app does: inside a `<ClientCoreProvider>` with fresh settings and records
 * stores over storage in memory (with the web's default bindings), and a wouter router over an
 * in-memory location.
 */
export function renderWithStores(
  ui: ReactElement,
  { stored = {}, path = '/' }: RenderWithStoresOptions = {},
): RenderWithStoresResult {
  const storage = memoryStorage(stored);
  const stores: AppStores = {
    settings: createSettingsStore({ storage, bindings: DEFAULT_BINDINGS }),
    records: createRecordsStore({ storage }),
  };
  const memory = memoryLocation({ path, record: true });
  const result = render(
    <ClientCoreProvider {...stores}>
      <Router hook={memory.hook}>{ui}</Router>
    </ClientCoreProvider>,
  );
  return {
    ...result,
    stores,
    storage,
    location: () => memory.history.at(-1) ?? path,
    history: memory.history,
    navigate: (to) => memory.navigate(to),
  };
}
