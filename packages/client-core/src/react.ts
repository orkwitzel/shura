// The React hooks both UIs share (design §13.1, ADR 0012): `@shura/client-core/react`. The root
// entry has no React in it; only this one does.
import { createContext, createElement, type ReactNode, useContext } from 'react';
import { useStore } from 'zustand';
import type { Records, RecordsStore } from './records';
import type { Settings, SettingsStore } from './settings';
import type { SoloSession, SoloSessionState } from './solo-session';
import type { AppStores } from './store';

/**
 * A session's whole state, re-rendering after each change: the board's view, which changes every
 * frame anyway.
 */
export function useSession(session: SoloSession): SoloSessionState;
/**
 * The slice of a session's state that `selector` picks, re-rendering only when it changes (by
 * `Object.is`). The engine state inside is live, so select the values the component shows, not
 * `state.engine` itself.
 */
export function useSession<T>(session: SoloSession, selector: (state: SoloSessionState) => T): T;
export function useSession(
  session: SoloSession,
  selector: (state: SoloSessionState) => unknown = (state) => state,
): unknown {
  return useStore(session, selector);
}

const StoresContext = createContext<AppStores | null>(null);

export interface ClientCoreProviderProps extends AppStores {
  readonly children?: ReactNode;
}

/**
 * Gives the components under it the app's settings and records stores, which `useSettings` and
 * `useRecords` find. A session belongs to one game, so `useSession` takes it as an argument
 * instead (design §13.1, State).
 */
export function ClientCoreProvider({ settings, records, children }: ClientCoreProviderProps) {
  return createElement(StoresContext.Provider, { value: { settings, records } }, children);
}

function useStores(hook: string): AppStores {
  const stores = useContext(StoresContext);
  if (!stores) throw new Error(`${hook} needs a <ClientCoreProvider> above it`);
  return stores;
}

/** The settings store itself, for its writes (`update`, `save`). */
export function useSettingsStore(): SettingsStore {
  return useStores('useSettingsStore').settings;
}

/** The settings, re-rendering after each change. */
export function useSettings(): Settings;
/** The slice of the settings that `selector` picks, re-rendering only when it changes. */
export function useSettings<T>(selector: (settings: Settings) => T): T;
export function useSettings(selector: (settings: Settings) => unknown = (state) => state): unknown {
  return useStore(useStores('useSettings').settings, selector);
}

/** The records store itself, for `submit`. */
export function useRecordsStore(): RecordsStore {
  return useStores('useRecordsStore').records;
}

/** The personal bests, re-rendering after each change. */
export function useRecords(): Records;
/** The slice of the records that `selector` picks, re-rendering only when it changes. */
export function useRecords<T>(selector: (records: Records) => T): T;
export function useRecords(selector: (records: Records) => unknown = (state) => state): unknown {
  return useStore(useStores('useRecords').records, selector);
}
