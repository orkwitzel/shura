import { type Action, ActionType } from '@shura/engine';
import type { ClientMessageOf } from '@shura/protocol';
import { expect, it } from 'vitest';
import versus from '../../engine/recorded-matches/versus-1v1.json';
import { countdownLabel, createInputEngine, DEFAULT_HANDLING } from '../src/index';
import { OnlineMatch } from '../src/online-match';
import { fakeClock } from './support/fake-clock';

/** A 1v1 you play as `me`, frame 0 at time `start` (0), its batches kept in `sent`. */
function match({ seed = 7, start = 0 }: { seed?: number; start?: number } = {}) {
  const clock = fakeClock(0);
  const sent: ClientMessageOf<'inputBatch'>[] = [];
  const online = new OnlineMatch({
    clock,
    mode: '1v1',
    countdown: {
      type: 'countdown',
      startAt: start,
      seed,
      matchId: 'm',
      players: [
        { id: 'me', index: 0 },
        { id: 'them', index: 1 },
      ],
    },
    playerId: 'me',
    start,
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

it("counts the lines each player's locks send, from their relays (the HUD's lines sent)", () => {
  const { online } = match({ seed: versus.seed });
  const theirs = (versus.players[1]?.actions ?? []) as Action[];
  const frames = Array.from({ length: versus.lastFrame }, (_, at) => ({
    frame: at + 1,
    actions: theirs.filter(({ frame }) => frame === at + 1),
  }));
  online.relay({ type: 'relay', playerId: 'them', frames });
  // The recorded match's harness passed 44 lines of theirs on to player 0.
  const them = online.snapshot().players.find(({ playerId }) => playerId === 'them');
  expect(them?.linesSent).toBe(44);
});

it('counts its 3 s countdown a second a step, as countdownLabel reads it', () => {
  const { online } = match();
  expect(online.snapshot()).toMatchObject({ countdownStep: 60 });
});

it('is playing from frame 0, Go: its countdown label says GO there, not 0', () => {
  const { clock, online } = match({ start: 50 });
  expect(online.snapshot()).toMatchObject({ phase: 'countdown', countdown: 3 });
  clock.advance(50);
  const state = online.snapshot();
  expect(state).toMatchObject({ phase: 'playing', countdown: 0 });
  const me = state.players[0];
  if (!me) throw new Error('no game of mine');
  expect(countdownLabel({ ...state, engine: me.engine })).toBe('GO');
  online.stop();
});
