import type {
  ConnectionFailure,
  GarbageRouting,
  OnlineRoom,
  OnlineSession,
  OnlineSessionState,
  RoutingListener,
  SessionEventListener,
} from '@shura/client-core';
import type { EngineEvent } from '@shura/engine';
import type { ErrorCode, ServerData } from '@shura/protocol';
import { act } from '@testing-library/react';
import { vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { OpenOnlineSession, OpenOnlineSessionOptions } from '@/lib/open-online-session';

type Player = ServerData<'roomState'>['players'][number];
type Spectator = ServerData<'roomState'>['spectators'][number];

/** The session methods a fake records, each a `vi.fn()`. */
type Methods = Omit<OnlineSession, 'getState' | 'getInitialState' | 'subscribe'>;

/**
 * A stand-in for client-core's `OnlineSession`: the same store, which the test sets by hand, and
 * every method a `vi.fn()` that does nothing, except `leaveRoom`, which clears the room as the
 * real one does. A room set on it merges its names into `names`, and your own nickname, as the
 * real one does.
 */
export interface FakeOnlineSession extends OnlineSession {
  /** What the app opened it with. */
  readonly options: OpenOnlineSessionOptions;
  /** Changes the store, inside `act`. */
  set(change: Partial<OnlineSessionState>): void;
  /**
   * Connected, as `sessionId` named `nickname` with `token`: what `POST /api/sessions` and then
   * the `welcome` give the real session.
   */
  welcome(sessionId?: string, nickname?: string, token?: string): void;
  /** A `roomState`. */
  room(room: OnlineRoom | null): void;
  /** An `exception` after the welcome. */
  error(code: ErrorCode, message?: string): void;
  /** The connection failed. */
  fail(reason: ConnectionFailure, message?: string): void;
  /** Your own game's engine events, to its `onEvents` listeners, inside `act`. */
  emitEvents(...events: EngineEvent[]): void;
  /** A garbage routing, to its `onRoutings` listeners, inside `act`. */
  emitRouting(routing: GarbageRouting): void;
}

const INITIAL: OnlineSessionState = {
  connection: { status: 'connecting' },
  sessionId: null,
  sessionToken: null,
  nickname: null,
  names: new Map(),
  ping: null,
  room: null,
  match: null,
  quickMatch: 'idle',
  error: null,
};

export function fakeOnlineSession(options: OpenOnlineSessionOptions): FakeOnlineSession {
  const store = createStore<OnlineSessionState>()(() => ({
    ...INITIAL,
    sessionToken: options.sessionToken ?? null,
  }));
  /** `change`, with a room's names merged in, and yours from it, as the session keeps them. */
  const withNames = (change: Partial<OnlineSessionState>): Partial<OnlineSessionState> => {
    if (!change.room) return change;
    const { sessionId, nickname, names } = { ...store.getState(), ...change };
    const members = [...change.room.players, ...change.room.spectators];
    const merged = new Map(names);
    for (const member of members) merged.set(member.id, member.nickname);
    const yours = members.find(({ id }) => id === sessionId)?.nickname ?? nickname;
    return { ...change, names: merged, nickname: yours };
  };
  const set = (change: Partial<OnlineSessionState>) => act(() => store.setState(withNames(change)));
  const eventListeners = new Set<SessionEventListener>();
  const routingListeners = new Set<RoutingListener>();
  /** A `vi.fn()` that adds a listener to `listeners`, returning its removal. */
  const listen = <L>(listeners: Set<L>) =>
    vi.fn((listener: L) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    });
  const methods: Methods = {
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(() => store.setState({ room: null, match: null })),
    setReady: vi.fn(),
    spectate: vi.fn(),
    takeSeat: vi.fn(),
    setNickname: vi.fn(),
    startMatch: vi.fn(),
    quickMatch: vi.fn(),
    cancelQuickMatch: vi.fn(),
    rematch: vi.fn(),
    now: vi.fn(() => 0),
    key: vi.fn(),
    act: vi.fn(),
    setInput: vi.fn(),
    onEvents: listen(eventListeners),
    onActions: vi.fn(() => () => {}),
    onRoutings: listen(routingListeners),
    close: vi.fn(() => store.setState({ connection: { status: 'closed' } })),
  };
  return {
    ...methods,
    options,
    getState: store.getState,
    getInitialState: store.getInitialState,
    subscribe: store.subscribe,
    set,
    welcome(sessionId = 'me', nickname = options.nickname, given = `token-${sessionId}`) {
      const names = new Map(store.getState().names).set(sessionId, nickname);
      set({
        connection: { status: 'connected' },
        sessionId,
        sessionToken: given,
        nickname,
        names,
        ping: 42,
      });
    },
    room: (room) => set({ room }),
    error: (code, message = code) => set({ error: { code, message } }),
    fail: (reason, message = reason) => set({ connection: { status: 'failed', reason, message } }),
    emitEvents: (...events) =>
      act(() => {
        for (const listener of eventListeners) listener(events);
      }),
    emitRouting: (routing) =>
      act(() => {
        for (const listener of routingListeners) listener(routing);
      }),
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
    quickMatch: false,
    players: [seated('me', 0)],
    spectators: [],
    ...more,
  };
}
