import { Toaster, toast } from 'sonner';
import styles from './toasts.module.css';

/** How long a toast stays, in ms. */
const TOAST_MS = 3500;

/**
 * Where toasts show (design §13.2, Lobby: joins, leaves, host changes, and the server's errors):
 * Sonner's toaster at the top of the screen, unstyled and dressed in the arcade look. The app
 * mounts one, in its shell.
 */
export function Toasts() {
  return (
    <Toaster
      position="top-center"
      duration={TOAST_MS}
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
 * Shows `text` as a toast: `tone` `alert` for something that went wrong. A toast with an `id`
 * replaces the one showing with the same id, so saying it twice shows it once.
 */
export function showToast(text: string, tone: 'info' | 'alert' = 'info', id?: string): void {
  toast(text, {
    ...(tone === 'alert' && { className: styles.alert }),
    ...(id !== undefined && { id }),
  });
}
