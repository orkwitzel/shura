import { ActionType, createEngine, type EngineEvent } from '@shura/engine';
import { describe, expect, it } from 'vitest';
import { createSoloSession, SOLO_PRESETS, type SoloMode } from '../src/index';
import { fakeClock } from './support/fake-clock';
import {
  MARATHON_ACTIONS,
  MARATHON_FINISH,
  MARATHON_SEED,
  playRecorded,
  SPRINT_ACTIONS,
  SPRINT_FINISH_FRAME,
  SPRINT_SEED,
  ULTRA_ACTIONS,
  ULTRA_SCORE,
  ULTRA_SEED,
} from './support/recorded-games';

/** The countdown before Go: 90 frames, 1.5 s. */
const COUNTDOWN_MS = 1_500;

/** A Sprint session on a fake clock, with a fixed seed so its pieces are known. */
function sprint() {
  const clock = fakeClock(1_000);
  const session = createSoloSession({ mode: 'sprint', clock, seed: 7 });
  return { clock, session };
}

describe('a session', () => {
  it('plays its mode from the seed it was given', () => {
    const { session } = sprint();
    expect(session.getState()).toMatchObject({ mode: 'sprint', seed: 7, actions: [] });
    expect(session.getState().engine.settings.lineGoal).toBe(40);
  });

  it('without a seed, plays from a fresh one', () => {
    const clock = fakeClock();
    const seeds = Array.from(
      { length: 3 },
      () => createSoloSession({ mode: 'sprint', clock }).getState().seed,
    );
    expect(new Set(seeds).size).toBe(3);
    for (const seed of seeds) expect(seed >>> 0).toBe(seed);
  });
});

describe('the frame', () => {
  it('follows the time since Go, catching up after a late wake', () => {
    const { clock, session } = sprint();
    clock.run(COUNTDOWN_MS);
    expect(session.getState().engine.frame).toBe(0);

    clock.advance(50);
    expect(session.getState().engine.frame).toBe(3);

    // A wake 100 ms late steps the six frames it missed at once.
    clock.advance(100);
    expect(session.getState().engine.frame).toBe(9);

    // A wake partway into a frame steps only the frames that have started.
    clock.advance(10);
    expect(session.getState().engine.frame).toBe(9);
    clock.advance(7);
    expect(session.getState().engine.frame).toBe(10);
  });
});

describe('an action', () => {
  it('stamped inside a frame already stepped, applies at the next frame', () => {
    const { clock, session } = sprint();
    const go = clock.now() + COUNTDOWN_MS;
    clock.run(COUNTDOWN_MS + 100);
    const { col } = session.getState().engine.active;

    // Frame 6 started at 100 ms and is stepped. Its action waits for frame 7.
    session.act(ActionType.MoveLeft, go + 105);
    expect(session.getState().actions).toEqual([]);
    clock.advance(16);
    expect(session.getState().engine.frame).toBe(6);
    expect(session.getState().engine.active.col).toBe(col);

    clock.advance(1);
    expect(session.getState().actions).toEqual([{ frame: 7, type: ActionType.MoveLeft }]);
    expect(session.getState().engine.active.col).toBe(col - 1);
  });

  it('applies at the frame after the one it arrived in, when the wake that steps it is late', () => {
    const { clock, session } = sprint();
    const go = clock.now() + COUNTDOWN_MS;
    clock.run(COUNTDOWN_MS + 100);

    // It arrives in frame 8, and the next wake is in frame 12.
    session.act(ActionType.MoveLeft, go + 140);
    clock.advance(100);
    expect(session.getState().actions).toEqual([{ frame: 9, type: ActionType.MoveLeft }]);
  });

  it('that reaches the session after its frame was stepped, applies at the next frame', () => {
    const { clock, session } = sprint();
    const go = clock.now() + COUNTDOWN_MS;
    clock.run(COUNTDOWN_MS + 100);

    // Stamped in frame 3, three frames before the last one stepped.
    session.act(ActionType.RotateCW, go + 50);
    clock.advance(17);
    expect(session.getState().actions).toEqual([{ frame: 7, type: ActionType.RotateCW }]);
  });

  it('keeps the order actions arrived in within a frame', () => {
    const { clock, session } = sprint();
    const go = clock.now() + COUNTDOWN_MS;
    clock.run(COUNTDOWN_MS + 100);

    session.act(ActionType.MoveLeft, go + 101);
    session.act(ActionType.HardDrop, go + 102);
    clock.advance(17);
    expect(session.getState().actions).toEqual([
      { frame: 7, type: ActionType.MoveLeft },
      { frame: 7, type: ActionType.HardDrop },
    ]);
  });

  it('during the countdown, applies at the first frame after Go', () => {
    const { clock, session } = sprint();
    clock.run(1_000);
    session.act(ActionType.Hold, clock.now());
    clock.run(500);
    expect(session.getState().actions).toEqual([]);

    clock.advance(17);
    expect(session.getState().actions).toEqual([{ frame: 1, type: ActionType.Hold }]);
    expect(session.getState().engine.hold).not.toBeNull();
  });
});

