import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { keyLabel } from '@/lib/keyboard/key-labels';
import styles from './menu-list.module.css';

/** One choice in a `MenuList`. */
export interface MenuItem {
  /** Tells the items apart; unique in the list. */
  readonly id: string;
  /** The item's name. */
  readonly label: ReactNode;
  /** Shown smaller beside the label, and read out as the item's description. */
  readonly detail?: ReactNode;
  /** Shown dimmed; the cursor passes over it and it can't be chosen. */
  readonly disabled?: boolean;
  /** A small heading shown above the item, starting a group of items. */
  readonly heading?: string;
  /**
   * A key that chooses the item from anywhere in the menu, by its `KeyboardEvent.code` (`KeyR`), so
   * the physical key works on any layout. Shown beside the label as a key cap.
   */
  readonly shortcut?: string;
  /** Called when the item is chosen: Enter (or Space) on it, or a click. */
  readonly onSelect: () => void;
}

export interface MenuListProps {
  /** The menu's accessible name. */
  readonly label: string;
  readonly items: readonly MenuItem[];
  /** The id of the item the cursor starts on, if it isn't disabled; the first enabled one if not. */
  readonly initial?: string;
  /** Focuses the cursor's item on mount, so the keys work at once. */
  readonly autoFocus?: boolean;
}

/** A key code as `aria-keyshortcuts` names it: `KeyR` is "R", `Escape` stays "Escape". */
const ariaKey = (code: string) => /^(?:Key|Digit)(.)$/.exec(code)?.[1] ?? code;

/** From `at`, the next enabled item in `direction`, or `at` itself if there's none. */
function step(items: readonly MenuItem[], at: number, direction: -1 | 1): number {
  for (let next = at + direction; next >= 0 && next < items.length; next += direction) {
    if (!items[next]?.disabled) return next;
  }
  return at;
}

/**
 * A vertical menu driven by the keyboard, as in the CLI (design §13.2): ↑ and ↓ move the cursor,
 * skipping disabled items and stopping at the ends, and Enter chooses. An item's shortcut key
 * chooses it at once (not with Ctrl, Alt or Meta, which keep their browser meaning). Each item is a native
 * button, so a click or Space chooses too. The cursor's item is the one in the tab order, and it
 * holds the focus while the menu has it (a roving tab index).
 */
export function MenuList({ label, items, initial, autoFocus = false }: MenuListProps) {
  const ids = useId();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [cursorId, setCursorId] = useState(() => {
    const start = items.find((item) => item.id === initial && !item.disabled);
    return (start ?? items.find((item) => !item.disabled))?.id;
  });
  const found = items.findIndex((item) => item.id === cursorId && !item.disabled);
  const cursor = found !== -1 ? found : step(items, -1, 1);

  const moveTo = (index: number) => {
    const id = items[index]?.id;
    if (id === undefined) return;
    setCursorId(id);
    buttons.current.get(id)?.focus();
  };

  // Only on mount: the menu takes the focus once, not whenever it re-renders.
  useEffect(() => {
    if (autoFocus && cursorId !== undefined) buttons.current.get(cursorId)?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    const modified = event.ctrlKey || event.altKey || event.metaKey;
    const chosen = modified ? undefined : items.find((item) => item.shortcut === event.code);
    if (chosen) {
      event.preventDefault();
      if (!chosen.disabled && !event.repeat) chosen.onSelect();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    moveTo(step(items, cursor, event.key === 'ArrowDown' ? 1 : -1));
  };

  return (
    <div role="menu" aria-label={label} className={styles.menu} onKeyDown={onKeyDown}>
      {items.flatMap((item, index) => {
        const current = index === cursor;
        const labelId = `${ids}-${item.id}-label`;
        const detailId = `${ids}-${item.id}-detail`;
        const entry = (
          <button
            key={item.id}
            ref={(button) => {
              if (button) buttons.current.set(item.id, button);
              else buttons.current.delete(item.id);
            }}
            type="button"
            role="menuitem"
            tabIndex={current ? 0 : -1}
            disabled={item.disabled}
            aria-labelledby={labelId}
            aria-describedby={item.detail === undefined ? undefined : detailId}
            aria-keyshortcuts={item.shortcut === undefined ? undefined : ariaKey(item.shortcut)}
            data-current={current || undefined}
            className={styles.item}
            onClick={item.onSelect}
            onPointerEnter={() => !item.disabled && moveTo(index)}
          >
            <span id={labelId} className={styles.label}>
              {item.label}
            </span>
            {item.shortcut !== undefined && (
              <kbd className={styles.shortcut}>{keyLabel(item.shortcut)}</kbd>
            )}
            {item.detail !== undefined && (
              <span id={detailId} className={styles.detail}>
                {item.detail}
              </span>
            )}
          </button>
        );
        if (item.heading === undefined) return [entry];
        // A visual heading only: the items' names say what they are.
        return [
          <div key={`${item.id}-heading`} aria-hidden="true" className={styles.heading}>
            {item.heading}
          </div>,
          entry,
        ];
      })}
    </div>
  );
}
