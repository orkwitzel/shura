import { Dialog } from '@/components/ui/dialog';
import { type MenuItem, MenuList } from '@/components/ui/menu-list';
import styles from './match-menu.module.css';

export interface MatchMenuProps {
  readonly open: boolean;
  /** Back to game (Esc, or Enter on it, where the cursor starts). */
  readonly onBack: () => void;
  /** Leave match (Q). */
  readonly onLeave: () => void;
}

/**
 * The online menu (design §7.4): open over a match by Esc or P, or when the window lost focus. It
 * doesn't pause: the match goes on underneath it. Its own shortcuts: Back to game (Esc, or Enter
 * on it, where the cursor starts) and Leave match (Q). No Restart or Settings.
 */
export function MatchMenu({ open, onBack, onLeave }: MatchMenuProps) {
  const items: MenuItem[] = [
    { id: 'back', label: 'Back to game', shortcut: 'Escape', onSelect: onBack },
    { id: 'leave', label: 'Leave match', shortcut: 'KeyQ', onSelect: onLeave },
  ];
  return (
    <Dialog open={open} title="Menu" onClose={onBack}>
      <p className={styles.note}>The match goes on</p>
      <MenuList label="Match menu" items={items} initial="back" autoFocus />
    </Dialog>
  );
}
