import type { ServerMessageOf } from '@shura/protocol';
import { render } from 'ink-testing-library';
import { afterEach, expect, test, vi } from 'vitest';
import { App, type OnlineOptions } from '../../src/app/app';
import { VERSION_MISMATCH_MESSAGE } from '../../src/screens/online/online-screen';
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

/** `shura create` (or `start`) against `server`. */
async function online(
  server: FakeServer,
  start: OnlineOptions['start'] = { action: 'create', mode: '1v1' },
) {
  const clock = fakeClock(1_000);
  const onExit = vi.fn();
  const app = render(
    <App
      clock={clock}
      colors="none"
      online={{
        start,
        server: 'ws://test',
        nickname: 'Ada',
        clientVersion: 'test',
        connect: server.connect,
        clock,
      }}
      onExit={onExit}
      {...memoryStores()}
    />,
  );
  unmount = app.unmount;
  resize(app, 100, 30);
  for (let wait = 0; wait < 5; wait++) await settle();
  return { app, clock, onExit, frame: () => app.lastFrame() ?? '' };
}

test('a version mismatch quits with code 1 and npm i -g shura@latest (design §8.3)', async () => {
  const server = fakeServer((message) =>
    message.type === 'hello'
      ? [{ type: 'error', code: 'version_mismatch', message: 'A new version of Shura is out.' }]
      : undefined,
  );
  const { onExit } = await online(server);
  expect(onExit).toHaveBeenCalledWith(1, VERSION_MISMATCH_MESSAGE);
  expect(VERSION_MISMATCH_MESSAGE).toContain('npm i -g shura@latest');
});

test('shura create says hello with the nickname, creates the room and shows its lobby', async () => {
  const server = fakeServer((message) => (message.type === 'createRoom' ? [ROOM] : undefined));
  const { frame } = await online(server);
  expect(server.received[0]).toMatchObject({ type: 'hello', nickname: 'Ada' });
  expect(server.received).toContainEqual({ type: 'createRoom', mode: '1v1' });
  expect(frame()).toContain('ROOM K7QX');
  expect(frame()).toMatch(/Ada \(host\)/);
  expect(frame()).toMatch(/Bo\s+ready/);
  expect(frame()).toContain('Enter start');
});

test('shura join joins the room by its code', async () => {
  const server = fakeServer((message) => (message.type === 'joinRoom' ? [ROOM] : undefined));
  const { frame } = await online(server, { action: 'join', code: 'K7QX' });
  expect(server.received).toContainEqual({ type: 'joinRoom', code: 'K7QX' });
  expect(frame()).toContain('ROOM K7QX');
});

test("Enter is the host's Start, and the match shows both boards", async () => {
  const server = fakeServer((message) => {
    if (message.type === 'createRoom') return [ROOM];
    if (message.type === 'startMatch') {
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
    }
    return undefined;
  });
  const { app, frame } = await online(server);
  app.stdin.write(KEYS.enter);
  for (let wait = 0; wait < 5; wait++) await settle();
  expect(server.received).toContainEqual({ type: 'startMatch' });
  // Your board between its walls, with the countdown over it, and Bo's half-block board.
  expect(frame()).toContain('Bo');
  expect(frame()).toMatch(/└─{20}┘/);
  expect(frame()).toMatch(/└─{10}┘/);
});

test('a room that does not exist says so, and Esc goes back to the menu', async () => {
  const server = fakeServer((message) =>
    message.type === 'joinRoom'
      ? [{ type: 'error', code: 'room_not_found', message: 'No room with that code.' }]
      : undefined,
  );
  const { app, frame } = await online(server, { action: 'join', code: 'ZZZZ' });
  expect(frame()).toContain('No room with that code.');
  app.stdin.write(KEYS.escape);
  for (let wait = 0; wait < 3; wait++) await settle();
  expect(frame()).toContain('SHURA');
  expect(frame()).toContain('Single player');
});
