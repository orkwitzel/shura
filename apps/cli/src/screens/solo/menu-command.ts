import type { KeyName } from '../../platform/input/terminal-input';

/**
 * One of a screen's own shortcuts, outside the game controls: an in-game menu entry (design §7.4),
 * or a key on the results screen.
 */
export interface MenuCommand {
  /** The keys that run it, by their binding names (`escape`, `enter`, a letter). */
  readonly keys: readonly KeyName[];
  /** The keys as shown (`Esc`, `R`). */
  readonly hint: string;
  readonly label: string;
  readonly run: () => void;
}
