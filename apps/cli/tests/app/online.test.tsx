import type { ServerMessage, ServerMessageOf } from '@shura/protocol';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../../src/app/app';
import type { CliStores } from '../../src/app/stores';
import { VERSION_MISMATCH_MESSAGE } from '../../src/screens/online/online-screen';
import type { OnlineStart } from '../../src/screens/online/online-start';
import { fakeClock } from '../support/fake-clock';
import { type FakeServer, fakeServer } from '../support/fake-server';
import { resize, settle } from '../support/ink';
import { KEYS } from '../support/solo-app';
import { memoryStores } from '../support/stores';

let unmount: (() => void) | undefined;
afterEach(() => unmount?.());

const ROOM: ServerMessageOf<'roomState'> = {
  event: 'roomState',
  data: {
    code: 'K7QX',
    mode: '1v1',
    hostId: 'me',
    phase: 'lobby',
    players: [
      { id: 'me', nickname: 'Ada', kind: 'guest', seat: 0, ready: false },
      { id: 'bo', nickname: 'Bo', kind: 'guest', seat: 1, ready: true },
    ],
    spectators: [],
  },
};

const exception = (code: string, message: string): ServerMessage => ({
  event: 'exception',
  data: { code, message },
});

interface Options {
  readonly start?: OnlineStart;
  /** `--name`. */
  readonly name?: string;
  readonly stores?: CliStores;
}

/** `shura` (or `shura quick`, `create`, `join`) against `server`, with Ada saved as the nickname. */
async function online(
  server: FakeServer,
  { start, name, stores = memoryStores({ config: { version: 1, nickname: 'Ada' } }) }: Options = {},
) {
  const clock = fakeClock(1_000);
  const onExit = vi.fn();
  const app = render(
    <App
      clock={clock}
      colors="none"
      online={{
        server: 'http://test',
        web: 'http://test',
        clientVersion: 'test',
        connect: server.connect,
        fetch: server.fetch,
        clock,
        ...(name !== undefined && { name }),
      }}
      {...(start && { start })}
      onExit={onExit}
      {...stores}
    />,
  );
  unmount = app.unmount;
  resize(app, 100, 30);
  await wait();
  return {
    app,
    clock,
    onExit,
    stores,
    frame: () => app.lastFrame() ?? '',
    async type(...keys: string[]) {
      for (const key of keys) {
        app.stdin.write(key);
        await wait();
      }
    },
  };
}

/** Lets the session's POST, the socket and the renders go round. */
async function wait() {
  for (let at = 0; at < 8; at++) await settle();
}

const CREATE: OnlineStart = { action: 'create', mode: '1v1' };

describe('a version mismatch quits with code 1 and npm i -g shura@latest (design §8.3)', () => {
  test('at POST /api/sessions', async () => {
    const server = fakeServer({
      session: { status: 426, body: { code: 'version_mismatch', message: 'Update.' } },
    });
    const { onExit } = await online(server, { start: CREATE });
    expect(onExit).toHaveBeenCalledWith(1, VERSION_MISMATCH_MESSAGE);
    expect(VERSION_MISMATCH_MESSAGE).toContain('npm i -g shura@latest');
    expect(server.received).toEqual([]);
  });

  test('at hello', async () => {
    const server = fakeServer({
      reply: (message) =>
        message.event === 'hello' ? [exception('version_mismatch', 'Update.')] : undefined,
    });
    const { onExit } = await online(server, { start: CREATE });
    expect(onExit).toHaveBeenCalledWith(1, VERSION_MISMATCH_MESSAGE);
  });
});

describe('shura create and shura join', () => {
  test('create creates the session with the nickname, then the room, and shows its lobby', async () => {
    const server = fakeServer({
      reply: (message) => (message.event === 'createRoom' ? [ROOM] : undefined),
    });
    const { frame } = await online(server, { start: { action: 'create', mode: 'ffa' } });
    expect(server.sessions).toEqual([{ nickname: 'Ada' }]);
    expect(server.received[0]).toMatchObject({ event: 'hello', data: { sessionToken: 't' } });
    expect(server.received).toContainEqual({ event: 'createRoom', data: { mode: 'ffa' } });
    expect(frame()).toContain('ROOM K7QX');
    expect(frame()).toContain('Enter start');
  });

  test('a room that does not exist says so on the Play online menu, and Esc goes to the main menu', async () => {
    const server = fakeServer({
      reply: (message) =>
        message.event === 'joinRoom'
          ? [exception('room_not_found', 'No room with that code.')]
          : undefined,
    });
    const { frame, type } = await online(server, { start: { action: 'join', code: 'ZZZZ' } });
    expect(server.received).toContainEqual({ event: 'joinRoom', data: { code: 'ZZZZ' } });
    expect(frame()).toContain('PLAY ONLINE');
    expect(frame()).toContain('No room with that code.');
    await type(KEYS.escape);
    expect(frame()).toContain('SHURA');
    expect(frame()).toMatch(/› Play online/);
  });

  test('leaving the lobby lands in the Play online menu', async () => {
    const server = fakeServer({
      reply: (message) => (message.event === 'joinRoom' ? [ROOM] : undefined),
    });
    const { frame, type } = await online(server, { start: { action: 'join', code: 'K7QX' } });
    expect(frame()).toContain('ROOM K7QX');
    await type(KEYS.escape);
    expect(server.received).toContainEqual({ event: 'leaveRoom', data: {} });
    expect(frame()).toContain('PLAY ONLINE');
    expect(frame()).toContain('Quick match');
  });

  test("Enter is the host's Start, and the match shows both boards", async () => {
    const server = fakeServer({
      reply: (message) => {
        if (message.event === 'createRoom') return [ROOM];
        if (message.event !== 'startMatch') return undefined;
        return [
          {
            event: 'countdown',
            data: {
              startAt: 4000,
              seed: 7,
              matchId: 'm',
              players: [
                { id: 'me', index: 0 },
                { id: 'bo', index: 1 },
              ],
            },
          },
          { event: 'roomState', data: { ...ROOM.data, phase: 'countdown' } },
        ];
      },
    });
    const { frame, type } = await online(server, { start: CREATE });
    await type(KEYS.enter);
    expect(server.received).toContainEqual({ event: 'startMatch', data: {} });
    // Your board between its walls, and Bo's half-block board.
    expect(frame()).toContain('Bo');
    expect(frame()).toMatch(/└─{20}┘/);
    expect(frame()).toMatch(/└─{10}┘/);
  });
});

