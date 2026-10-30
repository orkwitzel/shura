import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { type Action, createEngine, ENGINE_VERSION, type ModeSettings } from '../../src/index';

/**
 * A recorded match (design §5.3): everything needed to replay one player's game, and the hash it
 * must end on.
 */
export interface RecordedMatch {
  description: string;
  /** The `ENGINE_VERSION` the expected hash was recorded with. */
  engineVersion: number;
  seed: number;
  playerIndex: number;
  settings: ModeSettings;
  /** The frame the replay steps to. */
  lastFrame: number;
  actions: Action[];
  expectedHash: string;
}

const RECORDED_MATCHES_DIR = new URL('../../recorded-matches/', import.meta.url);

export const RECORD_COMMAND = 'pnpm --filter @shura/engine record';

export function loadRecordedMatches(): { file: string; match: RecordedMatch }[] {
  return readdirSync(RECORDED_MATCHES_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      match: JSON.parse(readFileSync(new URL(file, RECORDED_MATCHES_DIR), 'utf8')) as RecordedMatch,
    }));
}

/** Plays a recorded match through and returns the final hash. */
export function replay(match: RecordedMatch): string {
  const engine = createEngine(match.settings, match.seed, match.playerIndex);
  engine.step(match.lastFrame, match.actions);
  return engine.hash();
}

/** Replays a recorded match twice. Returns why it fails, or `null` if both runs match the record. */
export function checkRecordedMatch(file: string, match: RecordedMatch): string | null {
  const first = replay(match);
  const second = replay(match);
  if (first !== second) {
    return `${file} ended on ${first}, then on ${second}, from the same input. The engine is no longer deterministic: find what reads state outside the engine (docs/design.md §5.1).`;
  }
  if (match.engineVersion !== ENGINE_VERSION) {
    return `${file} was recorded with engine version ${match.engineVersion}, but ENGINE_VERSION is ${ENGINE_VERSION}. Re-record it: ${RECORD_COMMAND}`;
  }
  if (first !== match.expectedHash) {
    return [
      `${file} ended on hash ${first}, but ${match.expectedHash} was recorded. Game outcomes changed.`,
      'If the change is unintended, it is a bug: fix it rather than re-recording.',
      `If it is intended, bump ENGINE_VERSION in packages/engine/src/version.ts and re-record in the same PR: ${RECORD_COMMAND}`,
      '(During M1, before any release, ENGINE_VERSION stays at 1 and only the re-record is needed.)',
    ].join('\n');
  }
  return null;
}

/** Rewrites every recorded match with the hash and engine version of the current engine. */
export function recordAll(): { file: string; changed: boolean }[] {
  return loadRecordedMatches().map(({ file, match }) => {
    const updated = {
      ...match,
      engineVersion: ENGINE_VERSION,
      expectedHash: replay(match),
    };
    const changed =
      updated.expectedHash !== match.expectedHash || updated.engineVersion !== match.engineVersion;
    if (changed) writeRecordedMatch(file, updated);
    return { file, changed };
  });
}

/** Writes a recorded match with one action per line, so diffs stay readable. */
export function writeRecordedMatch(file: string, match: RecordedMatch): void {
  const { actions, ...rest } = match;
  const head = JSON.stringify(rest, null, 2).slice(0, -2);
  const lines = actions.map((action) => `    ${inlineJson(action)}`).join(',\n');
  writeFileSync(
    new URL(file, RECORDED_MATCHES_DIR),
    `${head},\n  "actions": [\n${lines}\n  ]\n}\n`,
  );
}

/** `{ "frame": 1, "type": "moveLeft" }`, as Biome formats a one-line object. */
function inlineJson(object: object): string {
  const fields = Object.entries(object).map(([key, value]) => `"${key}": ${JSON.stringify(value)}`);
  return `{ ${fields.join(', ')} }`;
}
