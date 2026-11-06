// The React hooks both UIs share (design §13.1, ADR 0012): `@shura/client-core/react`. The root
// entry has no React in it; only this one does.
import type { ReadonlyEngineState } from '@shura/engine';
import type { RoomInfo } from '@shura/protocol';
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useStore } from 'zustand';
import type { Api } from './online/api';
import { isOnlineError, OnlineError, UNREACHABLE_TEXT } from './online/online-error';
import type { Settings, SettingsStore } from './settings/settings';
import type { AppStores } from './shared/store';
import { personalBestLine } from './solo/personal-best';
import type { Records, RecordsStore } from './solo/records';
import type { SoloSession, SoloSessionState } from './solo/solo-session';

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
const ApiContext = createContext<Api | null>(null);

export interface ClientCoreProviderProps extends AppStores {
  /** The API client of the app's server, which `useRoomLookup` reads through. */
  readonly api?: Api;
  readonly children?: ReactNode;
}

/**
 * Gives the components under it the app's settings and records stores, which `useSettings` and
 * `useRecords` find, and the server's API client, which `useRoomLookup` finds. A session belongs
 * to one game, so `useSession` takes it as an argument instead (design §13.1, State).
 */
export function ClientCoreProvider({ settings, records, api, children }: ClientCoreProviderProps) {
  return createElement(
    StoresContext.Provider,
    { value: { settings, records } },
    createElement(ApiContext.Provider, { value: api ?? null }, children),
  );
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

/** What `useRoomLookup` knows of a room: nothing asked, asking, the room, or why not. */
export type RoomLookup =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'found'; readonly room: RoomInfo }
  | { readonly status: 'failed'; readonly error: OnlineError };

const IDLE: RoomLookup = { status: 'idle' };
const LOADING: RoomLookup = { status: 'loading' };

/**
 * The room with `code` as the server describes it (`GET /api/rooms/:code`, design §13.1, API
 * client), through the provider's API client: loading, then found, or failed with an
 * `OnlineError` (`room_not_found` for a code no room has). `null` asks nothing. It asks once per
 * code, even when Strict Mode mounts it twice, and never polls: lookups that miss count against
 * the failed-join limit (§11).
 */
export function useRoomLookup(code: string | null): RoomLookup {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useRoomLookup needs a <ClientCoreProvider api={…}> above it');
  const [answered, setAnswered] = useState<{ code: string; lookup: RoomLookup } | null>(null);
  /** The code asked about last, and its answer to come: kept across Strict Mode's remount. */
  const asked = useRef<{ code: string; answer: Promise<RoomLookup> } | null>(null);
  useEffect(() => {
    if (code === null) {
      asked.current = null;
      return;
    }
    if (asked.current?.code !== code) {
      const answer = api.lookupRoom(code).then(
        (room): RoomLookup => ({ status: 'found', room }),
        (error: unknown): RoomLookup => ({
          status: 'failed',
          error: isOnlineError(error) ? error : new OnlineError('unreachable', UNREACHABLE_TEXT),
        }),
      );
      asked.current = { code, answer };
    }
    let current = true;
    void asked.current.answer.then((lookup) => {
      if (current) setAnswered({ code, lookup });
    });
    return () => {
      current = false;
    };
  }, [api, code]);
  if (code === null) return IDLE;
  return answered?.code === code ? answered.lookup : LOADING;
}
