/**
 * How the terminal draws colour: 24-bit, the 16 ANSI colours, or none (`--no-color` / `NO_COLOR`),
 * which draws cells as glyphs instead, whatever the skin.
 */
export type ColorMode = 'truecolor' | 'ansi16' | 'none';

/**
 * How to draw colour (design §13.3): glyphs with `--no-color` or a non-empty `NO_COLOR`
 * (no-color.org), 24-bit when `COLORTERM` says the terminal has it, else the 16 ANSI colours.
 */
export function detectColorMode(
  noColor: boolean,
  env: Readonly<Record<string, string | undefined>>,
): ColorMode {
  if (noColor || env.NO_COLOR) return 'none';
  if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') return 'truecolor';
  return 'ansi16';
}