describe('pausing', () => {
  it('for any length of time, then resuming, carries on from the same frame after a countdown', () => {
    const { clock, session } = sprint();
    clock.run(COUNTDOWN_MS + 100);
    clock.advance(10);
    session.pause();
    expect(session.getState().phase).toBe('paused');

    clock.advance(3_600_000);
    expect(session.getState()).toMatchObject({ phase: 'paused', engine: { frame: 6 } });

    session.resume();
    expect(session.getState()).toMatchObject({ phase: 'countdown', countdown: 90 });

    // The start moved forward by the time paused plus the countdown, so the game's time is where
    // it was: 10 ms into frame 6. Go (frame 6) comes 10 ms before the 1.5 s are up, and frame 7
    // when the 1.5 s and the 6.7 ms left of frame 6 are.
    clock.run(COUNTDOWN_MS - 11);
    expect(session.getState()).toMatchObject({ phase: 'countdown', countdown: 1 });
    clock.advance(1);
    expect(session.getState()).toMatchObject({ phase: 'playing', engine: { frame: 6 } });
    clock.advance(16);
    expect(session.getState().engine.frame).toBe(6);
    clock.advance(1);
    expect(session.getState().engine.frame).toBe(7);
  });

  it('steps the frames that started before the pause first', () => {
    const { clock, session } = sprint();
    clock.run(COUNTDOWN_MS + 100);
    // Frames 7 and 8 have started, but no wake has stepped them.
    clock.pass(40);
    session.pause();
    expect(session.getState().engine.frame).toBe(8);
  });

  it('during the countdown starts it again on resuming', () => {
    const { clock, session } = sprint();
    clock.run(1_000);
    session.pause();
    clock.advance(5_000);
    session.resume();
    expect(session.getState()).toMatchObject({ phase: 'countdown', countdown: 90 });
    clock.run(COUNTDOWN_MS);
    expect(session.getState()).toMatchObject({ phase: 'playing', engine: { frame: 0 } });
  });

  it('ignores actions while paused', () => {
    const { clock, session } = sprint();
    clock.run(COUNTDOWN_MS + 100);
    session.pause();
    session.act(ActionType.HardDrop, clock.now());
    session.resume();
    clock.run(COUNTDOWN_MS + 100);
    expect(session.getState().actions).toEqual([]);
  });

  it('notifies subscribers of the pause and the resume', () => {
    const { clock, session } = sprint();
    clock.run(COUNTDOWN_MS + 100);
    const phases: string[] = [];
    session.subscribe(() => phases.push(session.getState().phase));
    session.pause();
    session.resume();
    expect(phases).toEqual(['paused', 'countdown']);
  });
});

