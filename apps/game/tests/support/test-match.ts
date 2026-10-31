import { ActionType } from '@shura/engine';
import { COUNTDOWN_MS, type RoomMode, type ServerMessage } from '@shura/protocol';
import { createMemoryStores } from '@shura/valkey';
import { pino } from 'pino';
import { type FrameActions, Match } from '../../src/match';
import { type FakeClock, fakeClock } from './fake-clock';

/** When the match was started: its countdown runs from here, and frame 0 is `COUNTDOWN_MS` on. */
export const STARTED = 1_800_000_000_000;
export const START_AT = STARTED + COUNTDOWN_MS;

/** The first server time at which `frame` is the expected frame (design §8.4). */
export function timeOf(frame: number): number {
  return START_AT + Math.ceil((frame * 1000) / 60);
}

/** Frames `from` to `to`, with a hard drop at each frame that is a multiple of `dropEvery`. */
export function framesOf(from: number, to: number, dropEvery?: number): FrameActions[] {
  const frames: FrameActions[] = [];
  for (let frame = from; frame <= to; frame++) {
    const drop = dropEvery !== undefined && frame % dropEvery === 0;
    frames.push({ frame, actions: drop ? [{ frame, type: ActionType.HardDrop }] : [] });
  }
  return frames;
}

/** A message the match sent, and who to. */
export interface Sent {
  readonly to: string;
  readonly message: ServerMessage;
}

/**
 * A match on a fake clock, as a room runs it, with every message it sends kept in order and each
 * player's batches numbered for them.
 */
export interface TestMatch {
  readonly match: Match;
  readonly clock: FakeClock;
  readonly sent: Sent[];
  /** Sends `playerId`'s next input batch. */
  send(playerId: string, frames: FrameActions[]): void;
  /** Appends to the match log and waits for it, so the batches verified so far are acknowledged. */
  logged(): Promise<void>;
  /** The `playerOut` and `matchEnd` messages sent to the room so far. */
  outcomes(): ServerMessage[];
}

export function testMatch(players: readonly string[], mode: RoomMode = '1v1'): TestMatch {
  const clock = fakeClock(STARTED);
  const sent: Sent[] = [];
  const seqs = new Map<string, number>();
  const match = new Match({
    matchId: 'match-1',
    mode,
    seed: 42,
    players: players.map((id) => ({ id, nickname: id })),
    clock,
    startAt: START_AT,
    epoch: 1,
    log: createMemoryStores().matchLog,
    logger: pino({ level: 'silent' }),
    output: {
      toPlayer: (id, message) => sent.push({ to: id, message }),
      toOthers: (id, message) => sent.push({ to: `not ${id}`, message }),
      toRoom: (message) => sent.push({ to: 'room', message }),
      ended: () => {},
    },
  });
  return {
    match,
    clock,
    sent,
    send(playerId, frames) {
      const seq = seqs.get(playerId) ?? 0;
      seqs.set(playerId, seq + 1);
      match.receive(playerId, { type: 'inputBatch', seq, frames });
    },
    async logged() {
      match.appendLog();
      await new Promise((resolve) => setImmediate(resolve));
    },
    outcomes: () =>
      sent
        .filter(({ to, message }) => to === 'room' && message.type !== 'relay')
        .map(({ message }) => message),
  };
}
