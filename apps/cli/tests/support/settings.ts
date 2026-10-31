/**
 * The settings screen's row labelled `label` in a frame, as `[› ]<label> <value>`: the cursor if
 * it is on the row, then the label, then the value with its spaces squeezed. A row's label and
 * value are two or more spaces apart; the words of each, one.
 */
export function settingsRow(frame: string, label: string): string | undefined {
  for (const line of frame.split('\n')) {
    const match = /^\s*(› )?\s*(\S+(?: \S+)*)\s{2,}(.*?)\s*$/.exec(line);
    if (match?.[2] === label) {
      return `${match[1] ?? ''}${label} ${(match[3] ?? '').replace(/\s+/g, ' ')}`;
    }
  }
  return undefined;
}

/** Kitty-protocol key presses (design §7.3). */
export const SETTINGS_KEYS = {
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  enter: '\x1b[13u',
  escape: '\x1b[27u',
  backspace: '\x1b[127u',
  letter: (letter: string) => `\x1b[${letter.codePointAt(0)}u`,
};
