import { expect, test } from 'vitest';
import {
  atSpawn,
  createEngine,
  ENGINE_VERSION,
  nextRandom,
  ONE_VS_ONE,
  SPAWN_ROW,
} from '../src/index';

test('ENGINE_VERSION is a positive integer', () => {
  expect(Number.isInteger(ENGINE_VERSION)).toBe(true);
  expect(ENGINE_VERSION).toBeGreaterThan(0);
});

test('atSpawn gives a new piece at SPAWN_ROW, centred and rounded left', () => {
  expect(SPAWN_ROW).toBe(21);
  expect(atSpawn('T')).toEqual({ kind: 'T', col: 3, row: 21, rotation: 0 });
  expect(atSpawn('I')).toEqual({ kind: 'I', col: 3, row: 21, rotation: 0 });
  expect(atSpawn('O')).toEqual({ kind: 'O', col: 4, row: 21, rotation: 0 });
});

test('atSpawn is where the engine spawns a piece, before it drops a row', () => {
  const { kind, col, row } = createEngine(ONE_VS_ONE, 7, 0).state.active;
  expect({ col, row: row + 1 }).toEqual({ col: atSpawn(kind).col, row: SPAWN_ROW });
});

test('nextRandom is a pure step: the same state gives the same value and next state', () => {
  const [value, next] = nextRandom(42);
  expect(nextRandom(42)).toEqual([value, next]);
  expect(Number.isInteger(value) && value >= 0 && value < 2 ** 32).toBe(true);
  expect(nextRandom(next)[0]).not.toBe(value);
});
