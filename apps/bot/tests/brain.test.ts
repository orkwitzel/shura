import { canMove, pieceCells } from '@shura/engine';
import { describe, expect, test } from 'vitest';
import { choosePlacement } from '../src/brain';
import { BOT_PROFILES } from '../src/profile';
import { seededRandom } from '../src/random';
import { gameOf, holes, locked } from './support/games';

const casual = BOT_PROFILES.casual;
const SEEDS = Array.from({ length: 40 }, (_, seed) => seed + 1);

/** A floor with a one-cell slot at column 3: a T pointing down fills it and clears the row. */
const SLOT = ['XXX.XXXXXX'];

/** A ragged stack where most placements of an S leave a hole, but a few don't. */
const RAGGED = ['X.........', 'XX...X..X.', 'XXX.XXX.XX', 'XXXX.XXXXX'];

describe('choosePlacement', () => {
  test.each([
    ['T', SLOT],
    ['S', RAGGED],
    ['O', SLOT],
    ['I', RAGGED],
  ] as const)('a %s picks a placement that makes no new hole when one exists', (kind, rows) => {
    const game = gameOf(rows, kind, { queue: ['L', 'J', 'Z', 'I', 'O'] });
    const before = holes(game.board);
    for (const seed of SEEDS) {
      const placement = choosePlacement(game, casual, seededRandom(seed));
      expect(placement).not.toBeNull();
      if (!placement) return;
      const cells = pieceCells(placement.piece);
      expect(holes(locked(game.board, cells))).toBeLessThanOrEqual(before);
    }
  });

  test('it picks a resting place the piece fits, of the active piece when it does not hold', () => {
    const game = gameOf(RAGGED, 'S', { queue: ['L', 'J', 'Z', 'I', 'O'] });
    for (const seed of SEEDS) {
      const placement = choosePlacement(game, casual, seededRandom(seed));
      if (!placement) throw new Error('no placement');
      const at = { ...game, active: placement.piece };
      expect(canMove(at, 0, 0)).toBe(true);
      expect(canMove(at, 0, -1)).toBe(false);
      expect(placement.piece.kind).toBe(placement.hold ? 'L' : 'S');
    }
  });

  test('the T fills the slot and clears the row, its clearly best placement', () => {
    const game = gameOf(SLOT, 'T', { queue: ['O', 'O', 'O', 'O', 'O'] });
    const picks = SEEDS.map((seed) => choosePlacement(game, casual, seededRandom(seed)));
    const filled = picks.filter((placement) =>
      placement && !placement.hold
        ? pieceCells(placement.piece).some(({ col, row }) => col === 3 && row === 0)
        : false,
    );
    expect(filled.length).toBeGreaterThan(SEEDS.length / 2);
  });

  test('the same seed gives the same choice, and different seeds vary', () => {
    const game = gameOf(RAGGED, 'S', { queue: ['L', 'J', 'Z', 'I', 'O'] });
    for (const seed of SEEDS) {
      expect(choosePlacement(game, casual, seededRandom(seed))).toEqual(
        choosePlacement(game, casual, seededRandom(seed)),
      );
    }
    const choices = new Set(
      SEEDS.map((seed) => JSON.stringify(choosePlacement(game, casual, seededRandom(seed)))),
    );
    expect(choices.size).toBeGreaterThan(1);
  });

  test('it holds only sometimes', () => {
    const game = gameOf(RAGGED, 'S', { queue: ['I', 'J', 'Z', 'L', 'O'] });
    const holds = SEEDS.filter(
      (seed) => choosePlacement(game, casual, seededRandom(seed))?.hold,
    ).length;
    expect(holds).toBeGreaterThan(0);
    expect(holds).toBeLessThan(SEEDS.length);
  });

  test('a T-spin it goes for twists into a slot under an overhang', () => {
    // A T-spin double slot: the T turns in under the overhang at column 2 and clears two rows.
    const tsd = ['..X.......', '...XXXXXXX', 'X.XXXXXXXX'];
    const game = gameOf(tsd, 'T', { queue: ['O', 'O', 'O', 'O', 'O'] });
    const twists = SEEDS.map((seed) => choosePlacement(game, casual, seededRandom(seed))).filter(
      (placement) => placement?.twist,
    );
    expect(twists.length).toBeGreaterThan(0);
    expect(twists.length).toBeLessThan(SEEDS.length);
    // The T-spin double clears both rows and the overhang's hole with them.
    const cleared = twists.filter(
      (placement) => placement && holes(locked(game.board, pieceCells(placement.piece))) === 0,
    );
    expect(cleared.length).toBeGreaterThan(0);
    expect(cleared[0]?.piece).toMatchObject({ kind: 'T', col: 0, row: 2, rotation: 2 });
  });

  test('with nowhere to go it returns null', () => {
    const full = Array.from({ length: 22 }, () => 'XXXX..XXXX');
    const game = gameOf(full, 'I', { queue: ['I', 'I', 'I', 'I', 'I'] });
    game.holdUsed = true;
    // The I spawns into the stack: nothing fits.
    expect(choosePlacement(game, casual, seededRandom(1))).toBeNull();
  });
});
