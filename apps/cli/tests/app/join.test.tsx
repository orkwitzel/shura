import { createOnlineSession, type OnlineSession } from '@shura/client-core';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { App } from '../../src/app/app';
import { runCommand } from '../../src/app/commands';
import { onlineNetwork } from '../../src/app/run';
import { terminalClock } from '../../src/platform/clock';
import { nodeConnect } from '../../src/platform/web-socket';
import { resize } from '../support/ink';
import { type OnlineServers, startOnlineServers } from '../support/online-servers';
import { memoryStores } from '../support/stores';

let servers: OnlineServers;
let cleanups: (() => void)[] = [];
beforeEach(async () => {
  servers = await startOnlineServers();
});
afterEach(async () => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
  await servers.close();
});

/** Waits, in real time, until `check` passes, or fails with its last error after `ms`. */
async function eventually(check: () => void, ms = 5_000): Promise<void> {
  const until = Date.now() + ms;
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

/** A host in a new 1v1 room: client-core's online session over a real socket. */
async function host(nickname: string): Promise<{ session: OnlineSession; code: string }> {
  const session = createOnlineSession({
    serverUrl: servers.url,
    connect: nodeConnect,
    clock: terminalClock(),
    nickname,
    clientVersion: 'test',
  });
  cleanups.push(() => session.close());
  session.createRoom('1v1');
  let code = '';
  await eventually(() => {
    code = session.getState().room?.code ?? '';
    expect(code).not.toBe('');
  });
  return { session, code };
}

test('shura join <CODE> joins the room on the real server and shows its lobby', async () => {
  const { session, code } = await host('Mira');
  let frame = () => '';
  const exitCode = await runCommand(
    ['join', code.toLowerCase(), '--server', servers.url, '--name', 'Ada'],
    {
      out: () => {},
      err: () => {},
      // What `runApp` does, in a test terminal: the app with Node's socket and `fetch`.
      async play(options) {
        const clock = terminalClock();
        const app = render(
          <App
            clock={clock}
            colors="none"
            online={{ ...onlineNetwork(options, undefined, {}), connect: nodeConnect, clock }}
            {...(options.online && { start: options.online })}
            {...memoryStores()}
          />,
        );
        cleanups.unshift(() => app.unmount());
        resize(app, 100, 30);
        frame = () => app.lastFrame() ?? '';
        return 0;
      },
    },
  );
  expect(exitCode).toBe(0);
  await eventually(() => {
    expect(frame()).toContain(`ROOM ${code}`);
    expect(frame()).toMatch(/Mira\s+guest\s+host/);
    expect(frame()).toMatch(/› Ada \(you\)\s+guest\s+not ready/);
  });
  // The host sees the CLI come in, as the server tells it.
  await eventually(() => {
    expect(session.getState().room?.players.map(({ nickname }) => nickname)).toEqual([
      'Mira',
      'Ada',
    ]);
  });
});
