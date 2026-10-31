import {
  type Effects,
  type OnlineMatchState,
  type OnlineSession,
  SKINS,
  type SkinId,
  THEMES,
  type ThemeId,
  trackBackToBack,
} from '@shura/client-core';
import { useSettings } from '@shura/client-core/react';
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useStore } from 'zustand';
import { useEffects } from '@/hooks/use-effects';
import {
  addLayer,
  createPixiApp,
  destroyPixiApp,
  type PixiSize,
  placeLayer,
  resizePixiApp,
} from '@/lib/pixi/pixi-app';
import { createEffectsPainter } from '../effects/pixi/effects-painter';
import { createStreakPainter } from '../effects/pixi/streak-painter';
import type { EffectView } from '../effects/utils/effect-frame';
import { effectsForEvents } from '../effects/utils/effects-for-events';
import type { Point, StreakView } from '../effects/utils/streak-frame';
import { streaksForRoutings } from '../effects/utils/streaks-for-routings';
import { useViewport } from '../hooks/use-viewport';
import { createBoardPainter } from '../pixi/board-painter';
import type { Viewport } from '../utils/cell-size';
import {
  boardRegions,
  layoutBoard,
  layoutSmallBoard,
  meterTop,
  type Rect,
  smallBoardWell,
} from '../utils/layout-board';
import {
  layoutOpponents,
  MATCH_CELLS,
  type MatchLayout,
  NAME_ROWS,
} from '../utils/layout-opponents';
import { flashingAttack, followMeter, type MeterFlash } from '../utils/meter-flash';
import styles from './match-canvas.module.css';

export interface MatchCanvasProps {
  /** The online session whose current match to draw: one you play in, or one you spectate. */
  readonly session: OnlineSession;
  /** CSS pixels kept clear across the top, for the spectating banner while it shows. */
  readonly top?: number;
  /** Shown in the row over each player's board: their name. */
  readonly name: (playerId: string) => ReactNode;
  /** Shown over an opponent's well: an out board's place and why. */
  readonly opponentOverlay?: (playerId: string) => ReactNode;
  /** Shown over your well: the countdown, your place once you're out. */
  readonly overlay?: ReactNode;
  /** Shown in the column under your hold: the HUD and the callouts. */
  readonly aside?: ReactNode;
}

/** What the boards are drawn with, besides the match: the settings and the window. */
interface Look {
  readonly theme: ThemeId;
  readonly skin: SkinId;
  readonly ghost: boolean;
  readonly effects: Effects;
  readonly viewport: Viewport;
  readonly layout: MatchLayout;
}

/** One board on the stage: whose, its kind, and where its layout's top-left corner is. */
interface Board {
  readonly playerId: string;
  readonly kind: 'own' | 'full' | 'small';
  readonly x: number;
  readonly y: number;
  readonly cellSize: number;
}

/**
 * The match's players: you (`null` if you spectate), then everyone else in index order, written as
 * one string so a store selector can compare it.
 */
function castOf(match: OnlineMatchState | null): string {
  const own = match?.playerId ?? null;
  const opponents = (match?.players ?? [])
    .map(({ playerId }) => playerId)
    .filter((id) => id !== own);
  return [own ?? '', ...opponents].join(' ');
}

