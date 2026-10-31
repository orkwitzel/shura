// The React hooks both UIs share (design §13.1, ADR 0012): `@shura/client-core/react`. The root
// entry has no React in it; only this one does.
import type { ReadonlyEngineState } from '@shura/engine';
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useStore } from 'zustand';
import { personalBestLine } from './personal-best';
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

/**
 * Records each game of `session` that ends, once, in the records store (design §13.1), and gives
 * the results' personal best line for it: `undefined` until the game has ended and been recorded.
 * Quitting mid-game records nothing. A restart makes a new engine, which is how a new game is told
 * apart.
 */
export function useSoloRecord(session: SoloSession): string | undefined {
  const { records } = useStores('useSoloRecord');
  const ended = useSession(session, (state) => state.phase === 'ended');
  const game = useSession(session, (state) => state.engine);
  const [verdict, setVerdict] = useState<{ game: ReadonlyEngineState; line: string } | null>(null);
  useEffect(() => {
    if (!ended || verdict?.game === game) return;
    const state = session.getState();
    setVerdict({ game: state.engine, line: personalBestLine(state.mode, records.submit(state)) });
  }, [ended, game, verdict, records, session]);
  return verdict?.game === game ? verdict.line : undefined;
}
