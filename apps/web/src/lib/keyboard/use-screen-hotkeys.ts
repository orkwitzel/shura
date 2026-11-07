import { type HotkeyCallback, type Keys, type Options, useHotkeys } from 'react-hotkeys-hook';

/**
 * How a screen's own keys listen, as the screens' keydown listeners on the window did: from
 * anywhere on the page, a focused control included; a key's press only, not the OS key repeat;
 * and not a key something on the page has already handled (`defaultPrevented`), so a dialog or a
 * waiting key capture keeps its Esc to itself. Keys match on `event.code` (the library's default),
 * so they don't move with the keyboard layout.
 */
const SCREEN_HOTKEYS = {
  enableOnFormTags: true,
  ignoreEventWhen: (event: KeyboardEvent) => event.repeat || event.defaultPrevented,
} as const satisfies Options;

/**
 * A screen's own keys (react-hotkeys-hook's `useHotkeys`), listening as screens do
 * (`SCREEN_HOTKEYS`): each press it takes is handled (`preventDefault`), so the focused button
 * doesn't click itself as well and nothing else takes it, then `callback` runs. `options` add to
 * or override the screen's (`enabled`, or an `ignoreEventWhen` that lets the key repeat through).
 */
export function useScreenHotkeys(keys: Keys, callback: HotkeyCallback, options: Options = {}) {
  return useHotkeys(
    keys,
    (event, handler) => {
      event.preventDefault();
      callback(event, handler);
    },
    { ...SCREEN_HOTKEYS, ...options },
  );
}
