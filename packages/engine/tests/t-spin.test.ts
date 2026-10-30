import { describe, expect, test } from 'vitest';
import { ActionType, type ActivePiece, detectTSpin, TSpin, type Turn } from '../src/index';
import { boardOf } from './support/board';
import { play } from './support/play';
import { IN_PLACE, MINI_SLOT, OPEN_TST_SLOT, TSD_SLOT, TST_KICK } from './support/t-spin';

// The 3-corner rule, the full and mini split and the upgrade after a kick of 1 by 2 are the
// guideline's, as https://tetris.wiki/T-Spin (revision 25858, "Current rules") gives them: the last
// maneuver of the T must be a turn and three of the four corners diagonal to its centre must be
// filled. Both front corners and a back one make a full T-spin, and one front corner and both back
// ones a mini. "However, if the last rotation that kicked the T moves its center 1 by 2 blocks (the
// last rotation offset of SRS), it is still a proper T-spin."
//
// No primary reference for the upgrade was reachable. The guideline itself (the Tetris Design
// Guideline of March 2009) was never published, only leaked, and no licensed game's source is
// public. The wiki sentence above cites nothing. https://harddrop.com/wiki/T-Spin ("T-Spin Triple
// Wall Kick Upgrade", under Tetris Friends, also uncited) describes the same behaviour in a licensed
// game: "If the T piece is kicked using the T-Spin Triple wall kick", "the spin is automatically
// "upgraded" to proper status, disregarding the prior cell checks."
//
// That kick is the fifth and last of an SRS quarter turn. The guideline has no 180° turn, so the
// rule says nothing about SRS+'s 180° kicks, two of which also move the T 1 by 2: (1, 2) from R to L
// and (-1, 2) from L to R. Shura doesn't upgrade after them, keeping the upgrade to the kick the
// sources name. (TETR.IO instead upgrades after the fourth kick in its list for any turn, which for
// a 180° turn is (±1, 0) or (0, 2): an artifact of its kick indexing, not a rule to copy.)

describe('T-spin detection', () => {
  const tsdBoard = boardOf(TSD_SLOT.board);
  const openTstBoard = boardOf(OPEN_TST_SLOT.board);

  test('a T turned into a slot with both front corners and a back corner filled is a full T-spin', () => {
    expect(detectTSpin(tsdBoard, TSD_SLOT.piece, IN_PLACE)).toBe(TSpin.Full);
  });

  test('a T whose last move was not a turn is no T-spin', () => {
    expect(detectTSpin(tsdBoard, TSD_SLOT.piece, null)).toBe(TSpin.None);
  });

  test('only a T spins', () => {
    expect(detectTSpin(tsdBoard, { ...TSD_SLOT.piece, kind: 'J' }, IN_PLACE)).toBe(TSpin.None);
  });

  test('a T with only two corners filled is no T-spin', () => {
    // The overhang is gone, so only the two front corners beside the stem are filled.
    const board = boardOf(['L...LLLLLL', 'LL.LLLLLLL']);
    expect(detectTSpin(board, TSD_SLOT.piece, IN_PLACE)).toBe(TSpin.None);
  });

  test('one front corner and both back corners make a mini, with the floor filling the back corners', () => {
    expect(detectTSpin(boardOf(MINI_SLOT.board), MINI_SLOT.piece, IN_PLACE)).toBe(TSpin.Mini);
  });

  test('the walls count as filled corners', () => {
    // Pointing right from the left wall, both back corners are outside the board.
    const t: ActivePiece = { kind: 'T', col: -1, row: 2, rotation: 1 };
    expect(detectTSpin(boardOf(['.L........']), t, IN_PLACE)).toBe(TSpin.Mini);
  });

  test('a mini is a full T-spin after the fifth kick of a quarter turn, which moves the T 1 by 2', () => {
    expect(detectTSpin(openTstBoard, OPEN_TST_SLOT.piece, IN_PLACE)).toBe(TSpin.Mini);
    expect(detectTSpin(openTstBoard, OPEN_TST_SLOT.piece, TST_KICK)).toBe(TSpin.Full);
  });

  test('so does the mirror image, (1, -2) anticlockwise from 0 to L', () => {
    const board = boardOf(OPEN_TST_SLOT.board.map((line) => [...line].reverse().join('')));
    const t: ActivePiece = { kind: 'T', col: 7, row: 2, rotation: 3 };
    expect(detectTSpin(board, t, IN_PLACE)).toBe(TSpin.Mini);
    expect(detectTSpin(board, t, { quarterTurns: 3, kick: [1, -2] })).toBe(TSpin.Full);
  });

  test('a kick of 1 by 2 in a 180° turn leaves a mini a mini', () => {
    const halfTurnKick: Turn = { quarterTurns: 2, kick: [-1, 2] };
    expect(detectTSpin(openTstBoard, OPEN_TST_SLOT.piece, halfTurnKick)).toBe(TSpin.Mini);
  });

  test('a kick that moves the T less far leaves a mini a mini', () => {
    const fourthKick: Turn = { quarterTurns: 1, kick: [0, -2] };
    expect(detectTSpin(openTstBoard, OPEN_TST_SLOT.piece, fourthKick)).toBe(TSpin.Mini);
  });
});

describe('T-spins in play', () => {
  /**
   * The T can reach the spot under the overhang at column 4 by a turn: anticlockwise from pointing
   * right in the air beside it, by the kick (1, -1). Or it can slide in along the floor.
   */
  const UNDER_OVERHANG = ['L..L......', '....LLLLLL'];
  const BESIDE: ActivePiece = { kind: 'T', col: 0, row: 2, rotation: 1 };
  const ON_THE_FLOOR: ActivePiece = { kind: 'T', col: 0, row: 1, rotation: 0 };

  test('a T turned into place last is a T-spin: a mini T-spin zero scores 100', () => {
    const lock = { board: UNDER_OVERHANG, piece: BESIDE, actions: [ActionType.RotateCCW] };
    expect(play([lock]).points).toEqual([100]);
  });

  test('a T moved into place is no T-spin', () => {
    const lock = { board: UNDER_OVERHANG, piece: ON_THE_FLOOR, actions: [ActionType.MoveRight] };
    expect(play([lock]).points).toEqual([0]);
  });

  test('a T that moves after turning is no T-spin, even if it moves back', () => {
    const actions = [ActionType.RotateCCW, ActionType.MoveLeft, ActionType.MoveRight];
    expect(play([{ board: UNDER_OVERHANG, piece: BESIDE, actions }]).points).toEqual([0]);
  });

  test('the T-spin triple kick makes a full T-spin double of what would be a mini double', () => {
    // A full T-spin double scores 1200, a mini double 400.
    const piece: ActivePiece = { kind: 'T', col: 1, row: 4, rotation: 0 };
    const lock = { board: OPEN_TST_SLOT.board, piece, actions: [ActionType.RotateCW] };
    expect(play([lock]).points).toEqual([1200]);
  });
});
