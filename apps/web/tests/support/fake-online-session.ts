import type {
  ConnectionFailure,
  OnlineRoom,
  OnlineSession,
  OnlineSessionState,
} from '@shura/client-core';
import type { ErrorCode, ServerMessageOf } from '@shura/protocol';
import { act } from '@testing-library/react';
import { vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { OpenOnlineSession, OpenOnlineSessionOptions } from '@/lib/open-online-session';

type Player = ServerMessageOf<'roomState'>['players'][number];
type Spectator = ServerMessageOf<'roomState'>['spectators'][number];

/** The session methods a fake records, each a `vi.fn()`. */
type Methods = Omit<OnlineSession, 'getState' | 'getInitialState' | 'subscribe' | 'sessionToken'>;

/**
 * A stand-in for client-core's `OnlineSession`: the same store, which the test sets by hand, and
 * every method a `vi.fn()` that does nothing, except `leaveRoom`, which clears the room as the
 * real one does.
 */
export interface FakeOnlineSession extends OnlineSession {
  /** What the app opened it with. */
  readonly options: OpenOnlineSessionOptions;
  readonly sessionToken: string | null;
  /** Changes the store, inside `act`. */
  set(change: Partial<OnlineSessionState>): void;
  /** The server's `welcome`: connected, as `sessionId` named `nickname`. */
  welcome(sessionId?: string, nickname?: string, token?: string): void;
  /** A `roomState`. */
  room(room: OnlineRoom | null): void;
  /** An `error` after the welcome. */
  error(code: ErrorCode, message?: string): void;
  /** The connection failed. */
  fail(reason: ConnectionFailure, message?: string): void;
}

const INITIAL: OnlineSessionState = {
  connection: { status: 'connecting' },
  sessionId: null,
  nickname: null,
  ping: null,
  room: null,
  match: null,
  quickMatch: 'idle',
  error: null,
};

export function fakeOnlineSession(options: OpenOnlineSessionOptions): FakeOnlineSession {
  const store = createStore<OnlineSessionState>()(() => INITIAL);
  let token: string | null = options.sessionToken ?? null;
  const set = (change: Partial<OnlineSessionState>) => act(() => store.setState(change));
  const methods: Methods = {
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(() => store.setState({ room: null, match: null })),
    leaveMatch: vi.fn(),
    setReady: vi.fn(),
    spectate: vi.fn(),
    takeSeat: vi.fn(),
    setNickname: vi.fn(),
    startMatch: vi.fn(),
    quickMatch: vi.fn(),
    cancelQuickMatch: vi.fn(),
    rematch: vi.fn(),
    key: vi.fn(),
    act: vi.fn(),
    setInput: vi.fn(),
    onEvents: vi.fn(() => () => {}),
    onActions: vi.fn(() => () => {}),
    close: vi.fn(() => store.setState({ connection: { status: 'closed' } })),
  };
  return {
    ...methods,
    options,
    get sessionToken() {
      return token;
    },
    getState: store.getState,
    getInitialState: store.getInitialState,
    subscribe: store.subscribe,
    set,
    welcome(sessionId = 'me', nickname = options.nickname, given = `token-${sessionId}`) {
      token = given;
      set({ connection: { status: 'connected' }, sessionId, nickname, ping: 42 });
    },
    room: (room) => set({ room }),
    error: (code, message = code) => set({ error: { code, message } }),
    fail: (reason, message = reason) => set({ connection: { status: 'failed', reason, message } }),
  };
}

/** Every session the app opened, the latest last, and the `open` that made them. */
export interface FakeOnline {
  readonly open: OpenOnlineSession;
  readonly sessions: FakeOnlineSession[];
  /** The latest session. Throws if none was opened. */
  readonly session: () => FakeOnlineSession;
}

export function fakeOnline(): FakeOnline {
  const sessions: FakeOnlineSession[] = [];
  return {
    sessions,
    open: (options) => {
      const session = fakeOnlineSession(options);
      sessions.push(session);
      return session;
    },
    session: () => {
      const session = sessions.at(-1);
      if (!session) throw new Error('no online session was opened');
      return session;
    },
  };
}

/** A seated player in a `roomState`. */
export function seated(
  id: string,
  seat: number,
  more: Partial<Omit<Player, 'id' | 'seat'>> = {},
): Player {
  return { id, nickname: id, kind: 'guest', seat, ready: false, ...more };
}

/** A spectator in a `roomState`. */
export function watching(id: string, more: Partial<Omit<Spectator, 'id'>> = {}): Spectator {
  return { id, nickname: id, kind: 'guest', ...more };
}

/** A room in its lobby: by default 1v1 `K7QX`, hosted by `me`, with only `me` seated. */
export function lobby(more: Partial<OnlineRoom> = {}): OnlineRoom {
  return {
    code: 'K7QX',
    mode: '1v1',
    hostId: 'me',
    phase: 'lobby',
    players: [seated('me', 0)],
    spectators: [],
    ...more,
  };
}