describe('restarting', () => {
  it('starts a new game of the same mode through the countdown, with an empty action log', () => {
    const { clock, session } = sprint();
    clock.run(COUNTDOWN_MS + 100);
    session.act(ActionType.HardDrop, clock.now());
    clock.run(100);
    expect(session.getState().engine.piecesPlaced).toBe(1);

    session.restart(9);
    expect(session.getState()).toMatchObject({
      mode: 'sprint',
      seed: 9,
      phase: 'countdown',
      countdown: 90,
      actions: [],
      engine: { frame: 0, piecesPlaced: 0 },
    });
    clock.run(COUNTDOWN_MS);
    expect(session.getState()).toMatchObject({ phase: 'playing', engine: { frame: 0 } });
    clock.advance(17);
    expect(session.getState().engine.frame).toBe(1);
  });

  it('without a seed, plays from a fresh one', () => {
    const { session } = sprint();
    const seeds = new Set([7]);
    for (let i = 0; i < 3; i++) {
      session.restart();
      seeds.add(session.getState().seed);
    }
    expect(seeds.size).toBe(4);
  });

  it('from the menu, starts the new game where the paused one would have resumed', () => {
    const { clock, session } = sprint();
    clock.run(COUNTDOWN_MS + 100);
    session.pause();
    clock.advance(10_000);
    session.restart(7);
    expect(session.getState()).toMatchObject({ phase: 'countdown', countdown: 90 });
    clock.run(COUNTDOWN_MS + 17);
    expect(session.getState()).toMatchObject({ phase: 'playing', engine: { frame: 1 } });
    expect(clock.pending).toBe(1);
  });

  it('after the game ended, wakes again', () => {
    const { clock, session } = sprint();
    clock.run(COUNTDOWN_MS);
    for (let i = 0; i < 30; i++) {
      session.act(ActionType.HardDrop, clock.now());
      clock.advance(17);
    }
    expect(session.getState().phase).toBe('ended');
    expect(clock.pending).toBe(0);

    session.restart(7);
    expect(clock.pending).toBe(1);
    clock.run(COUNTDOWN_MS + 17);
    expect(session.getState()).toMatchObject({
      phase: 'playing',
      engine: { frame: 1, toppedOut: false },
    });
  });

  it('keeps a single wake when restarted mid-game', () => {
    const { clock, session } = sprint();
    clock.run(COUNTDOWN_MS + 100);
    session.restart(7);
    session.restart(7);
    expect(clock.pending).toBe(1);
  });
});

describe('a wake', () => {
  it('30 frames late steps them all', () => {
    const { clock, session } = sprint();
    clock.run(COUNTDOWN_MS + 100);
    clock.advance(500);
    expect(session.getState()).toMatchObject({ phase: 'playing', engine: { frame: 36 } });
  });

  it('more than 30 frames late pauses instead of stepping, and resuming carries on', () => {
    const { clock, session } = sprint();
    clock.run(COUNTDOWN_MS + 100);
    clock.advance(517);
    expect(session.getState()).toMatchObject({ phase: 'paused', engine: { frame: 6 } });
    expect(clock.pending).toBe(0);

    session.resume();
    clock.run(COUNTDOWN_MS);
    expect(session.getState()).toMatchObject({ phase: 'playing', engine: { frame: 6 } });
    clock.advance(17);
    expect(session.getState().engine.frame).toBe(7);
  });

  it('more than 30 frames late in the countdown pauses too', () => {
    const { clock, session } = sprint();
    clock.advance(600);
    expect(session.getState()).toMatchObject({ phase: 'paused', engine: { frame: 0 } });
  });
});

/** Hard drops, one a frame from Go, until the game tops out (12 pieces in one column at most). */
function topOut(mode: SoloMode) {
  const clock = fakeClock(1_000);
  const session = createSoloSession({ mode, clock, seed: 7 });
  clock.run(COUNTDOWN_MS);
  for (let i = 0; i < 30; i++) {
    session.act(ActionType.HardDrop, clock.now());
    clock.advance(17);
  }
  return { clock, session };
}

describe('a Sprint', () => {
  it('runs from the countdown to the finish, its time counted from Go', () => {
    const { session } = playRecorded('sprint', SPRINT_SEED, SPRINT_ACTIONS);

    const state = session.getState();
    expect(state.actions).toEqual(SPRINT_ACTIONS);
    expect(state).toMatchObject({
      phase: 'ended',
      engine: { finished: true, linesCleared: 40, frame: SPRINT_FINISH_FRAME },
    });
  });

  it('stops waking once the game ends, and ignores pause and resume', () => {
    const { clock, session } = topOut('sprint');
    expect(session.getState()).toMatchObject({ phase: 'ended', engine: { toppedOut: true } });
    expect(clock.pending).toBe(0);

    const ended = session.getState();
    session.pause();
    session.resume();
    expect(session.getState()).toBe(ended);
  });
});

