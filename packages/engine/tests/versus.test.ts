import { describe, expect, test } from 'vitest';
import {
  type Action,
  ActionType,
  type ActivePiece,
  createEngine,
  type GarbageAcceptedAction,
  type GarbageEntry,
  holeColumn,
  type ModeSettings,
  type ReadonlyEngineState,
  restoreEngine,
} from '../src/index';
import { renderLocked, withActive, withBoard } from './support/board';
import { TEST_SETTINGS } from './support/settings';

const SEED = 31;

interface Setup {
  settings?: Readonly<ModeSettings>;
  /** The bottom of the board, as `withBoard` takes it. */
  board?: readonly string[];
  piece?: ActivePiece;
  frame?: number;
  garbage?: readonly GarbageEntry[];
}

/** A game changed by `setup`, with `garbage` queued in its meter. */
function gameOf({
  settings = TEST_SETTINGS,
  board = [],
  piece,
  frame = 0,
  garbage = [],
}: Setup = {}) {
  const boarded = withBoard(createEngine(settings, SEED, 0).serialize(), board);
  const engine = restoreEngine({ ...(piece ? withActive(boarded, piece) : boarded), frame });
  for (const entry of garbage) engine.queueGarbage(entry);
  return engine;
}

/** `count` rows full but for column 10, the well. */
function well(count: number): string[] {
  return Array.from({ length: count }, () => 'LLLLLLLLL.');
}

/** An I standing in the well on the floor, so a hard drop locks it where it is. */
const I_IN_WELL: ActivePiece = { kind: 'I', col: 7, row: 3, rotation: 1 };
/** An O on the floor in the left corner of an empty board: a lock that clears nothing. */
const O_IN_CORNER: ActivePiece = { kind: 'O', col: 0, row: 1, rotation: 0 };

const A: GarbageEntry = { id: 1, lines: 3, holeSeed: 101 };
const B: GarbageEntry = { id: 2, lines: 4, holeSeed: 202 };

describe('the garbage meter', () => {
  test('starts empty', () => {
    expect(gameOf().state.garbageMeter).toEqual([]);
  });

  test('shows queued garbage, oldest first', () => {
    expect(gameOf({ garbage: [A, B] }).state.garbageMeter).toEqual([A, B]);
  });

  test('rejects an entry with no lines, a reused id or a hole seed out of range', () => {
    const engine = gameOf({ garbage: [A] });
    expect(() => engine.queueGarbage({ ...B, lines: 0 })).toThrow(RangeError);
    expect(() => engine.queueGarbage({ ...B, id: A.id })).toThrow(RangeError);
    expect(() => engine.queueGarbage({ ...B, holeSeed: -1 })).toThrow(RangeError);
    expect(() => engine.queueGarbage({ ...B, holeSeed: 2 ** 32 })).toThrow(RangeError);
    expect(engine.state.garbageMeter).toEqual([A]);
  });

  test('cancelling takes lines off the oldest entry first and returns the remainder', () => {
    const engine = gameOf({ garbage: [A, B] });
    expect(engine.cancelGarbage(5)).toBe(0);
    expect(engine.state.garbageMeter).toEqual([{ ...B, lines: 2 }]);
    expect(engine.cancelGarbage(6)).toBe(4);
    expect(engine.state.garbageMeter).toEqual([]);
  });
});

/** The hole column of each garbage row at the bottom of the board, bottom row first. */
function holesOf(state: ReadonlyEngineState): number[] {
  const holes: number[] = [];
  for (const row of state.board) {
    if (!row.includes('G')) break;
    expect(
      row.filter((cell) => cell === null),
      'a garbage row has one hole',
    ).toHaveLength(1);
    holes.push(row.indexOf(null));
  }
  return holes;
}

const HARD_DROP_AT_1: Action[] = [{ frame: 1, type: ActionType.HardDrop }];

