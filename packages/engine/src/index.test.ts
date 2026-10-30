import { expect, test } from 'vitest';
import { ENGINE_VERSION } from './index';

test('ENGINE_VERSION is a positive integer', () => {
  expect(Number.isInteger(ENGINE_VERSION)).toBe(true);
  expect(ENGINE_VERSION).toBeGreaterThan(0);
});
