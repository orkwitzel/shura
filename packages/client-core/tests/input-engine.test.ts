import {
  ActionType,
  canMove,
  createEngine,
  MARATHON,
  type PieceActionType,
  restoreEngine,
  SPRINT,
} from '@shura/engine';
import { describe, expect, it } from 'vitest';
import {
  createInputEngine,
  createSoloSession,
  DEFAULT_HANDLING,
  type KeyEvent,
  type SoloSessionOptions,
} from '../src/index';
import { fakeClock } from './support/fake-clock';

/** The countdown before Go: 90 frames, 1.5 s. */
const COUNTDOWN_MS = 1_500;

const { MoveLeft, MoveRight } = ActionType;

/**
 * A Sprint session on a fake clock, with a fixed seed, and helpers that press and release keys so
 * they reach the input engine at a chosen frame.
 */
function game(input: Pick<SoloSessionOptions, 'handling' | 'autoShift'> = {}) {
  const clock = fakeClock(1_000);
  const session = createSoloSession({ mode: 'sprint', clock, seed: 7, ...input });
  const go = clock.now() + COUNTDOWN_MS;

  /** A key event 1 ms into frame `frame` − 1, so the input engine takes it at `frame`. */
  function key(kind: KeyEvent['kind'], action: PieceActionType, frame: number): void {
    const time = go + ((frame - 1) * 1000) / 60 + 1;
    clock.run(time - clock.now());
    session.key({ action, kind, time });
  }

  return {
    clock,
    session,
    press: (action: PieceActionType, frame: number) => key('press', action, frame),
    release: (action: PieceActionType, frame: number) => key('release', action, frame),
    repeat: (action: PieceActionType, frame: number) => key('repeat', action, frame),
    /** Plays on to the end of `frame`. */
    playTo(frame: number) {
      clock.run(go + (frame * 1000) / 60 + 1 - clock.now());
    },
    /** The frames of the actions of `type` the game applied. */
    framesOf(type: PieceActionType): number[] {
      return session
        .getState()
        .actions.filter((action) => action.type === type)
        .map(({ frame }) => frame);
    },
  };
}

describe('a direction key', () => {
  it('tapped moves the piece once, at the frame after it was pressed in', () => {
    const { session, press, release, playTo, framesOf } = game();
    const { col } = session.getState().engine.active;
    press(MoveLeft, 10);
    release(MoveLeft, 12);
    playTo(40);
    expect(framesOf(MoveLeft)).toEqual([10]);
    expect(session.getState().engine.active.col).toBe(col - 1);
  });

  // Seed 7's first piece is an O in columns 4 and 5: four moves from either wall.
  it('held moves once, then again after DAS (10 frames), then every ARR (2 frames) to the wall', () => {
    const { session, press, playTo, framesOf } = game();
    press(MoveLeft, 10);
    playTo(60);
    expect(framesOf(MoveLeft)).toEqual([10, 20, 22, 24]);
    expect(session.getState().engine.active.col).toBe(0);
  });

  it.each([
    { das: 10, arr: 1, frames: [10, 20, 21, 22] },
    { das: 10, arr: 3, frames: [10, 20, 23, 26] },
    { das: 10, arr: 5, frames: [10, 20, 25, 30] },
    { das: 6, arr: 2, frames: [10, 16, 18, 20] },
    // ARR 0 moves to the wall in one frame.
    { das: 10, arr: 0, frames: [10, 20, 20, 20] },
    // DAS 0 starts auto-repeat at the press.
    { das: 0, arr: 2, frames: [10, 12, 14, 16] },
    { das: 0, arr: 0, frames: [10, 10, 10, 10] },
  ])('with DAS $das and ARR $arr moves at frames $frames', ({ das, arr, frames }) => {
    const { session, press, playTo, framesOf } = game({ handling: { das, arr } });
    press(MoveRight, 10);
    playTo(60);
    expect(framesOf(MoveRight)).toEqual(frames);
    expect(session.getState().engine.active.col).toBe(8);
  });

  it('released stops auto-repeat', () => {
    const { session, press, release, playTo, framesOf } = game();
    press(MoveLeft, 10);
    release(MoveLeft, 21);
    playTo(60);
    expect(framesOf(MoveLeft)).toEqual([10, 20]);
    expect(session.getState().engine.active.col).toBe(2);
  });

  it('released and pressed again starts DAS again', () => {
    const { press, release, playTo, framesOf } = game();
    press(MoveLeft, 10);
    release(MoveLeft, 19);
    press(MoveLeft, 22);
    playTo(60);
    expect(framesOf(MoveLeft)).toEqual([10, 22, 32, 34]);
  });
});

