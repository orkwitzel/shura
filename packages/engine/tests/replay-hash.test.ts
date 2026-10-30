import { describe, expect, test } from 'vitest';
import { ENGINE_VERSION } from '../src/index';
import {
  checkRecordedMatch,
  loadRecordedMatches,
  RECORD_COMMAND,
  type RecordedMatch,
} from './support/recorded-matches';

const matches = loadRecordedMatches();

describe('replay-hash suite', () => {
  test('has recorded matches', () => {
    expect(matches.length).toBeGreaterThan(0);
  });

  test.each(matches)('$file replays to its recorded hash', ({ file, match }) => {
    const failure = checkRecordedMatch(file, match);
    if (failure) expect.fail(failure);
  });
});

describe('a failing recorded match', () => {
  const [sample] = matches;
  if (!sample) throw new Error('no recorded matches to test the failure messages with');

  test('explains how to re-record and when to bump ENGINE_VERSION', () => {
    const changed: RecordedMatch = { ...sample.match, expectedHash: '0123456789abcdef' };
    const failure = checkRecordedMatch(sample.file, changed);
    expect(failure).toContain(sample.file);
    expect(failure).toContain('0123456789abcdef');
    expect(failure).toContain(RECORD_COMMAND);
    expect(failure).toContain('ENGINE_VERSION');
  });

  test('asks for a re-record when it was made by another engine version', () => {
    const old: RecordedMatch = { ...sample.match, engineVersion: ENGINE_VERSION + 1 };
    const failure = checkRecordedMatch(sample.file, old);
    expect(failure).toContain(`engine version ${ENGINE_VERSION + 1}`);
    expect(failure).toContain(RECORD_COMMAND);
  });
});
