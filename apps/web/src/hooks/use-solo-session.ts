import {
  createSoloSession,
  handlingFrames,
  type SoloMode,
  type SoloSession,
} from '@shura/client-core';
import { useSettingsStore, useSoloRecord } from '@shura/client-core/react';
import { useEffect, useState } from 'react';
import { createRafClock } from '@/lib/raf-clock';
import { useGameKeys } from './use-game-keys';
import { useSessionHandling } from './use-session-handling';

/** A solo session made by `useSoloSession`, with what the page needs around it. */
export interface UseSoloSessionResult {
  /** The session: pass it to the features that show it. */
  readonly session: SoloSession;
  /**
   * The results' personal best line for the game that has just ended, once it has been recorded
   * (design §13.1, Personal bests), or `undefined`.
   */
  readonly personalBest: string | undefined;
  /**
   * Starts the game's clock, and with it the countdown: call it once the board is on screen, so a
   * slow start-up isn't taken for a stall (design §13.2, Boards). Calling it again does nothing.
   */
  readonly start: () => void;
}

export interface UseSoloSessionOptions {
  /**
   * Whether keys reach the game: `false` while the settings are open over it (design §7.4), which
   * lets go of every key held and ignores every key until it is `true` again. `true` by default.
   */
  readonly acceptKeys?: boolean;
}

/**
 * A single-player session of `mode` for as long as the component is mounted (design §13.1,
 * apps/web/AGENTS.md, State). It runs on the `requestAnimationFrame` clock, whose time only runs
 * from `start`, with the saved handling, and stops on unmount. It takes the keys from the window
 * through the web adapter and the saved bindings (game keys don't scroll the page); Esc and P open
 * the in-game menu, unless something on the page has already handled them. When the window loses
 * focus, every held key is let go and the menu opens (design §13.2, Keyboard). Changed handling or
 * bindings apply at once. Each game that ends goes to the records once.
 */
export function useSoloSession(
  mode: SoloMode,
  { acceptKeys = true }: UseSoloSessionOptions = {},
): UseSoloSessionResult {
  const settings = useSettingsStore();
  // Made during the first render, on a clock that wakes nothing (and whose time stands still) until
  // `start`, so a session React makes and throws away (as Strict Mode does) never runs.
  const [{ session, clock }] = useState(() => {
    const clock = createRafClock();
    const { handling } = settings.getState();
    return {
      clock,
      session: createSoloSession({ mode, clock, handling: handlingFrames(handling) }),
    };
  });
  useEffect(() => () => clock.stop(), [clock]);

  useSessionHandling(session);

  useGameKeys({
    game: session,
    now: clock.now,
    acceptKeys,
    onMenu: session.pause,
    onAway: session.pause,
  });

  const personalBest = useSoloRecord(session);
  return { session, personalBest, start: clock.start };
}