describe('soft drop', () => {
  it('at ×20 and 1 row/s, drops one row every 3 frames while held, from the press', () => {
    const { press, release, playTo, framesOf } = game();
    press(ActionType.SoftDrop, 10);
    release(ActionType.SoftDrop, 30);
    playTo(60);
    expect(framesOf(ActionType.SoftDrop)).toEqual([10, 13, 16, 19, 22, 25, 28]);
  });

  it('at ×5 and 1 row/s, drops one row every 12 frames', () => {
    const { press, release, playTo, framesOf } = game({ handling: { softDropFactor: 5 } });
    press(ActionType.SoftDrop, 10);
    release(ActionType.SoftDrop, 50);
    playTo(60);
    expect(framesOf(ActionType.SoftDrop)).toEqual([10, 22, 34, 46]);
  });

  // Seed 7's O spawns in rows 19 and 20 (counting from 0), 19 rows above the floor.
  it('instant drops the piece to the stack in one frame, with no drop that fails', () => {
    const { session, press, playTo, framesOf } = game({ handling: { softDropFactor: 'instant' } });
    press(ActionType.SoftDrop, 10);
    playTo(20);
    expect(framesOf(ActionType.SoftDrop)).toEqual(Array(19).fill(10));
    expect(session.getState().engine.active.row).toBe(1);
  });

  it('held on the stack makes no drop that fails, and carries on with the next piece', () => {
    const { session, press, playTo, framesOf } = game();
    press(ActionType.SoftDrop, 10);
    playTo(200);
    // Each soft drop that moves the piece scores 1, and nothing else scores here.
    const { score, piecesPlaced } = session.getState().engine;
    expect(piecesPlaced).toBe(2);
    expect(score).toBe(framesOf(ActionType.SoftDrop).length);
  });
});

describe('the soft-drop rate', () => {
  /**
   * The soft drops each frame makes in a Marathon game at `level`, played straight through the input
   * engine, with soft drop pressed before frame 1.
   */
  function softDropsByFrame(level: number, frames: number): number[] {
    const engine = restoreEngine({ ...createEngine(MARATHON, 7, 0).serialize(), level });
    const input = createInputEngine();
    const counts: number[] = [];
    for (let frame = 1; frame <= frames; frame++) {
      const events: KeyEvent[] =
        frame === 1 ? [{ action: ActionType.SoftDrop, kind: 'press', time: 0 }] : [];
      const actions = input.playFrame(events, engine.state);
      engine.step(
        frame,
        actions.map((type) => ({ frame, type })),
      );
      counts.push(actions.filter((type) => type === ActionType.SoftDrop).length);
    }
    return counts;
  }

  it.each([
    // 1 row/s ×20: a row every 3 frames.
    { level: 1, drops: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0] },
    // 82,643 sub-rows a frame ×20: 0.42 rows a frame.
    { level: 2, drops: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1] },
    // 138,633 ×20: 0.71 rows a frame.
    { level: 4, drops: [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1] },
  ])('follows Marathon gravity at level $level', ({ level, drops }) => {
    expect(softDropsByFrame(level, 11)).toEqual(drops);
  });

  it('makes several soft drops a frame when gravity times the factor is more than a row', () => {
    // Level 10's 1,021,580 sub-rows a frame ×20 is 5.2 rows a frame.
    expect(softDropsByFrame(10, 4)).toEqual([1, 5, 5, 5]);
  });
});

