import {
  type Effects,
  type OnlineMatchState,
  type OnlinePlayerGame,
  SKINS,
  type SkinId,
  THEMES,
  type ThemeId,
} from '@shura/client-core';
import type { ReadonlyEngineState } from '@shura/engine';
import type { EffectView } from '../effects/utils/effect-frame';
import type { Point, StreakView } from '../effects/utils/streak-frame';
import {
  type BoardLayout,
  boardRegions,
  layoutBoard,
  layoutSmallBoard,
  meterTop,
  type Rect,
  type SmallBoardLayout,
  smallBoardWell,
} from './layout-board';
import { type MatchLayout, NAME_ROWS } from './layout-opponents';
import { flashingAttack, followMeter, type MeterFlash } from './meter-flash';

/** One board on the match's stage: whose, its kind, and its layout's top-left corner. */
export interface MatchBoard {
  readonly playerId: string;
  readonly kind: 'own' | 'full' | 'small';
  readonly x: number;
  readonly y: number;
  readonly cellSize: number;
}

/** What the boards are drawn with, besides the match: the settings and where the boards go. */
export interface MatchLook {
  readonly theme: ThemeId;
  readonly skin: SkinId;
  readonly ghost: boolean;
  readonly effects: Effects;
  readonly layout: MatchLayout;
}

/**
 * What a board was last painted from. A board whose key is unchanged looks the same, so it isn't
 * painted again: its game (a restore replaces it), the frame that game has reached (the engine
 * state is live, so the frame tells a step), whether it's out, the attack flashing in its meter,
 * and the look.
 */
export interface BoardKey {
  readonly engine: ReadonlyEngineState;
  readonly frame: number;
  readonly out: boolean;
  readonly flash: number | undefined;
  readonly look: MatchLook;
}

/** A board to paint again, and what to paint on it. */
export interface BoardPaint {
  readonly playerId: string;
  readonly layout: BoardLayout | SmallBoardLayout;
}

/** One frame of a match's stage: what to paint, and what the next frame needs. */
export interface MatchFrame {
  /** The boards whose key changed, laid out to paint again. */
  readonly paints: readonly BoardPaint[];
  readonly keys: ReadonlyMap<string, BoardKey>;
  readonly flashes: ReadonlyMap<string, MeterFlash>;
  /** Your board as just laid out, for its effects; `null` when it wasn't painted again. */
  readonly view: EffectView | null;
  /** Where attack streaks fly between the boards now. */
  readonly streaks: StreakView;
}

export interface MatchFrameInput {
  readonly match: OnlineMatchState;
  readonly look: MatchLook;
  /** Where each board is (`boardsOf`). */
  readonly boards: readonly MatchBoard[];
  /** The last frame's keys and flashes: empty the first time. */
  readonly keys: ReadonlyMap<string, BoardKey>;
  readonly flashes: ReadonlyMap<string, MeterFlash>;
  /** The time, in ms, on the clock the flashes are timed by. */
  readonly now: number;
}

/** Each board's place on the stage, under its name row: yours first, then the opponents'. */
export function boardsOf(
  layout: MatchLayout,
  own: string | null,
  opponents: readonly string[],
): MatchBoard[] {
  const { kind, cellSize, spots } = layout.opponents;
  const mine = layout.own;
  return [
    ...(own !== null && mine
      ? [
          {
            playerId: own,
            kind: 'own' as const,
            x: mine.x,
            y: mine.y + NAME_ROWS.full * mine.cellSize,
            cellSize: mine.cellSize,
          },
        ]
      : []),
    ...opponents.map((playerId, at) => ({
      playerId,
      kind,
      x: spots[at]?.x ?? 0,
      y: (spots[at]?.y ?? 0) + NAME_ROWS[kind] * cellSize,
      cellSize,
    })),
  ];
}

/** A board's well, in its layout's pixels. */
export const wellOf = ({ kind, cellSize }: MatchBoard): Rect =>
  kind === 'small' ? smallBoardWell(cellSize) : boardRegions(cellSize).well;

function sameKey(a: BoardKey | undefined, b: BoardKey): boolean {
  return (
    a !== undefined &&
    a.engine === b.engine &&
    a.frame === b.frame &&
    a.out === b.out &&
    a.flash === b.flash &&
    a.look === b.look
  );
}

/**
 * A frame of an online match's stage (design §13.2, Match): each board's newest attack followed for
 * its flash, the boards whose key changed laid out to paint again (your own with its ghost and
 * meter, a 1v1 opponent's full board with its meter, an FFA opponent's small one), greyed once out,
 * and where the attack streaks fly.
 */
export function matchFrame({
  match,
  look,
  boards,
  keys,
  flashes,
  now,
}: MatchFrameInput): MatchFrame {
  const theme = THEMES[look.theme];
  const skin = SKINS[look.skin];
  const games = new Map<string, OnlinePlayerGame>(
    match.players.map((game) => [game.playerId, game]),
  );
  const nextFlashes = new Map<string, MeterFlash>();
  const nextKeys = new Map<string, BoardKey>();
  const paints: BoardPaint[] = [];
  let view: EffectView | null = null;
  for (const game of match.players) {
    nextFlashes.set(
      game.playerId,
      followMeter(flashes.get(game.playerId), game.engine.garbageMeter, now),
    );
  }
  for (const board of boards) {
    const game = games.get(board.playerId);
    const flash = nextFlashes.get(board.playerId);
    if (!game || !flash) continue;
    const key: BoardKey = {
      engine: game.engine,
      frame: game.engine.frame,
      out: game.out !== null,
      flash: look.effects === 'off' ? undefined : flashingAttack(flash, now),
      look,
    };
    nextKeys.set(board.playerId, key);
    if (sameKey(keys.get(board.playerId), key)) continue;
    const options = { flash: key.flash, grey: key.out };
    if (board.kind === 'small') {
      paints.push({
        playerId: board.playerId,
        layout: layoutSmallBoard(game.engine, theme, skin, board.cellSize, options),
      });
      continue;
    }
    // Only your own board has a ghost, as in single-player.
    const layout = layoutBoard(game.engine, theme, skin, board.cellSize, {
      ...options,
      meter: true,
      ghost: board.kind === 'own' && look.ghost,
    });
    paints.push({ playerId: board.playerId, layout });
    if (board.kind === 'own') view = { layout, cellSize: board.cellSize, theme, skin };
  }
  const byId = new Map(boards.map((board) => [board.playerId, board]));
  const streaks: StreakView = {
    origin: (id): Point | null => {
      const board = byId.get(id);
      if (!board) return null;
      const well = wellOf(board);
      return { x: board.x + well.x + well.width / 2, y: board.y + well.y + well.height / 2 };
    },
    target: (id): Point | null => {
      const board = byId.get(id);
      const game = games.get(id);
      if (!board || !game) return null;
      const top = meterTop(wellOf(board), board.cellSize, game.engine.garbageMeter);
      return { x: board.x + top.x, y: board.y + top.y };
    },
    // The streaks are sized for your board, or for the boards you watch.
    cellSize: (look.layout.own ?? look.layout.opponents).cellSize,
    theme,
  };
  return { paints, keys: nextKeys, flashes: nextFlashes, view, streaks };
}
