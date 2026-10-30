import { describe, expect, test } from 'vitest';
import {
  type Action,
  ActionType,
  type ActivePiece,
  createEngine,
  DEFAULT_MODE_SETTINGS,
  detectTSpin,
  LOCK_DELAY,
  restoreEngine,
  TSpin,
  type Turn,
} from '../src/index';
import { boardOf, withActive, withBoard } from './support/board';

// The 3-corner rule, the full and mini split and the upgrade after a kick of 1 by 2 are the
// guideline's, as https://tetris.wiki/T-Spin (revision 25858, "Current rules") gives them: the last
// maneuver of the T must be a rotation and three of the four corners diagonal to its centre must be
// filled. Both front corners and a back one make a full T-spin, and one front corner and both back
// ones a mini. "However, if the last rotation that kicked the T moves its center 1 by 2 blocks (the
// last rotation offset of SRS), it is still a proper T-spin."
//
// That offset is the fifth and last kick of an SRS quarter turn (the T-spin triple and fin kicks).
// The guideline has no 180° turn, so the rule says nothing about SRS+'s 180 kicks, two of which also
// move the T 1 by 2: (1, 2) from R to L and (-1, 2) from L to R. Shura doesn't upgrade after them,
// keeping the upgrade to the kick the source names. (TETR.IO instead upgrades after the fourth kick
// in its list for any turn, which for a 180 is (±1, 0) or (0, 2): an artifact of its kick indexing,
// not a rule to copy.)

/** A turn in place, clockwise. */
const IN_PLACE: Turn = { quarterTurns: 1, kick: [0, 0] };

/** A T-spin double slot: the T fits pointing down under the overhang at column 2. */
const TSD_SLOT = boardOf(['LL........', 'L...LLLLLL', 'LL.LLLLLLL']);
const T_IN_TSD_SLOT: ActivePiece = { kind: 'T', col: 1, row: 2, rotation: 2 };

/** A T pointing up on the floor at the left wall, with the corner above its right arm filled. */
const MINI_SLOT = boardOf(['..L.......', '...LLLLLLL']);
const T_IN_MINI_SLOT: ActivePiece = { kind: 'T', col: 0, row: 1, rotation: 0 };

/**
 * A T pointing right in a T-spin triple slot whose bottom-right corner is open: one front corner
 * and both back ones. SRS's fifth kick for a clockwise turn from 0, (-1, -2), puts it there.
 */
const OPEN_TST_SLOT_PICTURE = [
  'LL........',
  'L.........',
  'L.LLLLLLLL',
  'L..LLLLLLL',
  'L..LLLLLLL',
];
const OPEN_TST_SLOT = boardOf(OPEN_TST_SLOT_PICTURE);
const T_IN_OPEN_TST_SLOT: ActivePiece = { kind: 'T', col: 0, row: 2, rotation: 1 };

