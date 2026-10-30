import { describe, expect, test } from 'vitest';
import {
  type Action,
  ActionType,
  type ActivePiece,
  type GarbageAcceptedAction,
  type GarbageEntry,
  holeColumn,
  ONE_VS_ONE,
  type ReadonlyEngineState,
  restoreEngine,
} from '../src/index';
import { renderLocked } from './support/board';
import { type GameSetup, gameOf as gameOfMode, I_IN_WELL, well } from './support/game';
import { TEST_SETTINGS } from './support/settings';

/** A 1v1 game changed by `setup`. */
function gameOf(setup?: GameSetup) {
  return gameOfMode(ONE_VS_ONE, setup);
}

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
    const columnA = holeColumn(A.holeSeed, null);
    const columnB = holeColumn(B.holeSeed, columnA);
    const engine = gameOf({ piece: O_IN_CORNER, garbage: [A, B] });
    engine.step(1, HARD_DROP_AT_1, { acceptGarbage: true });
    expect(holesOf(engine.state)).toEqual([
      ...Array<number>(B.lines).fill(columnB),
      ...Array<number>(A.lines).fill(columnA),
    ]);
  });

  // Hole seeds 3 and 7 both put the hole in column 3 (index 2) after no other attack.
  const SAME_COLUMN: GarbageEntry[] = [
    { id: 1, lines: 2, holeSeed: 3 },
    { id: 2, lines: 2, holeSeed: 7 },
  ];

  test('moves the hole between attacks, even when their hole seeds pick the same column', () => {
    expect(holeColumn(3, null)).toBe(holeColumn(7, null));
    const engine = gameOf({ piece: O_IN_CORNER, garbage: SAME_COLUMN });
    engine.step(1, HARD_DROP_AT_1, { acceptGarbage: true });
    const [second, , first] = holesOf(engine.state);
    expect(first).toBe(holeColumn(3, null));
    expect(second).not.toBe(first);
  });

  test('moves the hole away from the last attack that landed, at a later lock', () => {
    const [first, second] = SAME_COLUMN as [GarbageEntry, GarbageEntry];
    const engine = gameOf({ piece: O_IN_CORNER, garbage: [first] });
    engine.step(1, HARD_DROP_AT_1, { acceptGarbage: true });
    engine.queueGarbage(second);
    // The next piece falls and locks on its own at the lock delay's end, clearing nothing.
    engine.step(2_000, [], { acceptGarbage: true });
    expect(engine.state.garbageMeter).toEqual([]);
    expect(holesOf(engine.state)).toEqual([
      holeColumn(7, holeColumn(3, null)),
      holeColumn(7, holeColumn(3, null)),
      holeColumn(3, null),
      holeColumn(3, null),
    ]);
    expect(holeColumn(7, holeColumn(3, null))).not.toBe(holeColumn(3, null));
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

describe('sending garbage', () => {
  test('a single-player mode sends none and takes none', () => {
    const engine = gameOfMode(TEST_SETTINGS, {
      board: ['L.........', ...well(4)],
      piece: I_IN_WELL,
    });
    expect(engine.step(1, HARD_DROP_AT_1).sent).toEqual([]);
    expect(() => engine.queueGarbage(A)).toThrow(RangeError);
  });

  const TETRIS_READY = { board: ['L.........', ...well(4)], piece: I_IN_WELL };
  const TWO_HARD_DROPS_AT_1: Action[] = [...HARD_DROP_AT_1, ...HARD_DROP_AT_1];

  test('step reports the lines each lock sends, at its frame', () => {
    const engine = gameOf(TETRIS_READY);
    const { sent } = engine.step(5, [{ frame: 3, type: ActionType.HardDrop }]);
    expect(sent).toEqual([{ frame: 3, lines: 4 }]);
  });

  test('a lock that sends nothing reports nothing', () => {
    const engine = gameOf({ board: ['L.........', ...well(1)], piece: I_IN_WELL });
    expect(engine.step(1, HARD_DROP_AT_1).sent).toEqual([]);
  });

  test('cancels the attack against the garbage meter, oldest first, and sends only the rest', () => {
    const engine = gameOf({
      ...TETRIS_READY,
      garbage: [
        { ...A, lines: 1 },
        { ...B, lines: 2 },
      ],
    });
    expect(engine.step(1, HARD_DROP_AT_1).sent).toEqual([{ frame: 1, lines: 1 }]);
    expect(engine.state.garbageMeter).toEqual([]);
  });

  test('sends nothing when the meter takes the whole attack, and keeps what it leaves', () => {
    const engine = gameOf({ ...TETRIS_READY, garbage: [A, B] });
    expect(engine.step(1, HARD_DROP_AT_1).sent).toEqual([]);
    expect(engine.state.garbageMeter).toEqual([{ ...B, lines: 3 }]);
  });

  test('cancels at the lock, before a later lock in the same frame lands garbage', () => {
    // The Tetris cancels all 3 lines of A, so the next piece, hard dropped in the same frame and
    // clearing nothing, finds nothing to land.
    const engine = gameOf({ ...TETRIS_READY, garbage: [A] });
    const { sent, accepted } = engine.step(1, TWO_HARD_DROPS_AT_1, { acceptGarbage: true });
    expect(engine.state.piecesPlaced).toBe(2);
    expect({ sent, accepted }).toEqual({ sent: [{ frame: 1, lines: 1 }], accepted: [] });
    expect(engine.state.garbageMeter).toEqual([]);
    expect(holesOf(engine.state)).toEqual([]);
  });

  test('replaying the same frame, a garbageAccepted for the cancelled attack has nothing to land', () => {
    const engine = gameOf({ ...TETRIS_READY, garbage: [A] });
    const actions: Action[] = [
      ...TWO_HARD_DROPS_AT_1,
      { frame: 1, type: ActionType.GarbageAccepted, id: A.id },
    ];
    expect(() => engine.step(1, actions)).toThrow(RangeError);
  });

  test('are multiplied by margin time from frame 7,200', () => {
    const before = gameOf({ ...TETRIS_READY, frame: 7_198 });
    expect(before.step(7_199, [{ frame: 7_199, type: ActionType.HardDrop }]).sent).toEqual([
      { frame: 7_199, lines: 4 },
    ]);
    const after = gameOf({ ...TETRIS_READY, frame: 7_199 });
    expect(after.step(7_200, [{ frame: 7_200, type: ActionType.HardDrop }]).sent).toEqual([
      { frame: 7_200, lines: 5 },
    ]);
  });

  /** A double at frame 9,000, at ×1.5: an attack of 1, so 6 quarter-lines with nothing carried. */
  function doubleAt9000(marginCarry: number, garbage: readonly GarbageEntry[] = []) {
    const board = ['L.........', ...well(2)];
    const engine = gameOf({ board, piece: I_IN_WELL, frame: 8_999, garbage });
    const restored = restoreEngine({ ...engine.serialize(), marginCarry });
    const { sent } = restored.step(9_000, [{ frame: 9_000, type: ActionType.HardDrop }]);
    return { engine: restored, sent };
  }

  test("carries margin time's fraction of a line in the state to the next attack", () => {
    const first = doubleAt9000(0);
    expect(first.sent).toEqual([{ frame: 9_000, lines: 1 }]);
    expect(first.engine.state.marginCarry).toBe(2);
    const second = doubleAt9000(2);
    expect(second.sent).toEqual([{ frame: 9_000, lines: 2 }]);
    expect(second.engine.state.marginCarry).toBe(0);
  });

  test('adds the carry before cancellation, which cancels whole lines', () => {
    const { sent, engine } = doubleAt9000(2, [{ ...A, lines: 1 }]);
    expect(sent).toEqual([{ frame: 9_000, lines: 1 }]);
    expect(engine.state.garbageMeter).toEqual([]);
  });
});
