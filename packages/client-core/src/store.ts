import type { StoreApi } from 'zustand/vanilla';
import type { RecordsStore } from './records';
import type { SettingsStore } from './settings';

/**
 * A read-only Zustand store (design §13.1, ADR 0012): what UIs read, through the hooks in
 * `@shura/client-core/react` or Zustand's `useStore`. `getState` returns the same object until the
 * state changes, then a new one, and every subscriber is called after each change. The module that
 * owns the state writes it through the full store it made with `createStore` from
 * `zustand/vanilla`.
 */
export type Store<State> = Pick<StoreApi<State>, 'getState' | 'getInitialState' | 'subscribe'>;

/** The app-wide stores: one settings and one records store for the life of the app (design §13.1). */
export interface AppStores {
  readonly settings: SettingsStore;
  readonly records: RecordsStore;
}