/** Each board's place on the stage, under its name row. */
function boardsOf(layout: MatchLayout, own: string | null, opponents: readonly string[]): Board[] {
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
const wellOf = ({ kind, cellSize }: Board): Rect =>
  kind === 'small' ? smallBoardWell(cellSize) : boardRegions(cellSize).well;

const sizeOf = ({ width, height }: Viewport, resolution: number): PixiSize => ({
  width,
  height,
  resolution,
});

const place = ({ x, y, width, height }: Rect): CSSProperties => ({
  left: x,
  top: y,
  width,
  height,
});

/**
 * An online match's boards, drawn by Pixi on one stage over the window (design §13.2, Match): your
 * board as in single-player plus its garbage meter, and the opponents' where `layoutOpponents`
 * puts them (a 1v1's full board, an FFA's small boards), each with its meter, the newest attack
 * flashing as it arrives, and greyed once out. It draws your game's effects as `BoardCanvas` does,
 * and an attack streak for each garbage routing, under the *Effects* setting; opponents' locks
 * make no effects. As in `BoardCanvas`, Pixi's ticker reads the session's store and repaints,
 * outside React's render cycle, and React draws the labels and what is given to show over the
 * boards. Spectating a match (design §13.2, Spectating), there is no board of your own: every
 * player's board is the same size in a grid. The boards stay under `top`, clear of a banner.
 */
export function MatchCanvas({
  session,
  top = 0,
  name,
  opponentOverlay,
  overlay,
  aside,
}: MatchCanvasProps) {
  const theme = useSettings((settings) => settings.theme);
  const skin = useSettings((settings) => settings.skin);
  const ghost = useSettings((settings) => settings.ghost);
  const effects = useEffects();
  const viewport = useViewport();
  // The players never change during a match, so this only changes with a new match.
  const cast = useStore(session, (state) => castOf(state.match));
  const { own, opponents } = useMemo(() => {
    const [mine = '', ...opponents] = cast.split(' ');
    return { own: mine === '' ? null : mine, opponents };
  }, [cast]);
  const layout = useMemo(
    () => layoutOpponents(viewport, opponents.length, { own: own !== null, top }),
    [viewport, own, opponents, top],
  );
  const boards = useMemo(() => boardsOf(layout, own, opponents), [layout, own, opponents]);
  const host = useRef<HTMLDivElement>(null);

  const look = useRef<Look>({ theme, skin, ghost, effects, viewport, layout });
  useLayoutEffect(() => {
    look.current = { theme, skin, ghost, effects, viewport, layout };
  }, [theme, skin, ghost, effects, viewport, layout]);

  useEffect(() => {
    if (own === null && opponents.length === 0) return;
    let gone = false;
    let stop = () => {};
    const resolution = () => look.current.viewport.pixelRatio;
    void createPixiApp(sizeOf(look.current.viewport, resolution())).then((app) => {
      if (gone) {
        destroyPixiApp(app);
        return;
      }
      host.current?.appendChild(app.canvas);
      // Each board on its own layer; yours has an inner one for the effects to shake.
      const layers = new Map(
        boardsOf(look.current.layout, own, opponents).map((board) => {
          const outer = addLayer(app);
          const inner = board.kind === 'own' ? addLayer(outer) : outer;
          return [board.playerId, { outer, inner, painter: createBoardPainter(inner) }] as const;
        }),
      );
      // Spectating, there's no game of your own: its effects layer stays empty.
      const ownLayer = (own !== null && layers.get(own)?.inner) || addLayer(app);
      const effectsPainter = createEffectsPainter(ownLayer);
      const streakPainter = createStreakPainter(app);
      const flashes = new Map<string, MeterFlash>();

      let drawn: { match: OnlineMatchState; look: Look; flashes: string } | null = null;
      let view: EffectView | null = null;
      let streakView: StreakView | null = null;
      const draw = () => {
        const match = session.getState().match;
        if (!match) return;
        const now = performance.now();
        const current = look.current;
        const { theme, skin, ghost, effects } = current;
        // Each board's newest attack, and the one flashing now.
        const flashing = new Map<string, number | undefined>();
        for (const game of match.players) {
          const flash = followMeter(flashes.get(game.playerId), game.engine.garbageMeter, now);
          flashes.set(game.playerId, flash);
          flashing.set(game.playerId, effects === 'off' ? undefined : flashingAttack(flash, now));
        }
        const flashKey = [...flashing.values()].join();
        if (drawn?.match !== match || drawn.look !== current || drawn.flashes !== flashKey) {
          const placed = boardsOf(current.layout, own, opponents);
          if (drawn?.look.viewport !== current.viewport) {
            resizePixiApp(app, sizeOf(current.viewport, current.viewport.pixelRatio));
          }
          // The layout changes with the window, and as a banner comes and goes.
          if (drawn?.look.layout !== current.layout) {
            for (const board of placed) {
              const layer = layers.get(board.playerId);
              if (layer) placeLayer(layer.outer, board.x, board.y);
            }
          }
          const games = new Map(match.players.map((game) => [game.playerId, game]));
          for (const board of placed) {
            const game = games.get(board.playerId);
            const layer = layers.get(board.playerId);
            if (!game || !layer) continue;
            const options = { flash: flashing.get(board.playerId), grey: game.out !== null };
            const drawWith = [THEMES[theme], SKINS[skin], board.cellSize] as const;
            if (board.kind === 'small') {
              layer.painter.paint(layoutSmallBoard(game.engine, ...drawWith, options));
              continue;
            }
            // Only your own board has a ghost, as in single-player.
            const full = layoutBoard(game.engine, ...drawWith, {
              ...options,
              meter: true,
              ghost: board.kind === 'own' && ghost,
            });
            layer.painter.paint(full);
            if (board.kind === 'own') {
              view = {
                layout: full,
                cellSize: board.cellSize,
                theme: drawWith[0],
                skin: drawWith[1],
              };
            }
          }
          const byId = new Map(placed.map((board) => [board.playerId, board]));
          // The streaks are sized for your board, or for the boards you watch.
          const ownCell = (current.layout.own ?? current.layout.opponents).cellSize;
          streakView = {
            origin: (id) => {
              const board = byId.get(id);
              if (!board) return null;
              const well = wellOf(board);
              return {
                x: board.x + well.x + well.width / 2,
                y: board.y + well.y + well.height / 2,
              };
            },
            target: (id): Point | null => {
              const board = byId.get(id);
              const game = games.get(id);
              if (!board || !game) return null;
              const top = meterTop(wellOf(board), board.cellSize, game.engine.garbageMeter);
              return { x: board.x + top.x, y: board.y + top.y };
            },
            cellSize: ownCell,
            theme: THEMES[theme],
          };
          if (effects === 'off') {
            effectsPainter.clear();
            streakPainter.clear();
          }
          drawn = { match, look: current, flashes: flashKey };
        }
        if (view) effectsPainter.paint(view, now);
        if (streakView) streakPainter.paint(streakView, now);
      };
      app.ticker.add(draw);

      // Your own game's effects; it never starts again, so the back-to-back needs no reset.
      const backToBack = trackBackToBack();
      const stopHearing = session.onEvents((events) => {
        effectsPainter.add(
          effectsForEvents(events, look.current.effects, backToBack.next),
          performance.now(),
        );
      });
      const stopRoutings = session.onRoutings((routing) => {
        streakPainter.add(streaksForRoutings([routing], look.current.effects), performance.now());
      });
      stop = () => {
        stopHearing();
        stopRoutings();
        backToBack.stop();
        app.ticker.remove(draw);
        destroyPixiApp(app);
      };
    });
    return () => {
      gone = true;
      stop();
    };
  }, [session, own, opponents]);

  return (
    <div className={styles.stage}>
      <div ref={host} className={styles.canvas} />
      {boards.map((board) => {
        const { playerId, kind, x, y, cellSize } = board;
        const rows = kind === 'small' ? NAME_ROWS.small : NAME_ROWS.full;
        const well = wellOf(board);
        const regions = kind === 'small' ? null : boardRegions(cellSize);
        const box = MATCH_CELLS[kind];
        /** A box's label, in the cell above its frame. */
        const labelOf = (rect: Rect): CSSProperties =>
          place({ ...rect, y: rect.y - cellSize, height: cellSize * 0.8 });
        return (
          <section
            key={playerId}
            className={styles.board}
            data-board={kind}
            aria-label={
              kind === 'own' ? 'Your board' : own === null ? 'Player’s board' : 'Opponent’s board'
            }
            style={
              {
                left: x,
                top: y,
                width: box.width * cellSize,
                height: (box.height - rows) * cellSize,
                '--cell-size': `${cellSize}px`,
              } as CSSProperties
            }
          >
            <div
              className={styles.name}
              style={place({
                x: well.x,
                y: -rows * cellSize,
                width: well.width,
                height: rows * cellSize,
              })}
            >
              {name(playerId)}
            </div>
            {regions && (
              <>
                <span className={styles.label} style={labelOf(regions.hold)}>
                  Hold
                </span>
                <span className={styles.label} style={labelOf(regions.preview)}>
                  Next
                </span>
              </>
            )}
            {kind === 'own' && regions && aside !== undefined && (
              <div className={styles.aside} style={place(regions.aside)}>
                {aside}
              </div>
            )}
            <div className={styles.overlay} style={place(well)}>
              {kind === 'own' ? overlay : opponentOverlay?.(playerId)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
