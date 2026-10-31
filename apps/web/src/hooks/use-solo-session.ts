import {
  createSoloSession,
  handlingFrames,
  type SoloMode,
  type SoloSession,
} from '@shura/client-core';
import { useSettings, useSettingsStore, useSoloRecord } from '@shura/client-core/react';
import type { PieceActionType } from '@shura/engine';
import { useEffect, useRef, useState } from 'react';
import type { KeyName } from '@/lib/keyboard/key-names';
import { createWebAdapter } from '@/lib/keyboard/web-adapter';
import { createRafClock } from '@/lib/raf-clock';
import { useSessionHandling } from './use-session-handling';

/** The keys that open the in-game menu during a game (design §7.4): fixed, not bindable. */
const MENU_KEYS: readonly KeyName[] = ['Escape', 'KeyP'];

export interface SoloGame {
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

export interface SoloGameOptions {
  /**
   * Whether keys reach the game: `false` while the settings are open over it (design §7.4), which
   * lets go of every key held and ignores every key until it is `true` again. `true` by default.
   */
  readonly keys?: boolean;
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
export function useSoloSession(mode: SoloMode, { keys = true }: SoloGameOptions = {}): SoloGame {
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

  // The keys whose press reached the game, with the action each pressed, until released.
  const held = useRef(new Map<KeyName, PieceActionType>());
  const letGo = useRef(() => {});
  letGo.current = () => {
    const time = clock.now();
    for (const action of held.current.values()) session.key({ action, kind: 'release', time });
    held.current.clear();
  };

  const bindings = useSettings((state) => state.bindings);
  useEffect(() => {
    if (!keys) {
      letGo.current();
      return;
    }
    const adapt = createWebAdapter(bindings);
    const onKey = (key: KeyboardEvent) => {
      const down = key.type === 'keydown';
      if (down && MENU_KEYS.includes(key.code) && !key.repeat && !key.defaultPrevented) {
        session.pause();
        return;
      }
      const { event, preventDefault } = adapt({
        type: down ? 'keydown' : 'keyup',
        code: key.code,
        repeat: key.repeat,
        time: clock.now(),
      });
      if (preventDefault) key.preventDefault();
      if (!event) return;
      if (event.kind === 'press') held.current.set(key.code, event.action);
      else held.current.delete(key.code);
      session.key(event);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [session, clock, bindings, keys]);

  // Keys released while the window has no focus are never heard, so losing it lets go of them all.
  useEffect(() => {
    const leave = () => {
      letGo.current();
      session.pause();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') leave();
    };
    window.addEventListener('blur', leave);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', leave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [session]);

  const personalBest = useSoloRecord(session);
  return { session, personalBest, start: clock.start };
}
