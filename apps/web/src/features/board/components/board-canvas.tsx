import {
  SKINS,
  type SkinId,
  type SoloSession,
  type SoloSessionState,
  THEMES,
  type ThemeId,
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
import { createPixiApp, destroyPixiApp, type PixiSize, resizePixiApp } from '@/lib/pixi/pixi-app';
import { useViewport } from '../hooks/use-viewport';
import { createBoardPainter } from '../pixi/board-painter';
import { type BoardFit, fitBoard } from '../utils/cell-size';
import { boardRegions, LAYOUT_CELLS, layoutBoard, type Rect } from '../utils/layout-board';
import styles from './board-canvas.module.css';

export interface BoardCanvasProps {
  /** The game to draw. */
  readonly session: SoloSession;
  /** Shown over the well (the visible 20 rows): the countdown, callouts, the end of the game. */
  readonly overlay?: ReactNode;
  /** Shown in the column under the hold: the HUD. */
  readonly aside?: ReactNode;
}

/** What the board is drawn with, besides the game: the settings and the window. */
interface Look {
  readonly theme: ThemeId;
  readonly skin: SkinId;
  readonly ghost: boolean;
  readonly fit: BoardFit;
}

const sizeOf = ({ cellSize }: BoardFit, resolution: number): PixiSize => ({
  width: LAYOUT_CELLS.width * cellSize,
  height: LAYOUT_CELLS.height * cellSize,
  resolution,
});

const place = ({ x, y, width, height }: Rect): CSSProperties => ({
  left: x,
  top: y,
  width,
  height,
});

/**
 * A session's board, hold and preview, drawn by Pixi (design §13.2, Boards), centred in the window
 * at the largest cell size that fits it. A Pixi application is made on mount and destroyed on
 * unmount. On each tick of Pixi's own ticker, outside React's render cycle, it reads the session's
 * store and repaints when the game, the settings or the window changed, so React never re-renders
 * per frame. React draws the labels and whatever is given to show over the well and beside it.
 */
export function BoardCanvas({ session, overlay, aside }: BoardCanvasProps) {
  const theme = useSettings((settings) => settings.theme);
  const skin = useSettings((settings) => settings.skin);
  const ghost = useSettings((settings) => settings.ghost);
  const viewport = useViewport();
  const fit = useMemo(() => fitBoard(viewport), [viewport]);
  const regions = boardRegions(fit.cellSize);
  const host = useRef<HTMLDivElement>(null);

  // The ticker reads the look from here, so a change needs no new application.
  const look = useRef<Look>({ theme, skin, ghost, fit });
  const resolution = useRef(viewport.pixelRatio);
  useLayoutEffect(() => {
    look.current = { theme, skin, ghost, fit };
    resolution.current = viewport.pixelRatio;
  }, [theme, skin, ghost, fit, viewport.pixelRatio]);

  useEffect(() => {
    let gone = false;
    let stop = () => {};
    void createPixiApp(sizeOf(look.current.fit, resolution.current)).then((app) => {
      if (gone) {
        destroyPixiApp(app);
        return;
      }
      host.current?.appendChild(app.canvas);
      const painter = createBoardPainter(app);
      let drawn: { state: SoloSessionState; look: Look } | null = null;
      const draw = () => {
        const state = session.getState();
        const now = look.current;
        if (drawn?.state === state && drawn.look === now) return;
        if (drawn?.look.fit !== now.fit) resizePixiApp(app, sizeOf(now.fit, resolution.current));
        const { theme, skin, ghost, fit } = now;
        painter.paint(
          layoutBoard(state.engine, THEMES[theme], SKINS[skin], fit.cellSize, { ghost }),
        );
        drawn = { state, look: now };
      };
      app.ticker.add(draw);
      stop = () => {
        app.ticker.remove(draw);
        destroyPixiApp(app);
      };
    });
    return () => {
      gone = true;
      stop();
    };
  }, [session]);

  const layoutStyle = {
    left: fit.x,
    top: fit.y,
    width: LAYOUT_CELLS.width * fit.cellSize,
    height: LAYOUT_CELLS.height * fit.cellSize,
    '--cell-size': `${fit.cellSize}px`,
  } as CSSProperties;
  /** A box's label, in the cell above its frame. */
  const labelOf = (box: Rect): CSSProperties => ({
    ...place({ ...box, y: box.y - fit.cellSize, height: fit.cellSize * 0.8 }),
  });
  return (
    <div className={styles.stage}>
      <div className={styles.layout} style={layoutStyle}>
        <div ref={host} className={styles.canvas} />
        <span className={styles.label} style={labelOf(regions.hold)}>
          Hold
        </span>
        <span className={styles.label} style={labelOf(regions.preview)}>
          Next
        </span>
        {aside !== undefined && (
          <div className={styles.aside} style={place(regions.aside)}>
            {aside}
          </div>
        )}
        {overlay !== undefined && (
          <div className={styles.overlay} style={place(regions.well)}>
            {overlay}
          </div>
        )}
      </div>
    </div>
  );
}
