import type { KeyEvent } from '@shura/client-core';
import { useSettings } from '@shura/client-core/react';
import type { PieceActionType } from '@shura/engine';
import { useEffect, useRef } from 'react';
import type { KeyName } from '@/lib/keyboard/key-names';
import { createWebAdapter } from '@/lib/keyboard/web-adapter';

/** The keys that open the in-game menu during a game (design §7.4): fixed, not bindable. */
const MENU_KEYS: readonly KeyName[] = ['Escape', 'KeyP'];

export interface UseGameKeysOptions {
  /** Where the key events go: a single-player session, or the online session's match. */
  readonly game: { key(event: KeyEvent): void };
  /** The game's clock, which stamps each key event. */
  readonly now: () => number;
  /**
   * Whether keys reach the game: `false` while a menu or the settings are open over it, which lets
   * go of every key held and ignores every key until it is `true` again.
   */
  readonly acceptKeys: boolean;
  /** Esc or P, unless something on the page has already handled it: open the menu. */
  readonly onMenu: () => void;
  /** The window lost focus (`blur`, or hidden), after every held key was let go. */
  readonly onAway: () => void;
}

/**
 * A game's keys from the window (design §13.2, Keyboard), for as long as the component is mounted:
 * through the web adapter and the saved bindings, game keys not scrolling the page; Esc and P open
 * the menu. When the window loses focus every held key is let go, since its release would never be
 * heard, and `onAway` says so. Changed bindings apply at once.
 */
export function useGameKeys({ game, now, acceptKeys, onMenu, onAway }: UseGameKeysOptions): void {
  // The keys whose press reached the game, with the action each pressed, until released.
  const held = useRef(new Map<KeyName, PieceActionType>());
  const latest = useRef({ game, now, onMenu, onAway });
  latest.current = { game, now, onMenu, onAway };
  const letGo = useRef(() => {});
  letGo.current = () => {
    const time = now();
    for (const action of held.current.values()) game.key({ action, kind: 'release', time });
    held.current.clear();
  };

  const bindings = useSettings((state) => state.bindings);
  useEffect(() => {
    if (!acceptKeys) {
      letGo.current();
      return;
    }
    const adapt = createWebAdapter(bindings);
    const onKey = (key: KeyboardEvent) => {
      const down = key.type === 'keydown';
      if (down && MENU_KEYS.includes(key.code) && !key.repeat && !key.defaultPrevented) {
        // Taken, or the browser reads an Esc as a request to close the menu this opens: it would
        // close at once.
        key.preventDefault();
        latest.current.onMenu();
        return;
      }
      const { event, preventDefault } = adapt({
        type: down ? 'keydown' : 'keyup',
        code: key.code,
        repeat: key.repeat,
        time: latest.current.now(),
      });
      if (preventDefault) key.preventDefault();
      if (!event) return;
      if (event.kind === 'press') held.current.set(key.code, event.action);
      else held.current.delete(key.code);
      latest.current.game.key(event);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [bindings, acceptKeys]);

  // Keys released while the window has no focus are never heard, so losing it lets go of them all.
  useEffect(() => {
    const leave = () => {
      letGo.current();
      latest.current.onAway();
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
  }, []);
}
