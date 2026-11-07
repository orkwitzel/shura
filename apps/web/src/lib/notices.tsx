import { Toaster, toast } from 'sonner';
import styles from './notices.module.css';

/** How long a notice stays, in ms. */
const NOTICE_MS = 3500;

/**
 * Where notices show (glossary: Notice; design §13.2, Lobby: joins, leaves, host changes, and the
 * server's errors): Sonner's toaster at the top of the screen, unstyled and dressed in the arcade
 * look, each notice one of its toasts. The app mounts one, in its shell.
 */
export function Notices() {
  return (
    <Toaster
      position="top-center"
      duration={NOTICE_MS}
      visibleToasts={4}
      gap={10}
      containerAriaLabel="Notices"
      toastOptions={{
        unstyled: true,
        classNames: { toast: styles.toast, title: styles.title },
      }}
    />
  );
}

/**
 * Shows `text` as a notice: `tone` `alert` for something that went wrong. A notice with an `id`
 * replaces the one showing with the same id, so saying it twice shows it once.
 */
export function showNotice(text: string, tone: 'info' | 'alert' = 'info', id?: string): void {
  toast(text, {
    ...(tone === 'alert' && { className: styles.alert }),
    ...(id !== undefined && { id }),
  });
}