describe('shura quick', () => {
  test('queues and shows the waiting screen; Esc cancels to the Play online menu', async () => {
    const server = fakeServer({
      reply: (message) => {
        if (message.event === 'quickMatch') return [{ event: 'quickMatchQueued', data: {} }];
        if (message.event === 'cancelQuickMatch') {
          return [{ event: 'quickMatchCancelled', data: {} }];
        }
        return undefined;
      },
    });
    const { frame, type } = await online(server, { start: { action: 'quick' } });
    expect(server.received).toContainEqual({ event: 'quickMatch', data: {} });
    expect(frame()).toContain('Looking for an opponent');
    await type(KEYS.escape);
    expect(server.received).toContainEqual({ event: 'cancelQuickMatch', data: {} });
    expect(frame()).toContain('PLAY ONLINE');
  });
});

describe('the nickname', () => {
  test('is asked for the first time Play online opens, and saved', async () => {
    const server = fakeServer();
    const stores = memoryStores();
    const { frame, type } = await online(server, { stores });
    await type(KEYS.up, KEYS.enter);
    expect(frame()).toContain('NICKNAME');
    expect(frame()).toMatch(/Player\d{4}/);
    await type('\x1b[109;2u', KEYS.letter('i'), KEYS.letter('r'), KEYS.letter('a'), KEYS.enter);
    expect(stores.settings.getState().nickname).toBe('Mira');
    expect(frame()).toContain('PLAY ONLINE');
    expect(server.sessions).toEqual([{ nickname: 'Mira' }]);
  });

  test('is not asked for with --name, which is not saved', async () => {
    const server = fakeServer();
    const stores = memoryStores();
    const { frame } = await online(server, { stores, name: 'Bo', start: { action: 'quick' } });
    expect(frame()).not.toContain('NICKNAME');
    expect(server.sessions).toEqual([{ nickname: 'Bo' }]);
    expect(stores.settings.getState().nickname).toBeUndefined();
  });

  test('Esc in the prompt goes back to the main menu', async () => {
    const { frame, type } = await online(fakeServer(), { stores: memoryStores() });
    await type(KEYS.up, KEYS.enter, KEYS.escape);
    expect(frame()).toContain('SHURA');
  });

  test('refused by the server, is asked for again', async () => {
    const server = fakeServer({
      session: { status: 400, body: { code: 'nickname_invalid', message: 'Not that one.' } },
    });
    const { frame } = await online(server, { start: { action: 'quick' } });
    expect(frame()).toContain('NICKNAME');
    expect(frame()).toContain('Ada');
  });
});

describe('errors from the server, in plain words', () => {
  test('a limit refusal (design §11)', async () => {
    const server = fakeServer({
      reply: (message) =>
        message.event === 'createRoom' ? [exception('room_limit', 'room_limit')] : undefined,
    });
    const { frame } = await online(server, { start: CREATE });
    expect(frame()).toContain('Too many rooms created. Try again in a minute.');
  });

  test('a connection refused at the door', async () => {
    const server = fakeServer({
      reply: (message) =>
        message.event === 'hello'
          ? [exception('too_many_connections', 'too_many_connections')]
          : undefined,
    });
    const { frame } = await online(server, { start: CREATE });
    // The menu wraps it at its width.
    expect(frame().replace(/\s+/g, ' ')).toContain(
      'Too many connections from your network. Try again in a minute.',
    );
  });
});

test("Play online says when it can't reach the server, and Retry tries again", async () => {
  let posts = 0;
  const server: FakeServer = {
    ...fakeServer(),
    fetch: async () => {
      posts++;
      throw new TypeError('fetch failed');
    },
  };
  const { frame, type } = await online(server);
  await type(KEYS.up, KEYS.enter);
  expect(frame()).toContain("Can't reach the server at http://test");
  expect(frame()).toContain('Retry');
  await type(KEYS.enter);
  expect(posts).toBe(2);
});
