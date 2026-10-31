import { describe, expect, test } from 'vitest';
import { streaksForRoutings } from '@/features/board/effects/utils/streaks-for-routings';

const routing = (id: number, from: string, to: string, lines = 2) => ({
  id,
  from,
  to,
  lines,
  holeSeed: 9,
});

describe('streaksForRoutings (design §13.2, Match: the attack streak)', () => {
  test('makes one streak per garbage routing, from the attacker to the target', () => {
    const streaks = streaksForRoutings([routing(1, 'bo', 'me'), routing(2, 'me', 'cy', 4)], 'full');
    expect(streaks).toEqual([
      { type: 'streak', from: 'bo', to: 'me', lines: 2 },
      { type: 'streak', from: 'me', to: 'cy', lines: 4 },
    ]);
  });

  test('keeps them under Reduced, since they say who attacked whom', () => {
    expect(streaksForRoutings([routing(1, 'bo', 'me')], 'reduced')).toHaveLength(1);
  });

  test('makes none with effects off', () => {
    expect(streaksForRoutings([routing(1, 'bo', 'me'), routing(2, 'me', 'bo')], 'off')).toEqual([]);
  });
});
