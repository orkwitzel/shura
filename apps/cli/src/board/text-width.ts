import cliTruncate from 'cli-truncate';
import stringWidth from 'string-width';

// Text measured in terminal columns, as the terminal draws it, not in UTF-16 units: a combining
// mark (niqqud, an accent) takes none, a wide character (CJK) two. A name padded or cut by
// `.length` would push a board's wall or a table's column out of line.

/** `text` cut to at most `width` columns, never through a character. */
export function cutTo(text: string, width: number): string {
  if (stringWidth(text) <= width) return text;
  return cliTruncate(text, width, { truncationCharacter: '' });
}

/** `text` padded with spaces to at least `width` columns on the right, never cut. */
export function fillTo(text: string, width: number): string {
  return `${text}${' '.repeat(Math.max(0, width - stringWidth(text)))}`;
}

/** `text` cut to `width` columns, then padded with spaces to exactly `width` on the right. */
export function padTo(text: string, width: number): string {
  return fillTo(cutTo(text, width), width);
}

/** `text` cut to `width` columns and centred in them, any odd column on the right. */
export function centerIn(text: string, width: number): string {
  const cut = cutTo(text, width);
  const left = Math.floor((width - stringWidth(cut)) / 2);
  return padTo(`${' '.repeat(left)}${cut}`, width);
}
