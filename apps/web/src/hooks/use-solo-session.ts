import {
  createSoloSession,
  handlingFrames,
  type SoloMode,
  type SoloSession,
} from '@shura/client-core';
import { useSettings, useSettingsStore, useSoloRecord } from '@shura/client-core/react';
import { useEffect, useState } from 'react';
import { createWebAdapter } from '@/lib/keyboard/web-adapter';
import { createRafClock } from '@/lib/raf-clock';

export interface SoloGame {
  /** The session: pass it to the features that show it. */
  readonly session: SoloSession;
  /**
   * The results' personal best line for the game that has just ended, once it has been recorded
   * (design §13.1, Personal bests), or `undefined`.
   */
  readonly personalBest: string | undefined;
}

/**
 * A single-player session of `mode` for as long as the component is mounted (design §13.1,
 * apps/web/AGENTS.md, State): it starts with the countdown on mount and stops on unmount. It runs on
 * the `requestAnimationFrame` clock with the saved handling, and takes the keys from the window
 * through the web adapter and the saved bindings (game keys don't scroll the page). Changed
 * handling or bindings apply at once. Each game that ends goes to the records once.
 */
export function useSoloSession(mode: SoloMode): SoloGame {
  const settings = useSettingsStore();
  // Made during the first render, on a clock that wakes nothing until the effect below starts it,
  // so a session React makes and throws away (as Strict Mode does) never runs.
  const [{ session, clock }] = useState(() => {
    const clock = createRafClock();
    const { handling } = settings.getState();
    return {
      clock,
      session: createSoloSession({ mode, clock, handling: handlingFrames(handling) }),
    };
  });
  useEffect(() => {
    clock.start();
    return () => clock.stop();
  }, [clock]);

  const handling = useSettings((state) => state.handling);
  useEffect(() => session.setInput({ handling: handlingFrames(handling) }), [session, handling]);

  const bindings = useSettings((state) => state.bindings);
  useEffect(() => {
    const adapt = createWebAdapter(bindings);
    const onKey = (key: KeyboardEvent) => {
      const { event, preventDefault } = adapt({
        type: key.type === 'keydown' ? 'keydown' : 'keyup',
        code: key.code,
        repeat: key.repeat,
        time: clock.now(),
      });
      if (preventDefault) key.preventDefault();
      if (event) session.key(event);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [session, clock, bindings]);

  const personalBest = useSoloRecord(session);
  return { session, personalBest };
}
