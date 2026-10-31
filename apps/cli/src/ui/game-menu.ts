import type { KeyName } from '../input/terminal-input';

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

/**
 * The in-game menu as lines to draw over the board: a title, then each command's keys and label
 * in two columns, with a blank line around them.
 */
export function menuLines(title: string, commands: readonly MenuCommand[]): string[] {
  const width = Math.max(...commands.map((command) => command.hint.length)) + 2;
  return [
    '',
    title,
    '',
    ...commands.map((command) => `${command.hint.padEnd(width)}${command.label}`),
    '',
  ];
}
