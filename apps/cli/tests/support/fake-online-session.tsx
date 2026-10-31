import type { OnlineRoom, OnlineSession, OnlineSessionState } from '@shura/client-core';
import { ClientCoreProvider } from '@shura/client-core/react';
import { createEngine, ONE_VS_ONE } from '@shura/engine';
import type { ServerMessageOf } from '@shura/protocol';
import { render } from 'ink-testing-library';
import type { ReactElement } from 'react';
import { type Mock, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { resize, settle } from './ink';
import { memoryStores } from './stores';

type Method = Exclude<
  keyof OnlineSession,
  'getState' | 'getInitialState' | 'subscribe' | 'sessionToken'
>;

/** An online session whose store a test sets by hand, and whose methods record their calls. */
export type FakeOnlineSession = OnlineSession & { [Name in Method]: Mock<OnlineSession[Name]> } & {
  /** Changes the store, as the session would on a message. */
  set(change: Partial<OnlineSessionState>): void;
};

/** Connected as `me` (Ada), in no room, unless `state` says otherwise. */
export function fakeOnlineSession(state: Partial<OnlineSessionState> = {}): FakeOnlineSession {
  const store = createStore<OnlineSessionState>()(() => ({
    connection: { status: 'connected' },
    sessionId: 'me',
    nickname: 'Ada',
    ping: 38,
    room: null,
    match: null,
    quickMatch: 'idle',
    error: null,
    ...state,
  }));
  return {
    getState: store.getState,
    getInitialState: store.getInitialState,
    subscribe: store.subscribe,
    sessionToken: null,
    set: (change) => store.setState(change),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    leaveMatch: vi.fn(),
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
    onEvents: vi.fn(() => () => {}),
    onActions: vi.fn(() => () => {}),
    onRoutings: vi.fn(() => () => {}),
    close: vi.fn(),
  };
}

/** A room's lobby: Ada (`me`, the host, not ready) and Bo (ready), in a 1v1 unless `change`. */
export function lobbyRoom(change: Partial<OnlineRoom> = {}): OnlineRoom {
  return {
    code: 'K7QX',
    mode: '1v1',
    hostId: 'me',
    phase: 'lobby',
    players: [
      { id: 'me', nickname: 'Ada', kind: 'guest', seat: 0, ready: false },
      { id: 'bo', nickname: 'Bo', kind: 'bot', seat: 1, ready: true },
    ],
    spectators: [],
    ...change,
  };
}

/** A match's countdown message, for the players `ids` in index order. */
export function countdownOf(ids: readonly string[]): ServerMessageOf<'countdown'> {
  return {
    type: 'countdown',
    startAt: 0,
    seed: 7,
    matchId: 'm1',
    players: ids.map((id, index) => ({ id, index })),
  };
}

/** A fresh game of the 1v1 settings, for a match state made by hand. */
export function freshEngine(index: number) {
  return createEngine(ONE_VS_ONE, 7, index);
}

/**
 * `element` rendered with the providers a screen needs (memory stores unless `stores`), at
 * `columns`×`rows` (80×24 by default). Unmount it at the end of the test.
 */
export async function renderScreen(
  element: ReactElement,
  { stores = memoryStores(), columns = 80, rows = 24 } = {},
) {
  const app = render(
    <ClientCoreProvider settings={stores.settings} records={stores.records}>
      {element}
    </ClientCoreProvider>,
  );
  resize(app, columns, rows);
  await settle();
  return {
    app,
    stores,
    frame: () => app.lastFrame() ?? '',
    async type(...keys: string[]) {
      for (const key of keys) {
        app.stdin.write(key);
        await settle();
      }
    },
  };
}
