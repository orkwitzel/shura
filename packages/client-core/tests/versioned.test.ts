import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { errorMessage, loadStored, parseVersioned, type VersionedFormat } from '../src/index';
import { memoryStorage } from './support/memory-storage';

/**
 * A format at version 3 that has changed twice: version 1 had `speed`, version 2 renamed it
 * `das`, and version 3 counts it in ms rather than frames.
 */
const FORMAT: VersionedFormat<{ version: 3; das: number }> = {
  version: 3,
  schema: z.object({ version: z.literal(3), das: z.int().min(0) }),
  migrations: {
    1: ({ speed, ...rest }) => ({ ...rest, das: speed }),
    2: (older) => ({ ...older, das: Math.round(((older.das as number) * 1000) / 60) }),
  },
};

describe('reading a stored format', () => {
  test('takes data at the current version as it is', () => {
    expect(parseVersioned('{"version":3,"das":167}', FORMAT)).toEqual({
      value: { version: 3, das: 167 },
    });
  });

  test('migrates data from an older version, one version at a time', () => {
    expect(parseVersioned('{"version":1,"speed":10}', FORMAT)).toEqual({
      value: { version: 3, das: 167 },
    });
    expect(parseVersioned('{"version":2,"das":10}', FORMAT)).toEqual({
      value: { version: 3, das: 167 },
    });
  });

  test('checks migrated data against the schema', () => {
    expect(parseVersioned('{"version":1,"speed":-1}', FORMAT)).toEqual({
      problem: 'das: Too small: expected number to be >=0',
    });
  });

  test.each([
    ['not JSON', '{', 'it is not valid JSON'],
    ['no version', '{"das":167}', 'it has no version'],
    ['not an object', '[3]', 'it has no version'],
    ['a newer version', '{"version":4}', 'it is from a newer version of Shura (version 4)'],
    ['a version with no migration', '{"version":0}', 'version 0 is unknown'],
  ])('says what is wrong with %s', (_, text, problem) => {
    expect(parseVersioned(text, FORMAT)).toEqual({ problem });
  });
});

describe('loading a stored format', () => {
  test('is null when nothing is stored yet', () => {
    expect(loadStored(memoryStorage(), 'settings', FORMAT)).toBeNull();
  });

  test('gives the value, or what is wrong with it', () => {
    const storage = memoryStorage({ settings: { version: 1, speed: 10 }, records: '{' });
    expect(loadStored(storage, 'settings', FORMAT)).toEqual({ value: { version: 3, das: 167 } });
    expect(loadStored(storage, 'records', FORMAT)).toEqual({ invalid: 'it is not valid JSON' });
  });

  test('says why it could not be read', () => {
    const storage = {
      ...memoryStorage(),
      read: () => {
        throw new Error('permission denied');
      },
    };
    expect(loadStored(storage, 'settings', FORMAT)).toEqual({ unreadable: 'permission denied' });
  });
});

describe('errorMessage', () => {
  test('is an error’s message, or what was thrown as text', () => {
    expect(errorMessage(new Error('disk full'))).toBe('disk full');
    expect(errorMessage('disk full')).toBe('disk full');
  });
});
