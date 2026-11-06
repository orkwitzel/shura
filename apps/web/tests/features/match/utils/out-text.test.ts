import { expect, test } from 'vitest';
import { spectatingText } from '@/features/match/utils/out-text';

test('the spectating banner says why you watch: not playing, or how you went out', () => {
  expect(spectatingText({ playing: false, out: null, ended: false })).toBe(
    'you take a seat at the next lobby',
  );
  expect(spectatingText({ playing: true, out: { reason: 'laggedOut' }, ended: false })).toBe(
    'You lagged out · watching the rest',
  );
});

test('no banner while you play, nor once the match has ended', () => {
  expect(spectatingText({ playing: true, out: null, ended: false })).toBeNull();
  expect(spectatingText({ playing: false, out: null, ended: true })).toBeNull();
  expect(spectatingText({ playing: true, out: { reason: 'toppedOut' }, ended: true })).toBeNull();
});
