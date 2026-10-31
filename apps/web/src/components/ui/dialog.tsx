import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from 'react';
import styles from './dialog.module.css';

export interface DialogProps {
  /** Whether it shows. Its owner decides: Esc only asks, through `onClose`. */
  readonly open: boolean;
  /** The heading, which also names the dialog. */
  readonly title: ReactNode;
  /** Asked for when the player presses Esc (or the browser asks to close it some other way). */
  readonly onClose: () => void;
  readonly children?: ReactNode;
}

/**
 * A modal panel on the native `<dialog>` (design §13.2): `showModal()` keeps the focus inside and
 * makes the page behind inert. It is controlled: Esc calls `onClose` instead of closing it, so the
 * owner's state stays the truth. Put `autoFocus` on the control the focus should start on.
 */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== 'Escape') return;
    // Stops the browser closing the dialog itself (its `cancel`), which `onCancel` would repeat.
    event.preventDefault();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={styles.dialog}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {open && children}
    </dialog>
  );
}