describe('garbage landing, accepting garbage as it comes', () => {
  test('lands queued garbage at a lock that clears nothing, recording garbageAccepted then', () => {
    const engine = gameOf({ piece: O_IN_CORNER, garbage: [A] });
    const { accepted } = engine.step(1, HARD_DROP_AT_1, { acceptGarbage: true });
    expect(accepted).toEqual([{ frame: 1, type: ActionType.GarbageAccepted, id: A.id }]);
    expect(engine.state.garbageMeter).toEqual([]);
    expect(holesOf(engine.state)).toHaveLength(3);
    // The O locked on the floor, and the garbage pushed it up 3 rows.
    expect(renderLocked(engine.state, 5).slice(0, 2)).toEqual(['OO........', 'OO........']);
  });

  test("doesn't land at a lock that clears lines", () => {
    const engine = gameOf({ board: ['L.........', ...well(1)], piece: I_IN_WELL, garbage: [A] });
    const { accepted } = engine.step(1, HARD_DROP_AT_1, { acceptGarbage: true });
    expect(accepted).toEqual([]);
    expect(engine.state.garbageMeter).toEqual([A]);
    expect(holesOf(engine.state)).toEqual([]);
  });

  test('lands at most 8 lines at a lock and leaves the rest queued', () => {
    const big = { id: 7, lines: 10, holeSeed: 5 };
    const engine = gameOf({ piece: O_IN_CORNER, garbage: [big, B] });
    engine.step(1, HARD_DROP_AT_1, { acceptGarbage: true });
    expect(engine.state.garbageMeter).toEqual([{ ...big, lines: 2 }, B]);
    expect(holesOf(engine.state)).toHaveLength(8);
  });

  test('lands several attacks at one lock, oldest first, up to the cap', () => {
    const engine = gameOf({
      piece: O_IN_CORNER,
      garbage: [A, B, { id: 3, lines: 2, holeSeed: 7 }],
    });
    const { accepted } = engine.step(1, HARD_DROP_AT_1, { acceptGarbage: true });
    expect(accepted.map((action) => action.id)).toEqual([A.id, B.id, 3]);
    expect(engine.state.garbageMeter).toEqual([{ id: 3, lines: 1, holeSeed: 7 }]);
    expect(holesOf(engine.state)).toHaveLength(8);
  });

  test('keeps the hole of an attack in one column, even when it lands over two locks', () => {
    const big = { id: 7, lines: 10, holeSeed: 5 };
    const engine = gameOf({ piece: O_IN_CORNER, garbage: [big] });
    engine.step(1, HARD_DROP_AT_1, { acceptGarbage: true });
    // The next piece falls and locks on its own at the lock delay's end, clearing nothing.
    engine.step(2_000, [], { acceptGarbage: true });
    expect(engine.state.garbageMeter).toEqual([]);
    const holes = holesOf(engine.state);
    expect(holes).toHaveLength(10);
    expect(new Set(holes).size).toBe(1);
  });

  test("puts each attack's hole in the column its hole seed picks, later attacks lower", () => {
    const [columnA, columnB] = [holeColumn(A.holeSeed), holeColumn(B.holeSeed)];
    expect(columnA).not.toBe(columnB);
    const engine = gameOf({ piece: O_IN_CORNER, garbage: [A, B] });
    engine.step(1, HARD_DROP_AT_1, { acceptGarbage: true });
    expect(holesOf(engine.state)).toEqual([
      ...Array<number>(B.lines).fill(columnB),
      ...Array<number>(A.lines).fill(columnA),
    ]);
  });

  test('without accepting garbage, lands none on its own', () => {
    const engine = gameOf({ piece: O_IN_CORNER, garbage: [A] });
    engine.step(1, HARD_DROP_AT_1);
    expect(engine.state.garbageMeter).toEqual([A]);
    expect(holesOf(engine.state)).toEqual([]);
  });

  test('refuses garbageAccepted actions: it records them itself', () => {
    const engine = gameOf({ piece: O_IN_CORNER, garbage: [A] });
    const actions: Action[] = [
      ...HARD_DROP_AT_1,
      { frame: 1, type: ActionType.GarbageAccepted, id: A.id },
    ];
    expect(() => engine.step(1, actions, { acceptGarbage: true })).toThrow(RangeError);
  });
});

describe('garbage overflow', () => {
  /**
   * A stack `rows` tall in columns 8–10, clear of where pieces spawn, and an O that locks on the
   * floor in the left corner, clearing nothing.
   */
  function stackOf(rows: number, lines: number) {
    const board = Array.from({ length: rows }, () => '.......LLL');
    return gameOf({ board, piece: O_IN_CORNER, garbage: [{ id: 1, lines, holeSeed: 0 }] });
  }

  test('garbage that fits under the top of the board leaves the player in the game', () => {
    const engine = stackOf(39, 1);
    engine.step(1, HARD_DROP_AT_1, { acceptGarbage: true });
    expect(engine.state.toppedOut).toBe(false);
    expect(engine.state.board[39]?.join('')).toContain('L');
  });

  test('garbage that pushes the stack past row 40 tops the player out, there and then', () => {
    const engine = stackOf(39, 2);
    const { accepted } = engine.step(10, HARD_DROP_AT_1, { acceptGarbage: true });
    expect(accepted).toEqual([{ frame: 1, type: ActionType.GarbageAccepted, id: 1 }]);
    const { toppedOut, frame, garbageMeter, active } = engine.state;
    expect({ toppedOut, frame, garbageMeter }).toEqual({
      toppedOut: true,
      frame: 1,
      garbageMeter: [],
    });
    // No next piece spawns: the O that locked is still the active piece.
    expect(active).toEqual(O_IN_CORNER);
  });

  test('replays to the same top-out', () => {
    const accepting = stackOf(39, 2);
    const { accepted } = accepting.step(10, HARD_DROP_AT_1, { acceptGarbage: true });
    const replayed = stackOf(39, 2);
    replayed.step(10, [...HARD_DROP_AT_1, ...accepted]);
    expect(replayed.hash()).toBe(accepting.hash());
  });
});

