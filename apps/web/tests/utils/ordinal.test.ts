import { describe, expect, test } from 'vitest';
import { ordinal } from '@/utils/ordinal';

describe('ordinal', () => {
  test.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [8, '8th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [102, '102nd'],
  ])('%i is %s', (place, words) => {
    expect(ordinal(place)).toBe(words);
  });
});
