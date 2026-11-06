import type { OnlineSessionState } from '@shura/client-core';
import { afterEach, expect, it, vi } from 'vitest';
import { WaitingView } from '../../../src/screens/online/waiting-view';
import { fakeClock } from '../../support/fake-clock';
import { fakeOnlineSession, lobbyRoom, renderScreen } from '../../support/fake-online-session';
import { settle } from '../../support/ink';
import { KEYS } from '../../support/solo-app';

let unmount: (() => void) | undefined;
afterEach(() => unmount?.());

async function waiting(state: Partial<OnlineSessionState> = { quickMatch: 'queued' }) {
  const session = fakeOnlineSession(state);
  const clock = fakeClock(1_000);
  const onBack = vi.fn();
  const screen = await renderScreen(
    <WaitingView session={session} clock={clock} active onBack={onBack} />,
  );
  unmount = screen.app.unmount;
  return { ...screen, session, clock, onBack };
}

it('shows the time waited, counting up', async () => {
  const { frame, clock } = await waiting();
  expect(frame()).toContain('QUICK MATCH');
  expect(frame()).toContain('Looking for an opponent');
  expect(frame()).toContain('0:00');
  clock.run(12_000, 500);
  await settle();
  expect(frame()).toContain('0:12');
});

it('Esc cancels the queue and goes back', async () => {
  const { type, session, onBack } = await waiting();
  await type(KEYS.escape);
  expect(session.cancelQuickMatch).toHaveBeenCalled();
  expect(onBack).toHaveBeenCalled();
});

it('after the opponent left, says so, and Enter queues again', async () => {
  const { frame, type, session } = await waiting({ quickMatch: 'opponentLeft' });
  expect(frame()).toContain('Opponent left');
  await type(KEYS.enter);
  expect(session.quickMatch).toHaveBeenCalled();
});

it('shows the opponent once paired, before the countdown', async () => {
  const room = lobbyRoom({
    hostId: undefined,
    quickMatch: true,
    players: [
      { id: 'me', nickname: 'Ada', kind: 'guest', seat: 0, ready: false },
      { id: 'bo', nickname: 'Bo', kind: 'bot', seat: 1, ready: false },
    ],
  });
  const { frame } = await waiting({ room });
  expect(frame()).toContain('Opponent found: Bo');
});
