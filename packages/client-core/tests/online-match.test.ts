import { ActionType } from '@shura/engine';
import type { ClientMessageOf } from '@shura/protocol';
import { expect, it } from 'vitest';
import { createInputEngine, DEFAULT_HANDLING } from '../src/index';
import { OnlineMatch } from '../src/online-match';
import { fakeClock } from './support/fake-clock';

/** A 1v1 you play as `me`, frame 0 at time 0, its batches kept in `sent`. */
function match() {
  const clock = fakeClock(0);
  const sent: ClientMessageOf<'inputBatch'>[] = [];
  const online = new OnlineMatch({
    clock,
    mode: '1v1',
    countdown: {
      type: 'countdown',
      startAt: 0,
      seed: 7,
      matchId: 'm',
      players: [
        { id: 'me', index: 0 },
        { id: 'them', index: 1 },
      ],
    },
    playerId: 'me',
    start: 0,
    input: createInputEngine({ handling: DEFAULT_HANDLING }),
    send: (batch) => sent.push(batch),
    changed: () => {},
    heard: () => {},
  });
  return { clock, online, sent };
}

const attack = {
  type: 'garbageQueued',
  id: 3,
  from: 'them',
  to: 'me',
  lines: 2,
  holeSeed: 11,
} as const;

it('receives an attack sent again after a reconnect only once', () => {
  const { clock, online, sent } = match();
  clock.advance(100);
  online.receiveGarbage(attack);
  // Sent again before it was played, and again after: it's still received once.
  online.receiveGarbage(attack);
  clock.advance(100);
  online.receiveGarbage(attack);
  clock.advance(100);
  const received = sent
    .flatMap(({ frames }) => frames.flatMap(({ actions }) => actions))
    .filter(({ type }) => type === ActionType.GarbageReceived);
  expect(received).toEqual([expect.objectContaining({ id: 3, lines: 2, holeSeed: 11 })]);
});
