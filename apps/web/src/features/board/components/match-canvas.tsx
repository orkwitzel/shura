import { type OnlineSession, trackBackToBack } from '@shura/client-core';
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
import { useShallow } from 'zustand/react/shallow';
import { useEffects } from '@/hooks/use-effects';
import { createPixiApp, destroyPixiApp, type PixiSize, resizePixiApp } from '@/lib/pixi/pixi-app';
import type { EffectView } from '../effects/utils/effect-frame';
import { effectsForEvents } from '../effects/utils/effects-for-events';
import { streaksForRoutings } from '../effects/utils/streaks-for-routings';
import { useViewport } from '../hooks/use-viewport';
import { createMatchPainter } from '../pixi/match-painter';
import type { Viewport } from '../utils/cell-size';
import { boardRegions, type Rect } from '../utils/layout-board';
import { layoutOpponents, MATCH_CELLS, NAME_ROWS } from '../utils/layout-opponents';
import { type BoardKey, boardsOf, type MatchLook, matchFrame, wellOf } from '../utils/match-frame';
import type { MeterFlash } from '../utils/meter-flash';
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

/** What the boards are drawn with: the settings and where the boards go, and the window. */
interface Look extends MatchLook {
  readonly viewport: Viewport;
}

/** The match's players, you first (`null` if you spectate), then everyone else in index order. */
const castOf = ({ match }: ReturnType<OnlineSession['getState']>): (string | null)[] => {
  const own = match?.playerId ?? null;
  return [
    own,
    ...(match?.players ?? []).map(({ playerId }) => playerId).filter((id) => id !== own),
  ];
};

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
  const cast = useStore(session, useShallow(castOf));
  const { own, opponents } = useMemo(() => {
    const [mine = null, ...others] = cast;
    return { own: mine, opponents: others.filter((id) => id !== null) };
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
      let placed = boardsOf(look.current.layout, own, opponents);
      const painter = createMatchPainter(app, placed, own);
      let drawnLook: Look | null = null;
      let keys: ReadonlyMap<string, BoardKey> = new Map();
      let flashes: ReadonlyMap<string, MeterFlash> = new Map();
      let view: EffectView | null = null;
      const draw = () => {
        const match = session.getState().match;
        if (!match) return;
        const now = performance.now();
        const current = look.current;
        if (drawnLook?.viewport !== current.viewport) {
          resizePixiApp(app, sizeOf(current.viewport, current.viewport.pixelRatio));
        }
        // The layout changes with the window, and as a banner comes and goes.
        if (drawnLook?.layout !== current.layout) {
          placed = boardsOf(current.layout, own, opponents);
          painter.place(placed);
        }
        const frame = matchFrame({ match, look: current, boards: placed, keys, flashes, now });
        painter.paint(frame.paints);
        keys = frame.keys;
        flashes = frame.flashes;
        view = frame.view ?? view;
        if (drawnLook !== current && current.effects === 'off') {
          painter.effects.clear();
          painter.streaks.clear();
        }
        drawnLook = current;
        if (view) painter.effects.paint(view, now);
        painter.streaks.paint(frame.streaks, now);
      };
      app.ticker.add(draw);

      // Your own game's effects; it never starts again, so the back-to-back needs no reset.
      const backToBack = trackBackToBack();
      const stopHearing = session.onEvents((events) => {
        painter.effects.add(
          effectsForEvents(events, look.current.effects, backToBack.next),
          performance.now(),
        );
      });
      const stopRoutings = session.onRoutings((routing) => {
        painter.streaks.add(streaksForRoutings([routing], look.current.effects), performance.now());
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
