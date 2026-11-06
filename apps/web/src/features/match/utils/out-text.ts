import type { OutReason } from '@shura/protocol';

const YOU_OUT: Readonly<Record<OutReason, string>> = {
  toppedOut: 'You topped out',
  laggedOut: 'You lagged out',
  removed: 'You were removed',
  left: 'You left the match',
};

/** What the spectating banner says to someone watching a match they don't play in. */
const WATCHING_TEXT = 'you take a seat at the next lobby';

/** What the spectating banner says once you're out (design §13.2, Match; §10.2). */
export function youOutText(reason: OutReason): string {
  return `${YOU_OUT[reason]} · watching the rest`;
}

/**
 * What the spectating banner says (design §13.2, Match, Spectating): why you watch, if you play
 * in the match and are out, or if you don't play in it. `null`, no banner, while you play and once
 * the match has ended.
 */
export function spectatingText({
  playing,
  out,
  ended,
}: {
  /** Whether the match is yours: you have a board in it. */
  readonly playing: boolean;
  /** How you went out, if you did. */
  readonly out: { readonly reason: OutReason } | null;
  readonly ended: boolean;
}): string | null {
  if (ended) return null;
  if (!playing) return WATCHING_TEXT;
  return out && youOutText(out.reason);
}
