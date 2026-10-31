import type { OutReason } from '@shura/protocol';

const YOU_OUT: Readonly<Record<OutReason, string>> = {
  toppedOut: 'You topped out',
  laggedOut: 'You lagged out',
  removed: 'You were removed',
  left: 'You left the match',
};

/** What the spectating banner says once you're out (design §13.2, Match; §10.2). */
export function youOutText(reason: OutReason): string {
  return `${YOU_OUT[reason]} · watching the rest`;
}
