/**
 * Terminal key sequences the adapter tests send. An unmodified arrow press is the same bytes with
 * the Kitty protocol as without it; a repeat (event type 2) or release (3) only the protocol sends.
 */
export const CSI = '\x1b[';
export const LEFT = `${CSI}D`;
export const RIGHT = `${CSI}C`;
export const DOWN = `${CSI}B`;
export const LEFT_REPEAT = `${CSI}1;1:2D`;
export const LEFT_RELEASE = `${CSI}1;1:3D`;
/** A Space press, as the Kitty protocol sends it with every key reported as an escape code. */
export const SPACE_KITTY = `${CSI}32u`;
