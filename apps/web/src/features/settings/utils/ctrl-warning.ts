import type { Bindings } from '@shura/client-core';

/** The browser's own Ctrl shortcuts that a page can't block, by the letter's key. */
const SHORTCUTS: readonly (readonly [code: string, shortcut: string])[] = [
  ['KeyW', 'Ctrl+W'],
  ['KeyT', 'Ctrl+T'],
  ['KeyN', 'Ctrl+N'],
];

const CTRL = ['ControlLeft', 'ControlRight'];

/** `a`, `a or b`, `a, b or c`. */
function orList(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
}

/**
 * The warning the settings screen shows when W, T or N is bound while Ctrl is (design §13.2,
 * Keyboard): browsers don't let a page block Ctrl+W, Ctrl+T or Ctrl+N, so pressing both closes the
 * tab or opens another. `null` when no such pair is bound.
 */
export function ctrlWarning(bindings: Bindings): string | null {
  const bound = new Set(Object.values(bindings).flat());
  if (!CTRL.some((key) => bound.has(key))) return null;
  const atRisk = SHORTCUTS.filter(([code]) => bound.has(code)).map(([, shortcut]) => shortcut);
  if (atRisk.length === 0) return null;
  return `Browsers don't let a page block ${orList(atRisk)}, so pressing it while playing can close or open a tab or window.`;
}