describe('the countdown', () => {
  // Go is frame 0, the state the game starts from, so frame 1 is the first frame played.
  it('charges a direction held through it, which auto-shifts as the game starts', () => {
    const { session, press, playTo, framesOf } = game();
    press(MoveLeft, -30);
    playTo(20);
    expect(framesOf(MoveLeft)).toEqual([1, 3, 5, 7]);
    expect(session.getState().engine.active.col).toBe(0);
  });

  it('at ARR 0, shifts a direction held through it to the wall in the first frame', () => {
    const { press, playTo, framesOf } = game({ handling: { arr: 0 } });
    press(MoveRight, -11);
    playTo(20);
    expect(framesOf(MoveRight)).toEqual([1, 1, 1, 1]);
  });

  it('does not move for a direction pressed too late to charge, until DAS is charged', () => {
    const { press, playTo, framesOf } = game();
    press(MoveLeft, -4);
    playTo(20);
    expect(framesOf(MoveLeft)).toEqual([6, 8, 10, 12]);
  });

  it('ignores a turn, hold or hard drop pressed in it', () => {
    const { session, press, playTo } = game();
    press(ActionType.RotateCW, -10);
    press(ActionType.HardDrop, -5);
    press(ActionType.Hold, 0);
    playTo(20);
    expect(session.getState().actions).toEqual([]);
  });
});

describe('ARR 0', () => {
  it('pins each new piece to the wall while the direction is held, with no move that fails', () => {
    const { session, press, release, playTo } = game({ handling: { arr: 0 } });
    press(MoveLeft, 5);
    for (let drop = 30; drop <= 150; drop += 20) {
      press(ActionType.HardDrop, drop);
      release(ActionType.HardDrop, drop + 2);
    }
    playTo(170);

    // Replay the log frame by frame: every move moves the piece, and every hard drop finds it
    // against the left wall.
    const { actions } = session.getState();
    const replay = createEngine(SPRINT, 7, 0);
    const frames = [...new Set(actions.map(({ frame }) => frame))];
    for (const frame of frames) {
      const step = actions.filter((action) => action.frame === frame);
      const moves = step.filter(({ type }) => type === MoveLeft).length;
      if (step.some(({ type }) => type === ActionType.HardDrop)) {
        expect(step).toEqual([{ frame, type: ActionType.HardDrop }]);
        expect(canMove(replay.state, -1, 0)).toBe(false);
      }
      const { col } = replay.state.active;
      replay.step(frame, step);
      if (moves > 0) expect(replay.state.active.col).toBe(col - moves);
    }
    expect(replay.state.piecesPlaced).toBe(7);
    // The tap and DAS, then each hard drop and the next piece's shift to the wall a frame later.
    expect(frames).toEqual([5, 15, 30, 31, 50, 51, 70, 71, 90, 91, 110, 111, 130, 131, 150, 151]);
  });
});

