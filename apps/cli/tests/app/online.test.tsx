import type { ServerMessage, ServerMessageOf } from '@shura/protocol';
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

/** Lets the session's POST, the socket and the renders go round. */
async function waitABit() {
  for (let wait = 0; wait < 8; wait++) await settle();
}

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
        server: 'http://test',
        nickname: 'Ada',
        clientVersion: 'test',
        connect: server.connect,
        fetch: server.fetch,
        clock,
      }}
      onExit={onExit}
      {...memoryStores()}
    />,
  );
  unmount = app.unmount;
  resize(app, 100, 30);
  await waitABit();
  return { app, clock, onExit, frame: () => app.lastFrame() ?? '' };
}

test('a version mismatch at POST /api/sessions quits with 1 and npm i -g shura@latest', async () => {
  const server = fakeServer({
    session: { status: 426, body: { code: 'version_mismatch', message: 'Update.' } },
  });
  const { onExit } = await online(server);
  expect(onExit).toHaveBeenCalledWith(1, VERSION_MISMATCH_MESSAGE);
  expect(VERSION_MISMATCH_MESSAGE).toContain('npm i -g shura@latest');
  expect(server.received).toEqual([]);
});

test('a version mismatch at hello quits the same way (design §8.3)', async () => {
  const server = fakeServer({
    reply: (message) =>
      message.event === 'hello' ? [exception('version_mismatch', 'Update.')] : undefined,
  });
  const { onExit } = await online(server);
  expect(onExit).toHaveBeenCalledWith(1, VERSION_MISMATCH_MESSAGE);
});

test('shura create creates the session with the nickname, the room, and shows its lobby', async () => {
  const server = fakeServer({
    reply: (message) => (message.event === 'createRoom' ? [ROOM] : undefined),
  });
  const { frame } = await online(server);
  expect(server.sessions).toEqual([{ nickname: 'Ada' }]);
  expect(server.received[0]).toMatchObject({ event: 'hello', data: { sessionToken: 't' } });
  expect(server.received).toContainEqual({ event: 'createRoom', data: { mode: '1v1' } });
  expect(frame()).toContain('ROOM K7QX');
  expect(frame()).toMatch(/Ada \(host\)/);
  expect(frame()).toMatch(/Bo\s+ready/);
  expect(frame()).toContain('Enter start');
});

test('shura join joins the room by its code', async () => {
  const server = fakeServer({
    reply: (message) => (message.event === 'joinRoom' ? [ROOM] : undefined),
  });
  const { frame } = await online(server, { action: 'join', code: 'K7QX' });
  expect(server.received).toContainEqual({ event: 'joinRoom', data: { code: 'K7QX' } });
  expect(frame()).toContain('ROOM K7QX');
});

test("Enter is the host's Start, and the match shows both boards", async () => {
  const server = fakeServer({
    reply: (message) => {
      if (message.event === 'createRoom') return [ROOM];
      if (message.event === 'startMatch') {
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
      }
      return undefined;
    },
  });
  const { app, frame } = await online(server);
  app.stdin.write(KEYS.enter);
  await waitABit();
  expect(server.received).toContainEqual({ event: 'startMatch', data: {} });
  // Your board between its walls, with the countdown over it, and Bo's half-block board.
  expect(frame()).toContain('Bo');
  expect(frame()).toMatch(/└─{20}┘/);
  expect(frame()).toMatch(/└─{10}┘/);
});

test('a room that does not exist says so, and Esc goes back to the menu', async () => {
  const server = fakeServer({
    reply: (message) =>
      message.event === 'joinRoom'
        ? [exception('room_not_found', 'No room with that code.')]
        : undefined,
  });
  const { app, frame } = await online(server, { action: 'join', code: 'ZZZZ' });
  expect(frame()).toContain('No room with that code.');
  app.stdin.write(KEYS.escape);
  await waitABit();
  expect(frame()).toContain('Single player');
});

test('a limit refusal reads in plain words (design §11)', async () => {
  const server = fakeServer({
    reply: (message) =>
      message.event === 'createRoom' ? [exception('room_limit', 'room_limit')] : undefined,
  });
  const { frame } = await online(server);
  expect(frame()).toContain('Too many rooms created. Try again in a minute.');
});

test('a connection refused at the door says why in plain words', async () => {
  const server = fakeServer({
    reply: (message) =>
      message.event === 'hello'
        ? [exception('too_many_connections', 'too_many_connections')]
        : undefined,
  });
  const { frame } = await online(server);
  expect(frame()).toContain('Too many connections from your network. Try again in a minute.');
});
