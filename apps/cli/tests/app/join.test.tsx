import type { Connect } from '@shura/client-core';
import type { ServerMessageOf } from '@shura/protocol';
import { render } from 'ink-testing-library';
import { afterEach, expect, test } from 'vitest';
import { App } from '../../src/app/app';
import { runCommand } from '../../src/app/commands';
import { onlineNetwork } from '../../src/app/run';
import { fakeClock } from '../support/fake-clock';
import { fakeServer } from '../support/fake-server';
import { resize, settle } from '../support/ink';
import { memoryStores } from '../support/stores';

let unmount: (() => void) | undefined;
afterEach(() => unmount?.());

/** Mira's 1v1 room, after Ada (`me`) joins it. */
const ROOM: ServerMessageOf<'roomState'> = {
  type: 'roomState',
  code: 'K7QX',
  mode: '1v1',
  hostId: 'mira',
  phase: 'lobby',
  players: [
    { id: 'mira', nickname: 'Mira', kind: 'guest', seat: 0, ready: false },
    { id: 'me', nickname: 'Ada', kind: 'guest', seat: 1, ready: false },
  ],
  spectators: [],
};

test('shura join <CODE> says hello to --server with --name, joins the room and shows its lobby', async () => {
  const server = fakeServer((message) => (message.type === 'joinRoom' ? [ROOM] : undefined));
  const urls: string[] = [];
  const connect: Connect = (url, handlers) => {
    urls.push(url);
    return server.connect(url, handlers);
  };
  let frame = () => '';
  const exitCode = await runCommand(
    ['join', 'k7qx', '--server', 'ws://shura.test', '--name', 'Ada'],
    {
      out: () => {},
      err: () => {},
      async play(options) {
        const clock = fakeClock(1_000);
        const app = render(
          <App
            clock={clock}
            colors="none"
            online={{ ...onlineNetwork(options, undefined, {}), connect, clock }}
            {...(options.online && { start: options.online })}
            {...memoryStores()}
          />,
        );
        unmount = app.unmount;
        resize(app, 100, 30);
        frame = () => app.lastFrame() ?? '';
        return 0;
      },
    },
  );
  expect(exitCode).toBe(0);
  for (let at = 0; at < 5; at++) await settle();
  expect(urls).toEqual(['ws://shura.test']);
  expect(server.received[0]).toMatchObject({ type: 'hello', nickname: 'Ada' });
  expect(server.received).toContainEqual({ type: 'joinRoom', code: 'K7QX' });
  expect(frame()).toContain('ROOM K7QX');
  expect(frame()).toMatch(/Mira\s+guest\s+host/);
  expect(frame()).toMatch(/› Ada \(you\)\s+guest\s+not ready/);
});