describe('rotations, hold and hard drop', () => {
  it.each<PieceActionType>([
    ActionType.RotateCW,
    ActionType.RotateCCW,
    ActionType.Rotate180,
    ActionType.Hold,
    ActionType.HardDrop,
  ])('%s makes one action per press, however long it is held', (action) => {
    const { session, press, release, playTo } = game();
    press(action, 10);
    release(action, 30);
    press(action, 40);
    playTo(60);
    expect(session.getState().actions).toEqual([
      { frame: 10, type: action },
      { frame: 40, type: action },
    ]);
  });

  it('let a move that arrived after them in the same frame wait for the next frame', () => {
    const { session, clock, press, release, playTo } = game();
    press(ActionType.RotateCW, 10);
    session.key({ action: MoveLeft, kind: 'press', time: clock.now() });
    release(MoveLeft, 13);
    press(ActionType.Hold, 20);
    session.key({ action: ActionType.RotateCCW, kind: 'press', time: clock.now() });
    playTo(30);
    expect(session.getState().actions).toEqual([
      { frame: 10, type: ActionType.RotateCW },
      { frame: 11, type: MoveLeft },
      { frame: 20, type: ActionType.Hold },
      { frame: 21, type: ActionType.RotateCCW },
    ]);
  });

  it('come after a move that arrived before them in the same frame', () => {
    const { session, clock, press, playTo } = game();
    press(MoveLeft, 10);
    session.key({ action: ActionType.HardDrop, kind: 'press', time: clock.now() });
    playTo(12);
    expect(session.getState().actions).toEqual([
      { frame: 10, type: MoveLeft },
      { frame: 10, type: ActionType.HardDrop },
    ]);
  });

  it('ignore the key repeat', () => {
    const { session, clock, press, playTo } = game();
    press(ActionType.RotateCW, 10);
    session.key({ action: ActionType.RotateCW, kind: 'repeat', time: clock.now() });
    playTo(30);
    expect(session.getState().actions).toEqual([{ frame: 10, type: ActionType.RotateCW }]);
  });
});

describe('both directions held', () => {
  it('moves the way of the last one pressed, with a fresh DAS', () => {
    const { session, press, playTo, framesOf } = game();
    press(MoveLeft, 10);
    press(MoveRight, 15);
    playTo(60);
    expect(framesOf(MoveLeft)).toEqual([10]);
    expect(framesOf(MoveRight)).toEqual([15, 25, 27, 29, 31]);
    expect(session.getState().engine.active.col).toBe(8);
  });

  it('releasing the last one pressed hands back to the other, as if it was pressed again', () => {
    const { session, press, release, playTo, framesOf } = game();
    press(MoveLeft, 10);
    press(MoveRight, 15);
    release(MoveRight, 40);
    playTo(80);
    expect(framesOf(MoveRight)).toEqual([15, 25, 27, 29, 31]);
    expect(framesOf(MoveLeft)).toEqual([10, 40, 50, 52, 54, 56, 58, 60, 62]);
    expect(session.getState().engine.active.col).toBe(0);
  });

  it('releasing the first one pressed changes nothing', () => {
    const { press, release, playTo, framesOf } = game();
    press(MoveLeft, 10);
    press(MoveRight, 15);
    release(MoveLeft, 20);
    playTo(60);
    expect(framesOf(MoveLeft)).toEqual([10]);
    expect(framesOf(MoveRight)).toEqual([15, 25, 27, 29, 31]);
  });

  it('releasing both stops', () => {
    const { press, release, playTo, framesOf } = game();
    press(MoveLeft, 10);
    press(MoveRight, 15);
    release(MoveRight, 20);
    release(MoveLeft, 21);
    playTo(60);
    expect(framesOf(MoveLeft)).toEqual([10, 20]);
    expect(framesOf(MoveRight)).toEqual([15]);
  });
});

describe('the key repeat', () => {
  it('moves nothing with DAS and ARR (precise input)', () => {
    const { press, repeat, release, playTo, framesOf } = game();
    press(MoveLeft, 10);
    repeat(MoveLeft, 14);
    repeat(MoveLeft, 16);
    release(MoveLeft, 18);
    playTo(40);
    expect(framesOf(MoveLeft)).toEqual([10]);
  });

  it('moves once per repeat instead of DAS and ARR (basic input)', () => {
    const { press, repeat, release, playTo, framesOf } = game({ autoShift: 'keyRepeat' });
    press(MoveLeft, 10);
    repeat(MoveLeft, 40);
    repeat(MoveLeft, 42);
    release(MoveLeft, 60);
    playTo(80);
    expect(framesOf(MoveLeft)).toEqual([10, 40, 42]);
  });

  it('moves only the way of the last direction pressed (basic input)', () => {
    const { press, repeat, playTo, framesOf } = game({ autoShift: 'keyRepeat' });
    press(MoveLeft, 10);
    press(MoveRight, 12);
    repeat(MoveLeft, 40);
    repeat(MoveRight, 42);
    playTo(80);
    expect(framesOf(MoveLeft)).toEqual([10]);
    expect(framesOf(MoveRight)).toEqual([12, 42]);
  });

  it('leaves soft drop to the soft-drop factor (basic input)', () => {
    const { press, repeat, release, playTo, framesOf } = game({ autoShift: 'keyRepeat' });
    press(ActionType.SoftDrop, 10);
    repeat(ActionType.SoftDrop, 11);
    release(ActionType.SoftDrop, 20);
    playTo(40);
    expect(framesOf(ActionType.SoftDrop)).toEqual([10, 13, 16, 19]);
  });
});

