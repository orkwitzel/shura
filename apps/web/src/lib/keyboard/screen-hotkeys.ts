import type { Options } from 'react-hotkeys-hook';

/**
 * How a screen's own keys (`useHotkeys`) listen, as the screens' keydown listeners on the window
 * did: from anywhere on the page, a focused control included; a key's press only, not the OS key
 * repeat; and not a key something on the page has already handled (`defaultPrevented`), so a
 * dialog or a waiting key capture keeps its Esc to itself. Keys match on `event.code` (the
 * library's default), so they don't move with the keyboard layout.
 */
export const SCREEN_HOTKEYS = {
  enableOnFormTags: true,
  ignoreEventWhen: (event: KeyboardEvent) => event.repeat || event.defaultPrevented,
} as const satisfies Options;