describe('a Marathon', () => {
  it('plays 15 levels of 10 lines, from level 1', () => {
    const session = createSoloSession({ mode: 'marathon', clock: fakeClock(), seed: 7 });
    expect(session.getState()).toMatchObject({ mode: 'marathon', engine: { level: 1 } });
    expect(session.getState().engine.settings).toMatchObject({
      lineGoal: 150,
      linesPerLevel: 10,
      frameLimit: null,
    });
    expect(session.getState().engine.settings.gravity.speeds).toHaveLength(15);
  });

  it('runs to the lock that clears 150 lines, at level 15', () => {
    const { clock, session } = playRecorded('marathon', MARATHON_SEED, MARATHON_ACTIONS);
    expect(session.getState().actions).toEqual(MARATHON_ACTIONS);
    expect(session.getState()).toMatchObject({
      phase: 'ended',
      engine: {
        finished: true,
        toppedOut: false,
        linesCleared: 150,
        level: 15,
        frame: MARATHON_FINISH.frame,
        score: MARATHON_FINISH.score,
      },
    });
    expect(clock.pending).toBe(0);
  });

  it('ends at a top-out, unfinished', () => {
    const { clock, session } = topOut('marathon');
    expect(session.getState()).toMatchObject({
      phase: 'ended',
      engine: { toppedOut: true, finished: false },
    });
    expect(clock.pending).toBe(0);
  });
});

describe('an Ultra', () => {
  it('plays 2 minutes at level 1', () => {
    const session = createSoloSession({ mode: 'ultra', clock: fakeClock(), seed: 7 });
    expect(session.getState()).toMatchObject({ mode: 'ultra', engine: { level: 1 } });
    expect(session.getState().engine.settings).toMatchObject({
      frameLimit: 7_200,
      lineGoal: null,
      linesPerLevel: null,
    });
  });

  it('runs to the end of frame 7,200, counting an action in that frame', () => {
    const { clock, session } = playRecorded('ultra', ULTRA_SEED, ULTRA_ACTIONS);
    expect(session.getState().actions).toEqual(ULTRA_ACTIONS);
    expect(ULTRA_ACTIONS.at(-1)).toEqual({ frame: 7_200, type: ActionType.HardDrop });
    expect(session.getState()).toMatchObject({
      phase: 'ended',
      engine: { finished: true, toppedOut: false, frame: 7_200, score: ULTRA_SCORE, level: 1 },
    });
    expect(clock.pending).toBe(0);
  });

  it('ends at a top-out before 2:00, unfinished', () => {
    const { session } = topOut('ultra');
    expect(session.getState()).toMatchObject({
      phase: 'ended',
      engine: { toppedOut: true, finished: false },
    });
    expect(session.getState().engine.frame).toBeLessThan(7_200);
  });
});

describe('the store', () => {
  it('notifies subscribers after each step, with a new state', () => {
    const { clock, session } = sprint();
    clock.run(COUNTDOWN_MS);
    const frames: number[] = [];
    const unsubscribe = session.subscribe(() => frames.push(session.getState().engine.frame));

    clock.advance(17);
    clock.advance(50);
    expect(frames).toEqual([1, 4]);

    unsubscribe();
    clock.advance(17);
    expect(frames).toEqual([1, 4]);
  });

  it('keeps the same state object between notifications', () => {
    const { clock, session } = sprint();
    clock.run(COUNTDOWN_MS + 17);
    const before = session.getState();
    expect(session.getState()).toBe(before);

    // A wake inside the same frame steps nothing and changes nothing.
    clock.advance(1);
    expect(session.getState()).toBe(before);

    clock.advance(17);
    expect(session.getState()).not.toBe(before);
  });
});

