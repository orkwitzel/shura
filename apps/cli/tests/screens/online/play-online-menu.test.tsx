import type { OnlineSessionState } from '@shura/client-core';
import { afterEach, expect, it, vi } from 'vitest';
import { PlayOnlineMenu } from '../../../src/screens/online/play-online-menu';
import { fakeClock } from '../../support/fake-clock';
import { fakeOnlineSession, renderScreen } from '../../support/fake-online-session';
import { KEYS } from '../../support/solo-app';

let unmount: (() => void) | undefined;
afterEach(() => unmount?.());

const SERVER = 'ws://localhost:8080';

async function menu(state: Partial<OnlineSessionState> = {}, message: string | null = null) {
  const session = fakeOnlineSession(state);
  const onStart = vi.fn();
  const onRetry = vi.fn();
  const onBack = vi.fn();
  const screen = await renderScreen(
    <PlayOnlineMenu
      session={session}
      server={SERVER}
      clock={fakeClock()}
      active
      message={message}
      onStart={onStart}
      onRetry={onRetry}
      onBack={onBack}
    />,
  );
  unmount = screen.app.unmount;
  return { ...screen, session, onStart, onRetry, onBack };
}

it('lists Quick match, Create room, Join room and Back, the cursor on Quick match', async () => {
  const { frame, type, onStart } = await menu();
  expect(frame()).toContain('PLAY ONLINE');
  expect(frame()).toMatch(/› Quick match/);
  expect(frame()).toContain('Create room');
  expect(frame()).toContain('Join room');
  expect(frame()).toContain('Back');
  await type(KEYS.enter);
  expect(onStart).toHaveBeenCalledWith({ action: 'quick' });
});

it('creates a 1v1 or an FFA room', async () => {
  const { frame, type, onStart } = await menu();
  await type(KEYS.down, KEYS.enter);
  expect(frame()).toContain('CREATE ROOM');
  expect(frame()).toMatch(/› 1v1/);
  await type(KEYS.down, KEYS.enter);
  expect(onStart).toHaveBeenCalledWith({ action: 'create', mode: 'ffa' });
});

it('joins by a typed code, uppercased, with the removed characters refused as typed', async () => {
  const { frame, type, onStart } = await menu();
  await type(KEYS.down, KEYS.down, KEYS.enter);
  expect(frame()).toContain('JOIN ROOM');
  // O, 1 and L are not in codes: they never appear.
  await type(...['k', 'o', '7', '1', 'q', 'l', 'x'].map(KEYS.letter));
  expect(frame()).toContain('K7QX');
  expect(frame()).not.toMatch(/K7QX.*[OL1]/);
  await type(KEYS.enter);
  expect(onStart).toHaveBeenCalledWith({ action: 'join', code: 'K7QX' });
});

it("doesn't join with a code that is too short, and Backspace takes a character back", async () => {
  const { frame, type, onStart } = await menu();
  await type(KEYS.down, KEYS.down, KEYS.enter);
  await type(KEYS.letter('k'), KEYS.letter('7'), '\x7f');
  expect(frame()).toMatch(/K[^7]/);
  await type(KEYS.enter);
  expect(onStart).not.toHaveBeenCalled();
});

it('Esc goes back a page, then out of Play online', async () => {
  const { frame, type, onBack } = await menu();
  await type(KEYS.down, KEYS.enter, KEYS.escape);
  expect(frame()).toContain('PLAY ONLINE');
  expect(onBack).not.toHaveBeenCalled();
  await type(KEYS.escape);
  expect(onBack).toHaveBeenCalled();
});

it('shows "Connecting…" while it connects', async () => {
  const { frame } = await menu({ connection: { status: 'connecting' } });
  expect(frame()).toContain('Connecting…');
});

it("says it can't reach the server, with the URL, and offers Retry", async () => {
  const { frame, type, onRetry } = await menu({
    connection: { status: 'failed', reason: 'unreachable', message: "Can't reach the server." },
  });
  expect(frame()).toContain("Can't reach the server");
  expect(frame()).toContain(SERVER);
  expect(frame()).toMatch(/› Retry/);
  expect(frame()).not.toContain('Quick match');
  await type(KEYS.enter);
  expect(onRetry).toHaveBeenCalled();
});

it("shows the server's error in plain words", async () => {
  const { frame } = await menu({}, 'No room with that code.');
  expect(frame()).toContain('No room with that code.');
});
