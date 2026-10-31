import type { KeyName } from '../platform/input/terminal-input';

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

/** The command `key` runs, if any. */
export function commandFor(
  commands: readonly MenuCommand[],
  key: KeyName | null,
): MenuCommand | undefined {
  return key === null ? undefined : commands.find((command) => command.keys.includes(key));
}

/** The in-game menu's width: the board's 20 columns, less one each side. */
const MENU_WIDTH = 18;

/**
 * The in-game menu as lines to draw over the board: a title, then each command's label with its keys
 * at the right, with a blank line around them.
 */
export function menuLines(title: string, commands: readonly MenuCommand[]): string[] {
  return [
    '',
    title,
    '',
    ...commands.map(({ label, hint }) => `${label.padEnd(MENU_WIDTH - hint.length)}${hint}`),
    '',
  ];
}