describe('changing the input settings', () => {
  it('applies new handling from the next frame, to a key already held', () => {
    const { session, press, playTo, framesOf } = game();
    press(MoveRight, 10);
    playTo(20);
    session.setInput({ handling: { ...DEFAULT_HANDLING, arr: 0 } });
    playTo(40);
    expect(framesOf(MoveRight)).toEqual([10, 20, 21, 21]);
  });

  it('switches to the key repeat once the adapter is known', () => {
    const { session, press, repeat, playTo, framesOf } = game();
    session.setInput({ autoShift: 'keyRepeat' });
    press(MoveLeft, 10);
    repeat(MoveLeft, 40);
    playTo(60);
    expect(framesOf(MoveLeft)).toEqual([10, 40]);
  });
});

describe('keys and the menu', () => {
  it('a direction released while paused stays released after resuming', () => {
    const { session, clock, press, playTo, framesOf } = game();
    press(MoveLeft, 10);
    playTo(12);
    session.pause();
    session.key({ action: MoveLeft, kind: 'release', time: clock.now() });
    session.resume();
    clock.run(COUNTDOWN_MS + 500);
    expect(framesOf(MoveLeft)).toEqual([10]);
  });

  // Paused at the end of frame 12, the game carries on at frame 13 after the countdown.
  it('a direction pressed while paused charges through the countdown on resuming', () => {
    const { session, clock, playTo, framesOf } = game();
    playTo(12);
    session.pause();
    session.key({ action: MoveLeft, kind: 'press', time: clock.now() });
    clock.advance(5_000);
    session.resume();
    clock.run(COUNTDOWN_MS + 500);
    expect(framesOf(MoveLeft)).toEqual([13, 15, 17, 19]);
  });

  it('that arrive once the game has ended wait for a restart, without waking the session', () => {
    const { session, clock, playTo } = game();
    playTo(1);
    for (let i = 0; i < 30; i++) {
      session.act(ActionType.HardDrop, clock.now());
      clock.advance(17);
    }
    const ended = session.getState();
    expect(ended.phase).toBe('ended');
    session.key({ action: MoveLeft, kind: 'press', time: clock.now() });
    expect(session.getState()).toBe(ended);
    expect(clock.pending).toBe(0);
  });

  it('a direction held into a restart is charged at Go of the new game', () => {
    const { session, clock, press, playTo, framesOf } = game();
    press(MoveLeft, 10);
    playTo(30);
    session.pause();
    session.restart(7);
    clock.run(COUNTDOWN_MS + 500);
    expect(framesOf(MoveLeft)).toEqual([1, 3, 5, 7]);
  });

  it('a direction released after the game ended stays released after a restart', () => {
    const { session, clock, press, playTo, framesOf } = game();
    press(MoveLeft, 10);
    playTo(30);
    for (let i = 0; i < 30; i++) {
      session.act(ActionType.HardDrop, clock.now());
      clock.advance(17);
    }
    expect(session.getState().phase).toBe('ended');
    session.key({ action: MoveLeft, kind: 'release', time: clock.now() });
    session.restart(7);
    clock.run(COUNTDOWN_MS + 500);
    expect(framesOf(MoveLeft)).toEqual([]);
  });
});
