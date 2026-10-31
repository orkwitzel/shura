import { ActionType, type LockEvent, pieceCells } from '@shura/engine';
import { describe, expect, test } from 'vitest';
import type { Placement } from '../src/brain';
import { startPilot } from '../src/pilot';
import { BOT_PROFILES, type BotProfile } from '../src/profile';
import { seededRandom } from '../src/random';
import { gameOf } from './support/games';
import { locks, type PracticeFrame, practice } from './support/practice';

const casual = BOT_PROFILES.casual;
const SEEDS = Array.from({ length: 24 }, (_, seed) => seed + 1);
const LOW = ['X.........', 'XX...X..X.', 'XXX.XXX.XX', 'XXXX.XXXXX'];
const HORIZONTAL: readonly string[] = [ActionType.MoveLeft, ActionType.MoveRight];
const TURNS: readonly string[] = [ActionType.RotateCW, ActionType.RotateCCW, ActionType.Rotate180];

/** Plays one piece with a pilot: until the first lock. */
function playOnePiece(seed: number, profile: BotProfile = casual, rows = LOW) {
  const game = practice(gameOf(rows, 'T', { queue: ['L', 'J', 'Z', 'I', 'O'] }));
  const plans: Placement[] = [];
  const pilot = startPilot({
    clock: game.clock,
    seat: game.seat,
    profile,
    random: seededRandom(seed),
    planned: (placement) => plans.push(placement),
  });
  game.play(locks);
  pilot.stop();
  const lock = game.frames
    .at(-1)
    ?.events.find((event): event is LockEvent => event.type === 'lock');
  return { game, plans, lock };
}

const sortedCells = (cells: readonly { col: number; row: number }[]) =>
  [...cells].sort((a, b) => a.row - b.row || a.col - b.col);

describe('startPilot', () => {
  test.each(SEEDS)(
    'seed %i: its keys take the piece to the placement it planned, through the real input engine',
    (seed) => {
      const { plans, lock } = playOnePiece(seed);
      const plan = plans.at(-1);
      expect(plan).toBeDefined();
      expect(lock).toBeDefined();
      if (!plan || !lock) return;
      expect(sortedCells(lock.piece.cells)).toEqual(sortedCells(pieceCells(plan.piece)));
    },
  );

  test('nothing teleports: at most one column and one turn a frame', () => {
    for (const seed of SEEDS) {
      const { game } = playOnePiece(seed);
      for (const frame of game.frames) {
        expect(frame.actions.filter((action) => HORIZONTAL.includes(action)).length).toBeLessThan(
          2,
        );
        expect(frame.actions.filter((action) => TURNS.includes(action)).length).toBeLessThan(2);
      }
    }
  });

  test('a piece going three columns or more slides there over several frames', () => {
    let slides = 0;
    for (const seed of SEEDS) {
      const { game } = playOnePiece(seed);
      const moves = game.frames.filter((frame: PracticeFrame) =>
        frame.actions.some((action) => HORIZONTAL.includes(action)),
      );
      const columns = moves.map((frame) => frame.active.col);
      const span = Math.max(...columns, 0) - Math.min(...columns, 99);
      if (moves.length >= 3 && span >= 2) {
        slides++;
        // Holding the key: DAS 10 frames, then a column every 2 frames.
        const [first, second, third] = moves.map((frame) => frame.frame);
        expect((second ?? 0) - (first ?? 0)).toBeGreaterThanOrEqual(2);
        expect((third ?? 0) - (second ?? 0)).toBeGreaterThanOrEqual(2);
      }
    }
    expect(slides).toBeGreaterThan(0);
  });

  test('it thinks 250–700 ms before it touches a piece', () => {
    for (const seed of SEEDS) {
      const { game } = playOnePiece(seed);
      const firstKey = game.keys[0];
      if (!firstKey) throw new Error('no keys');
      const thought = firstKey.time - 1_000;
      expect(thought).toBeGreaterThanOrEqual(250);
      expect(thought).toBeLessThanOrEqual(700 + 20);
    }
  });

  test('a fumble is a wrong tap, then a correction, and it still gets there', () => {
    const clumsy = { ...casual, mistakeRate: 1 };
    for (const seed of SEEDS) {
      const { plans, lock, game } = playOnePiece(seed, clumsy);
      const plan = plans.at(-1);
      if (!plan || !lock) throw new Error('no lock');
      expect(sortedCells(lock.piece.cells)).toEqual(sortedCells(pieceCells(plan.piece)));
      const pressed = game.keys.filter(({ kind }) => kind === 'press').map(({ action }) => action);
      expect(pressed.filter((action) => HORIZONTAL.includes(action)).length).toBeGreaterThan(0);
    }
  });

  test('alone, it plays about a piece a second, and a pps override makes it faster', () => {
    const piecesPerSecond = (pps?: number) => {
      const game = practice(gameOf([], 'T', { queue: ['L', 'J', 'Z', 'I', 'O'] }));
      const pilot = startPilot({
        clock: game.clock,
        seat: game.seat,
        profile: casual,
        random: seededRandom(3),
        ...(pps && { pps }),
      });
      game.play(() => false, 60 * 60);
      pilot.stop();
      return game.game.piecesPlaced / 60;
    };
    const casualPace = piecesPerSecond();
    expect(casualPace).toBeGreaterThan(0.75);
    expect(casualPace).toBeLessThan(1.3);
    expect(piecesPerSecond(2)).toBeGreaterThan(casualPace * 1.4);
  });
});
