import { useEffect, useState } from 'react';
import type { Viewport } from '../utils/cell-size';

function readViewport(): Viewport {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: window.devicePixelRatio || 1,
  };
}

/**
 * The window's size and pixel ratio, again after each resize and each change of the pixel ratio
 * (browser zoom, or a move to another screen), which a media query on the current ratio hears.
 */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    let ratio: MediaQueryList | null = null;
    const update = () => {
      setViewport((last) => {
        const now = readViewport();
        const same =
          now.width === last.width &&
          now.height === last.height &&
          now.pixelRatio === last.pixelRatio;
        return same ? last : now;
      });
      watchRatio();
    };
    const watchRatio = () => {
      ratio?.removeEventListener('change', update);
      ratio = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      ratio.addEventListener('change', update);
    };
    watchRatio();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      ratio?.removeEventListener('change', update);
    };
  }, []);
  return viewport;
}
