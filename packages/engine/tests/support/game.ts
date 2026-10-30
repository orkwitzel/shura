import {
  type Action,
  ActionType,
  type ActivePiece,
  createEngine,
  type EngineState,
  type GarbageEntry,
  type ModeSettings,
  restoreEngine,
} from '../../src/index';
import { withActive, withBoard } from './board';

/** The seed of every game `gameOf` starts. */
const SEED = 31;

/** `count` rows full but for column 10, the well. */
export function well(count: number): string[] {
  return Array.from({ length: count }, () => 'LLLLLLLLL.');
}

/** An I standing in the well on the floor: it clears every well row up to 4. */
export const I_IN_WELL: ActivePiece = { kind: 'I', col: 7, row: 3, rotation: 1 };

/** An I clearing `lines` well rows, with a cell above them so the board isn't left empty. */
export function clearing(lines: number): { board: string[]; piece: ActivePiece } {
  return { board: ['L.........', ...well(lines)], piece: I_IN_WELL };
}

/** A hard drop at frame 1, which locks the piece in play there. */
export const HARD_DROP_AT_1: Action[] = [{ frame: 1, type: ActionType.HardDrop }];

/** How `gameOf` changes a fresh game: any of these state fields, and the following. */
export interface GameSetup
  extends Partial<Pick<EngineState, 'frame' | 'level' | 'linesCleared' | 'marginCarry'>> {
  /** The bottom of the board, as `withBoard` takes it. */
  board?: readonly string[];
  /** The piece in play. */
  piece?: ActivePiece;
  /** Garbage queued in the meter, oldest first. */
  garbage?: readonly GarbageEntry[];
}

/** A fresh game of `settings`, changed by `setup`. */
export function gameOf(
  settings: ModeSettings,
  { board = [], piece, garbage = [], ...state }: GameSetup = {},
) {
  const boarded = withBoard(createEngine(settings, SEED, 0).serialize(), board);
  const engine = restoreEngine({ ...(piece ? withActive(boarded, piece) : boarded), ...state });
  for (const entry of garbage) engine.queueGarbage(entry);
  return engine;
}