describe('garbage landing, replaying garbageAccepted', () => {
  /** 13 lines: the first lock lands A and 5 lines of the second attack, the next lock the rest. */
  const TWO_LOCKS = [A, { id: 7, lines: 10, holeSeed: 5 }];
  const accepting = gameOf({ piece: O_IN_CORNER, garbage: TWO_LOCKS });
  const accepted = [
    ...accepting.step(1, HARD_DROP_AT_1, { acceptGarbage: true }).accepted,
    ...accepting.step(2_000, [], { acceptGarbage: true }).accepted,
  ];

  test('lands the same garbage at the same frames as the game that accepted it', () => {
    expect(accepted.length).toBeGreaterThan(0);
    const replayed = gameOf({ piece: O_IN_CORNER, garbage: TWO_LOCKS });
    const actions = [...HARD_DROP_AT_1, ...accepted].sort((a, b) => a.frame - b.frame);
    replayed.step(2_000, actions);
    expect(replayed.hash()).toBe(accepting.hash());
  });

  test("lands at a lock that ends on its own after the frame's actions", () => {
    // The last landing is at a lock-delay lock, after every action of its frame.
    const last = accepted.at(-1) as GarbageAcceptedAction;
    expect(last.frame).toBeGreaterThan(1);
    const replayed = gameOf({ piece: O_IN_CORNER, garbage: TWO_LOCKS });
    replayed.step(last.frame - 1, [...HARD_DROP_AT_1, ...accepted.slice(0, -1)]);
    expect(replayed.state.garbageMeter).toEqual([{ id: 7, lines: 5, holeSeed: 5 }]);
    replayed.step(last.frame, [last]);
    expect(replayed.state.garbageMeter).toEqual([]);
    expect(replayed.state.piecesPlaced).toBe(2);
  });

  test('throws and changes nothing when no lock in the frame clears nothing', () => {
    const engine = gameOf({ piece: O_IN_CORNER, garbage: [A] });
    const before = engine.hash();
    const actions: Action[] = [{ frame: 1, type: ActionType.GarbageAccepted, id: A.id }];
    expect(() => engine.step(1, actions)).toThrow(RangeError);
    expect(engine.hash()).toBe(before);
  });

  test("throws and changes nothing when the id isn't the oldest in the meter", () => {
    const engine = gameOf({ piece: O_IN_CORNER, garbage: [A, B] });
    const before = engine.hash();
    const actions: Action[] = [
      ...HARD_DROP_AT_1,
      { frame: 1, type: ActionType.GarbageAccepted, id: B.id },
    ];
    expect(() => engine.step(1, actions)).toThrow(RangeError);
    expect(engine.hash()).toBe(before);
  });
});

describe('attacks', () => {
  test('step reports the attack of each lock that sends one, at its frame', () => {
    const engine = gameOf({ board: ['L.........', ...well(4)], piece: I_IN_WELL });
    const { attacks } = engine.step(5, [{ frame: 3, type: ActionType.HardDrop }]);
    expect(attacks).toEqual([{ frame: 3, lines: 4 }]);
  });

  test('a lock that sends nothing reports no attack', () => {
    const engine = gameOf({ board: ['L.........', ...well(1)], piece: I_IN_WELL });
    expect(engine.step(1, [{ frame: 1, type: ActionType.HardDrop }]).attacks).toEqual([]);
  });

  test('are multiplied by margin time from frame 7,200', () => {
    const settings = { ...TEST_SETTINGS, marginTimeStart: 7_200 };
    const setup = { settings, board: ['L.........', ...well(4)], piece: I_IN_WELL };
    const before = gameOf({ ...setup, frame: 7_198 });
    expect(before.step(7_199, [{ frame: 7_199, type: ActionType.HardDrop }]).attacks).toEqual([
      { frame: 7_199, lines: 4 },
    ]);
    const after = gameOf({ ...setup, frame: 7_199 });
    expect(after.step(7_200, [{ frame: 7_200, type: ActionType.HardDrop }]).attacks).toEqual([
      { frame: 7_200, lines: 5 },
    ]);
  });
});
