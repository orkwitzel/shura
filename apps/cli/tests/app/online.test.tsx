import type { ServerMessageOf } from '@shura/protocol';
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
  type: 'roomState',
  code: 'K7QX',
  mode: '1v1',
  hostId: 'me',
  phase: 'lobby',
  players: [
    { id: 'me', nickname: 'Ada', kind: 'guest', seat: 0, ready: false },
    { id: 'bo', nickname: 'Bo', kind: 'guest', seat: 1, ready: true },
  ],
  spectators: [],
};

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
        server: 'ws://test',
        clientVersion: 'test',
        connect: server.connect,
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

async function wait() {
  for (let at = 0; at < 5; at++) await settle();
}

test('a version mismatch quits with code 1 and npm i -g shura@latest (design §8.3)', async () => {
  const server = fakeServer((message) =>
    message.type === 'hello'
      ? [{ type: 'error', code: 'version_mismatch', message: 'A new version of Shura is out.' }]
      : undefined,
  );
  const { onExit } = await online(server, { start: { action: 'create', mode: '1v1' } });
  expect(onExit).toHaveBeenCalledWith(1, VERSION_MISMATCH_MESSAGE);
  expect(VERSION_MISMATCH_MESSAGE).toContain('npm i -g shura@latest');
});

describe('shura create and shura join', () => {
  test('create says hello with the nickname, creates the room and shows its lobby', async () => {
    const server = fakeServer((message) => (message.type === 'createRoom' ? [ROOM] : undefined));
    const { frame } = await online(server, { start: { action: 'create', mode: 'ffa' } });
    expect(server.received[0]).toMatchObject({ type: 'hello', nickname: 'Ada' });
    expect(server.received).toContainEqual({ type: 'createRoom', mode: 'ffa' });
    expect(frame()).toContain('ROOM K7QX');
    expect(frame()).toContain('Enter start');
  });

  test('a room that does not exist says so on the Play online menu, and Esc goes to the main menu', async () => {
    const server = fakeServer((message) =>
      message.type === 'joinRoom'
        ? [{ type: 'error', code: 'room_not_found', message: 'No room with that code.' }]
        : undefined,
    );
    const { frame, type } = await online(server, { start: { action: 'join', code: 'ZZZZ' } });
    expect(server.received).toContainEqual({ type: 'joinRoom', code: 'ZZZZ' });
    expect(frame()).toContain('PLAY ONLINE');
    expect(frame()).toContain('No room with that code.');
    await type(KEYS.escape);
    expect(frame()).toContain('SHURA');
    expect(frame()).toMatch(/› Play online/);
  });

  test('leaving the lobby lands in the Play online menu', async () => {
    const server = fakeServer((message) => (message.type === 'joinRoom' ? [ROOM] : undefined));
    const { frame, type } = await online(server, { start: { action: 'join', code: 'K7QX' } });
    expect(frame()).toContain('ROOM K7QX');
    await type(KEYS.escape);
    expect(server.received).toContainEqual({ type: 'leaveRoom' });
    expect(frame()).toContain('PLAY ONLINE');
    expect(frame()).toContain('Quick match');
  });

  test("Enter is the host's Start, and the match shows both boards", async () => {
    const server = fakeServer((message) => {
      if (message.type === 'createRoom') return [ROOM];
      if (message.type !== 'startMatch') return undefined;
      return [
        {
          type: 'countdown',
          startAt: 3000,
          seed: 7,
          matchId: 'm',
          players: [
            { id: 'me', index: 0 },
            { id: 'bo', index: 1 },
          ],
        },
        { ...ROOM, phase: 'countdown' },
      ];
    });
    const { frame, type } = await online(server, { start: { action: 'create', mode: '1v1' } });
    await type(KEYS.enter);
    expect(server.received).toContainEqual({ type: 'startMatch' });
    expect(frame()).toContain('Bo');
    expect(frame()).toMatch(/└─{20}┘/);
    expect(frame()).toMatch(/└─{10}┘/);
  });
});

describe('shura quick', () => {
  test('queues and shows the waiting screen; Esc cancels to the Play online menu', async () => {
    const server = fakeServer((message) => {
      if (message.type === 'quickMatch') return [{ type: 'quickMatchQueued' }];
      if (message.type === 'cancelQuickMatch') return [{ type: 'quickMatchCancelled' }];
      return undefined;
    });
    const { frame, type } = await online(server, { start: { action: 'quick' } });
    expect(server.received).toContainEqual({ type: 'quickMatch' });
    expect(frame()).toContain('Looking for an opponent');
    await type(KEYS.escape);
    expect(server.received).toContainEqual({ type: 'cancelQuickMatch' });
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
    expect(server.received[0]).toMatchObject({ type: 'hello', nickname: 'Mira' });
  });

  test('is not asked for with --name, which is not saved', async () => {
    const server = fakeServer();
    const stores = memoryStores();
    const { frame } = await online(server, { stores, name: 'Bo', start: { action: 'quick' } });
    expect(frame()).not.toContain('NICKNAME');
    expect(server.received[0]).toMatchObject({ type: 'hello', nickname: 'Bo' });
    expect(stores.settings.getState().nickname).toBeUndefined();
  });

  test('Esc in the prompt goes back to the main menu', async () => {
    const { frame, type } = await online(fakeServer(), { stores: memoryStores() });
    await type(KEYS.up, KEYS.enter, KEYS.escape);
    expect(frame()).toContain('SHURA');
  });
});

test("Play online says when it can't reach the server, and Retry tries again", async () => {
  let dials = 0;
  const unreachable = fakeServer();
  const server: FakeServer = {
    ...unreachable,
    connect: (_url, handlers) => {
      dials++;
      setTimeout(handlers.close, 0);
      return { send: () => {}, close: () => {} };
    },
  };
  const { frame, type } = await online(server);
  await type(KEYS.up, KEYS.enter);
  expect(frame()).toContain("Can't reach the server at ws://test");
  await type(KEYS.enter);
  expect(dials).toBe(2);
});