describe('engine events', () => {
  it('reach listeners once each, in frame order: a whole game’s, as the engine reports them', () => {
    const heard: EngineEvent[][] = [];
    const { session } = playRecorded('sprint', SPRINT_SEED, SPRINT_ACTIONS, (playing) =>
      playing.onEvents((events) => heard.push([...events])),
    );
    expect(session.getState().phase).toBe('ended');
    // The engine on its own, stepped to the end in one go, reports the game's events.
    const engine = createEngine(SOLO_PRESETS.sprint, SPRINT_SEED, 0);
    const expected = engine.step(SPRINT_FINISH_FRAME, SPRINT_ACTIONS).events;
    expect(expected.filter(({ type }) => type === 'lock').length).toBeGreaterThan(100);
    expect(heard.flat()).toEqual(expected);
    for (const events of heard) expect(events.length).toBeGreaterThan(0);
  });

  it('of a late wake that steps several frames reach listeners together, in frame order', () => {
    const { clock, session } = sprint();
    const heard: EngineEvent[][] = [];
    session.onEvents((events) => heard.push([...events]));
    clock.run(COUNTDOWN_MS + 100);
    // Two hard drops, at frames 7 and 9, that no wake has stepped yet: one late wake steps both.
    session.act(ActionType.HardDrop, clock.now());
    clock.pass(34);
    session.act(ActionType.HardDrop, clock.now());
    clock.advance(66);
    expect(heard).toHaveLength(1);
    expect(heard[0]?.map(({ type, frame }) => [type, frame])).toEqual([
      ['hardDrop', 7],
      ['lock', 7],
      ['hardDrop', 9],
      ['lock', 9],
    ]);
  });

  it('never come during the countdown or while paused', () => {
    const { clock, session } = sprint();
    const heard: EngineEvent[] = [];
    session.onEvents((events) => heard.push(...events));
    // An action that arrives in the countdown waits for frame 1: the engine doesn't step before Go.
    session.act(ActionType.HardDrop, clock.now());
    clock.run(COUNTDOWN_MS - 1);
    expect(heard).toEqual([]);

    clock.run(101);
    expect(heard.map(({ type, frame }) => [type, frame])).toEqual([
      ['hardDrop', 1],
      ['lock', 1],
    ]);
    heard.length = 0;

    session.pause();
    session.act(ActionType.HardDrop, clock.now());
    clock.run(3_000);
    session.resume();
    clock.run(COUNTDOWN_MS - 1);
    expect(heard).toEqual([]);

    session.act(ActionType.HardDrop, clock.now());
    clock.run(100);
    expect(heard.map(({ type }) => type)).toEqual(['hardDrop', 'lock']);
  });

  it('of the frames a pause steps reach listeners at the pause', () => {
    const { clock, session } = sprint();
    const heard: EngineEvent[] = [];
    session.onEvents((events) => heard.push(...events));
    clock.run(COUNTDOWN_MS + 100);
    session.act(ActionType.HardDrop, clock.now());
    clock.pass(20);
    session.pause();
    expect(heard.map(({ type, frame }) => [type, frame])).toEqual([
      ['hardDrop', 7],
      ['lock', 7],
    ]);
  });

  it('stop reaching a listener once it is removed', () => {
    const { clock, session } = sprint();
    const heard: EngineEvent[] = [];
    const unsubscribe = session.onEvents((events) => heard.push(...events));
    clock.run(COUNTDOWN_MS + 100);
    unsubscribe();
    session.act(ActionType.HardDrop, clock.now());
    clock.run(100);
    expect(session.getState().engine.piecesPlaced).toBe(1);
    expect(heard).toEqual([]);
  });
});

describe('applied actions', () => {
  it('reach listeners after each wake, with their frames: the input engine’s auto-shift too', () => {
    const { clock, session } = sprint();
    const heard: { frame: number; type: string }[][] = [];
    const unsubscribe = session.onActions((actions) => heard.push([...actions]));
    clock.run(COUNTDOWN_MS);
    // Held from frame 1: one move at once, then DAS (10 frames) and a move every 2 (ARR).
    session.key({ action: ActionType.MoveLeft, kind: 'press', time: clock.now() });
    clock.run(250);
    const moves = heard.flat();
    expect(moves.map(({ frame }) => frame)).toEqual([1, 11, 13, 15]);
    expect(new Set(moves.map(({ type }) => type))).toEqual(new Set([ActionType.MoveLeft]));
    // Each wake passes on only the actions it applied: none hears an empty list.
    expect(heard.every((actions) => actions.length > 0)).toBe(true);
    unsubscribe();
    session.key({ action: ActionType.HardDrop, kind: 'press', time: clock.now() });
    clock.run(100);
    expect(heard.flat()).toHaveLength(4);
  });
});

describe('the countdown', () => {
  it('counts down the 90 frames before Go without stepping the engine', () => {
    const { clock, session } = sprint();
    expect(session.getState()).toMatchObject({ phase: 'countdown', countdown: 90 });

    clock.run(500);
    expect(session.getState()).toMatchObject({ phase: 'countdown', countdown: 60 });
    expect(session.getState().engine.frame).toBe(0);

    clock.run(999);
    expect(session.getState()).toMatchObject({ phase: 'countdown', countdown: 1 });
    expect(session.getState().engine.frame).toBe(0);

    // Go is frame 0.
    clock.advance(1);
    expect(session.getState()).toMatchObject({ phase: 'playing', countdown: 0 });
    expect(session.getState().engine.frame).toBe(0);
  });
});