describe('T-spin detection', () => {
  test('a T turned into a slot with both front corners and a back corner filled is a full T-spin', () => {
    expect(detectTSpin(TSD_SLOT, T_IN_TSD_SLOT, IN_PLACE)).toBe(TSpin.Full);
  });

  test('a T whose last move was not a turn is no T-spin', () => {
    expect(detectTSpin(TSD_SLOT, T_IN_TSD_SLOT, null)).toBe(TSpin.None);
  });

  test('only a T spins', () => {
    expect(detectTSpin(TSD_SLOT, { ...T_IN_TSD_SLOT, kind: 'J' }, IN_PLACE)).toBe(TSpin.None);
  });

  test('a T with only two corners filled is no T-spin', () => {
    // The overhang is gone, so only the two front corners beside the stem are filled.
    const board = boardOf(['L...LLLLLL', 'LL.LLLLLLL']);
    expect(detectTSpin(board, T_IN_TSD_SLOT, IN_PLACE)).toBe(TSpin.None);
  });

  test('one front corner and both back corners make a mini, with the floor filling the back corners', () => {
    expect(detectTSpin(MINI_SLOT, T_IN_MINI_SLOT, IN_PLACE)).toBe(TSpin.Mini);
  });

  test('the walls count as filled corners', () => {
    // Pointing right from the left wall, both back corners are outside the board.
    const t: ActivePiece = { kind: 'T', col: -1, row: 2, rotation: 1 };
    expect(detectTSpin(boardOf(['.L........']), t, IN_PLACE)).toBe(TSpin.Mini);
  });

  test('a mini is a full T-spin after the fifth kick of a quarter turn, which moves the T 1 by 2', () => {
    const tstKick: Turn = { quarterTurns: 1, kick: [-1, -2] };
    expect(detectTSpin(OPEN_TST_SLOT, T_IN_OPEN_TST_SLOT, IN_PLACE)).toBe(TSpin.Mini);
    expect(detectTSpin(OPEN_TST_SLOT, T_IN_OPEN_TST_SLOT, tstKick)).toBe(TSpin.Full);
  });

  test('so does the mirror image, (1, -2) anticlockwise from 0 to L', () => {
    const board = boardOf(OPEN_TST_SLOT_PICTURE.map((line) => [...line].reverse().join('')));
    const t: ActivePiece = { kind: 'T', col: 7, row: 2, rotation: 3 };
    expect(detectTSpin(board, t, IN_PLACE)).toBe(TSpin.Mini);
    expect(detectTSpin(board, t, { quarterTurns: 3, kick: [1, -2] })).toBe(TSpin.Full);
  });

  test('a kick of 1 by 2 in a 180° turn leaves a mini a mini', () => {
    const halfTurnKick: Turn = { quarterTurns: 2, kick: [-1, 2] };
    expect(detectTSpin(OPEN_TST_SLOT, T_IN_OPEN_TST_SLOT, halfTurnKick)).toBe(TSpin.Mini);
  });

  test('a kick that moves the T less far leaves a mini a mini', () => {
    const fourthKick: Turn = { quarterTurns: 1, kick: [0, -2] };
    expect(detectTSpin(OPEN_TST_SLOT, T_IN_OPEN_TST_SLOT, fourthKick)).toBe(TSpin.Mini);
  });
});

describe('T-spins in play', () => {
  /**
   * Puts `active` in play on `board`, applies `actions` one a frame from frame 1, lets the lock
   * delay run out and returns the points the lock scored.
   */
  function pointsFor(board: readonly string[], active: ActivePiece, actions: ActionType[]) {
    const fresh = createEngine(DEFAULT_MODE_SETTINGS, 5, 0).serialize();
    const engine = restoreEngine(withActive(withBoard(fresh, board), active));
    const frames = actions.map((type, index): Action => ({ frame: index + 1, type }));
    engine.step(actions.length + LOCK_DELAY, frames);
    expect(engine.state.piecesPlaced, 'the T should have locked').toBe(1);
    return engine.state.score;
  }

  /**
   * The T can reach the spot under the overhang at column 4 by a turn: anticlockwise from pointing
   * right in the air beside it, by the kick (1, -1). Or it can slide in along the floor.
   */
  const UNDER_OVERHANG = ['L..L......', '....LLLLLL'];
  const BESIDE = { kind: 'T', col: 0, row: 2, rotation: 1 } as const;
  const ON_THE_FLOOR = { kind: 'T', col: 0, row: 1, rotation: 0 } as const;

  test('a T turned into place last is a T-spin: a mini T-spin zero scores 100', () => {
    expect(pointsFor(UNDER_OVERHANG, BESIDE, [ActionType.RotateCCW])).toBe(100);
  });

  test('a T moved into place is no T-spin', () => {
    expect(pointsFor(UNDER_OVERHANG, ON_THE_FLOOR, [ActionType.MoveRight])).toBe(0);
  });

  test('a T that moves after turning is no T-spin, even if it moves back', () => {
    const actions = [ActionType.RotateCCW, ActionType.MoveLeft, ActionType.MoveRight];
    expect(pointsFor(UNDER_OVERHANG, BESIDE, actions)).toBe(0);
  });

  test('the T-spin triple kick makes a full T-spin double of what would be a mini double', () => {
    // A full T-spin double scores 1200, a mini double 400.
    const t: ActivePiece = { kind: 'T', col: 1, row: 4, rotation: 0 };
    expect(pointsFor(OPEN_TST_SLOT_PICTURE, t, [ActionType.RotateCW])).toBe(1200);
  });
});
