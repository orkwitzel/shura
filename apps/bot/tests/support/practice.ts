import { createInputEngine, frameAt, framesToMs, type KeyEvent } from '@shura/client-core';
import {
  type EngineEvent,
  type EngineState,
  type PieceActionType,
  type ReadonlyEngineState,
  restoreEngine,
} from '@shura/engine';
import { BOT_HANDLING, type PilotClock, type Seat } from '../../src/pilot';

/** One frame of a practice game: the actions the input engine made, and the engine's events. */
export interface PracticeFrame {
  readonly frame: number;
  readonly actions: readonly PieceActionType[];
  readonly events: readonly EngineEvent[];
  /** The active piece after the frame. */
  readonly active: ReadonlyEngineState['active'];
}

/**
 * A game played alone, frame by frame, as an online match plays your own game: key events reach
 * client-core's real input engine at the first frame that starts after their time, with the bot's
 * handling, and its actions reach the real engine. The clock is fake: it moves a frame at a time.
 */
export interface Practice {
  readonly clock: PilotClock;
  readonly seat: Seat;
  readonly frames: readonly PracticeFrame[];
  /** The keys the seat was given, in order. */
  readonly keys: readonly KeyEvent[];
  readonly game: ReadonlyEngineState;
  /** Plays frames until `until` says stop, or `limit` frames have passed. */
  play(until: (frame: PracticeFrame) => boolean, limit?: number): void;
}

/** When frame 0 starts on the practice clock. */
const START = 1_000;

export function practice(state: EngineState): Practice {
  const engine = restoreEngine(structuredClone(state));
  const input = createInputEngine({ handling: BOT_HANDLING });
  let time = START + framesToMs(engine.state.frame);
  let timers: { at: number; callback: () => void }[] = [];
  const waiting: { frame: number; event: KeyEvent }[] = [];
  const keys: KeyEvent[] = [];
  const frames: PracticeFrame[] = [];
  const clock: PilotClock = {
    now: () => time,
    after(ms, callback) {
      const timer = { at: time + ms, callback };
      timers.push(timer);
      return () => {
        timers = timers.filter((other) => other !== timer);
      };
    },
  };
  const seat: Seat = {
    game: () => (engine.state.toppedOut ? null : engine.state),
    key(event) {
      keys.push(event);
      const last = waiting.at(-1)?.frame ?? 0;
      const frame = Math.max(frameAt(event.time - START) + 1, engine.state.frame + 1, last);
      waiting.push({ frame, event });
    },
  };
  const playFrame = (frame: number): PracticeFrame => {
    const startsAt = START + framesToMs(frame);
    for (;;) {
      const due = timers.filter(({ at }) => at <= startsAt).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((other) => other !== due);
      time = due.at;
      due.callback();
    }
    time = startsAt;
    let count = 0;
    while ((waiting[count]?.frame ?? Number.POSITIVE_INFINITY) <= frame) count++;
    const events = waiting.splice(0, count).map(({ event }) => event);
    const actions = input.playFrame(events, engine.state);
    const result = engine.step(
      frame,
      actions.map((type) => ({ frame, type })),
    );
    return { frame, actions, events: result.events, active: { ...engine.state.active } };
  };
  return {
    clock,
    seat,
    frames,
    keys,
    get game() {
      return engine.state;
    },
    play(until, limit = 3_600) {
      for (let played = 0; played < limit && !engine.state.toppedOut; played++) {
        const frame = playFrame(engine.state.frame + 1);
        frames.push(frame);
        if (until(frame)) return;
      }
    },
  };
}

/** Whether a frame locked a piece. */
export const locks = (frame: PracticeFrame): boolean =>
  frame.events.some((event) => event.type === 'lock');
