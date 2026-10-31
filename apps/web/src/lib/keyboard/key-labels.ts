/**
 * Display names for web key names. A web key name is the key's `KeyboardEvent.code` (design §7.4):
 * the physical key, so the names are the US layout's.
 */
const NAMES: Readonly<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .',
  NumpadEnter: 'Num Enter',
};

/** The modifiers, which come as a left and a right key: `ControlLeft` is "Left Ctrl". */
const MODIFIERS: Readonly<Record<string, string>> = {
  Control: 'Ctrl',
  Shift: 'Shift',
  Alt: 'Alt',
  Meta: 'Meta',
};

/** How a key is shown to people: `KeyX` is "X", `ArrowLeft` "←", `ControlLeft` "Left Ctrl". */
export function keyLabel(code: string): string {
  const named = NAMES[code];
  if (named !== undefined) return named;
  const letterOrDigit = /^(?:Key|Digit)(.)$/.exec(code);
  if (letterOrDigit) return letterOrDigit[1] as string;
  const numpad = /^Numpad(\d)$/.exec(code);
  if (numpad) return `Num ${numpad[1]}`;
  const modifier = /^(Control|Shift|Alt|Meta)(Left|Right)$/.exec(code);
  if (modifier) return `${modifier[2]} ${MODIFIERS[modifier[1] as string]}`;
  return code;
}
