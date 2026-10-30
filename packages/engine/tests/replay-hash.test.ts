import { describe, expect, test } from 'vitest';
import { type Action, ActionType, ENGINE_VERSION } from '../src/index';
import {
  checkRecordedMatch,
  expectedHashes,
  loadRecordedMatches,
  RECORD_COMMAND,
  type RecordedMatch,
  type VersusRecordedMatch,
  withHashes,
} from './support/recorded-matches';
import { byFrame, VersusMatch } from './support/versus';

const matches = loadRecordedMatches();
const versusMatches = matches.flatMap(({ file, match }) =>
  'players' in match ? [{ file, match }] : [],
);

describe('replay-hash suite', () => {
  test('has recorded matches', () => {
    expect(matches.length).toBeGreaterThan(0);
  });

  test('has a recorded 2-player match', () => {
    expect(versusMatches.map(({ match }) => match.players.length)).toContain(2);
  });

  test.each(matches)('$file replays to its recorded hash', ({ file, match }) => {
    const failure = checkRecordedMatch(file, match);
    if (failure) expect.fail(failure);
  });
});

/**
 * Plays `match` as the players' clients would: their engines land garbage themselves, from the
 * actions without `garbageAccepted`, and record where it landed.
 */
function playAccepting({ settings, seed, players, lastFrame }: VersusRecordedMatch) {
  const game = new VersusMatch(settings, seed, players.length);
  const frames = players.map(({ actions }) =>
    byFrame(
      actions.filter((action) => action.type !== ActionType.GarbageAccepted),
      lastFrame,
    ),
  );
  const accepted: Action[][] = players.map(() => []);
  for (let frame = 1; frame <= lastFrame; frame++) {
    const landed = game.playFrame(
      frame,
      frames.map((actions) => actions[frame] ?? []),
      { acceptGarbage: true },
    );
    for (const [player, actions] of landed.entries()) accepted[player]?.push(...actions);
  }
  return { accepted, hashes: game.engines.map((engine) => engine.hash()) };
}

describe.each(versusMatches)('the 2-player match $file', ({ match }) => {
  const { accepted, hashes } = playAccepting(match);

  test('lands garbage on both players', () => {
    for (const actions of accepted) expect(actions.length).toBeGreaterThan(0);
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
