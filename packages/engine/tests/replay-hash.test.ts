import { describe, expect, test } from 'vitest';
import { ActionType, createEngine, ENGINE_VERSION, MARATHON, SPRINT } from '../src/index';
import {
  checkRecordedMatch,
  expectedHashes,
  loadRecordedMatches,
  PRESETS,
  RECORD_COMMAND,
  type RecordedMatch,
  replay,
  settingsOf,
  withHashes,
} from './support/recorded-matches';

const matches = loadRecordedMatches();
const versusMatches = matches.filter(({ match }) => match.players.length === 2);

describe('replay-hash suite', () => {
  test('has recorded matches', () => {
    expect(matches.length).toBeGreaterThan(0);
  });

  test('has a recorded 2-player match', () => {
    expect(versusMatches.length).toBeGreaterThan(0);
  });

  test.each(matches)('$file replays to its recorded hash', ({ file, match }) => {
    const failure = checkRecordedMatch(file, match);
    if (failure) expect.fail(failure);
  });
});

describe('a recorded match', () => {
  test.each(matches)("$file names its mode's preset", ({ match }) => {
    expect(Object.keys(PRESETS)).toContain(match.mode);
  });

  test('plays the preset itself, so changing a preset changes its replay', () => {
    expect(settingsOf({ mode: 'marathon' })).toBe(MARATHON);
  });

  test("that tests a rule rather than a mode can change some of its preset's settings", () => {
    expect(settingsOf({ mode: 'sprint', settings: { lineGoal: null } })).toEqual({
      ...SPRINT,
      lineGoal: null,
    });
  });
});

describe.each(versusMatches)('the 2-player match $file', ({ match }) => {
  // As the players' clients play it: their engines land garbage themselves and record where.
  const { accepted, hashes } = replay(match, { acceptGarbage: true });

  test('lands garbage on both players', () => {
    for (const actions of accepted) expect(actions.length).toBeGreaterThan(0);
  });

  test("records each attack sent in the opponent's log, as a garbageReceived at the next frame", () => {
    const recorded = match.players.map(({ actions }) =>
      actions.filter((action) => action.type === ActionType.GarbageReceived),
    );
    for (const actions of recorded) expect(actions.length).toBeGreaterThan(0);
    expect(replay(match).received).toEqual(recorded);
  });

  test("replays each player's log on its own to their hash: the log is the whole input", () => {
    const alone = match.players.map(({ actions }, index) => {
      const engine = createEngine(settingsOf(match), match.seed, index);
      engine.step(match.lastFrame, actions);
      return engine.hash();
    });
    expect(alone).toEqual(expectedHashes(match));
  });

  test('records the garbageAccepted actions that clients accepting garbage record', () => {
    const recorded = match.players.map(({ actions }) =>
      actions.filter((action) => action.type === ActionType.GarbageAccepted),
    );
    expect(accepted).toEqual(recorded);
  });

  test('ends on the same hashes when clients accept garbage as when the server replays it', () => {
    expect(hashes).toEqual(expectedHashes(match));
  });
});

describe('a failing recorded match', () => {
  const [sample] = matches;
  if (!sample) throw new Error('no recorded matches to test the failure messages with');

  test('explains how to re-record and when to bump ENGINE_VERSION', () => {
    const changed = withHashes(sample.match, ['0123456789abcdef']);
    const failure = checkRecordedMatch(sample.file, changed);
    expect(failure).toContain(sample.file);
    expect(failure).toContain('0123456789abcdef');
    expect(failure).toContain(RECORD_COMMAND);
    expect(failure).toContain('ENGINE_VERSION');
  });

  test("fails a 2-player match when one player's hash changes", () => {
    const [versus] = versusMatches;
    if (!versus) throw new Error('no recorded 2-player match');
    const [first = ''] = expectedHashes(versus.match);
    const changed = withHashes(versus.match, [first, '0123456789abcdef']);
    expect(checkRecordedMatch(versus.file, changed)).toContain('0123456789abcdef');
  });

  test('asks for a re-record when it was made by another engine version', () => {
    const old: RecordedMatch = { ...sample.match, engineVersion: ENGINE_VERSION + 1 };
    const failure = checkRecordedMatch(sample.file, old);
    expect(failure).toContain(`engine version ${ENGINE_VERSION + 1}`);
    expect(failure).toContain(RECORD_COMMAND);
  });
});
