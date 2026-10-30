import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  type Action,
  createEngine,
  ENGINE_VERSION,
  FFA,
  MARATHON,
  type ModeSettings,
  ONE_VS_ONE,
  restoreEngine,
  SPRINT,
  ULTRA,
} from '../../src/index';
import { byFrame, VersusMatch } from './versus';

/** The presets, by the name a recorded match gives its mode. */
export const PRESETS = {
  marathon: MARATHON,
  sprint: SPRINT,
  ultra: ULTRA,
  '1v1': ONE_VS_ONE,
  ffa: FFA,
} as const satisfies Record<string, ModeSettings>;

export type PresetName = keyof typeof PRESETS;

/** What every recorded match holds besides its players' actions and hashes. */
interface MatchSetup {
  description: string;
  /** The `ENGINE_VERSION` the expected hashes were recorded with. */
  engineVersion: number;
  seed: number;
  /** The mode, whose preset the match plays (`settingsOf`). */
  mode: PresetName;
  /**
   * Settings that replace the preset's, for a match that tests a rule rather than a mode: the rule
   * matches play Sprint without its line goal, as the rule tests do.
   */
  settings?: Partial<ModeSettings>;
  /** The frame the replay steps to. */
  lastFrame: number;
}

/**
 * The mode settings a recorded match plays: its mode's preset as the engine exports it now, so a
 * change to a preset shows in the replay-hash suite, with any settings the match replaces.
 */
export function settingsOf({
  mode,
  settings,
}: Pick<MatchSetup, 'mode' | 'settings'>): ModeSettings {
  const preset: ModeSettings | undefined = PRESETS[mode];
  if (!preset) throw new Error(`no preset is named ${JSON.stringify(mode)}`);
  return settings ? { ...preset, ...settings } : preset;
}

/**
 * A recorded match (design §5.3): everything needed to replay a game, and the hash each player's
 * game must end on. It is either one player's game or a 1v1 match.
 */
export type RecordedMatch = SoloMatch | VersusRecordedMatch;

/** One player's game. */
export interface SoloMatch extends MatchSetup {
  playerIndex: number;
  expectedHash: string;
  actions: Action[];
}

/**
 * A 1v1 match: player `i`'s game is `players[i]`. The replay plays the server's part as
 * `VersusMatch` does, so the garbage queued on each player comes from the other's attacks, and lands
 * where their `garbageAccepted` actions say.
 */
export interface VersusRecordedMatch extends MatchSetup {
  players: RecordedPlayer[];
}

export interface RecordedPlayer {
  expectedHash: string;
  actions: Action[];
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

/** The hash each player's game must end on, by player. */
export function expectedHashes(match: RecordedMatch): string[] {
  return 'players' in match
    ? match.players.map(({ expectedHash }) => expectedHash)
    : [match.expectedHash];
}

/** `match` with the expected hashes `hashes`, by player. */
export function withHashes(match: RecordedMatch, hashes: readonly string[]): RecordedMatch {
  const hash = (player: number) => hashes[player] ?? '';
  if ('players' in match) {
    const players = match.players.map((player, index) => ({
      ...player,
      expectedHash: hash(index),
    }));
    return { ...match, players };
  }
  return { ...match, expectedHash: hash(0) };
}

/**
 * Plays a recorded match through and returns the final hash of each player's game. With `restoreAt`,
 * every engine is serialized and restored at that frame on the way.
 */
export function replay(match: RecordedMatch, { restoreAt = -1 } = {}): string[] {
  if ('players' in match) return replayVersus(match, restoreAt);
  const { actions, lastFrame } = match;
  const engine = createEngine(settingsOf(match), match.seed, match.playerIndex);
  if (restoreAt < 0) {
    engine.step(lastFrame, actions);
    return [engine.hash()];
  }
  engine.step(
    restoreAt,
    actions.filter((action) => action.frame <= restoreAt),
  );
  const restored = restoreEngine(engine.serialize());
  restored.step(
    lastFrame,
    actions.filter((action) => action.frame > restoreAt),
  );
  return [restored.hash()];
}

function replayVersus(match: VersusRecordedMatch, restoreAt: number): string[] {
  const game = new VersusMatch(settingsOf(match), match.seed);
  const frames = match.players.map(({ actions }) => byFrame(actions, match.lastFrame));
  for (let frame = 1; frame <= match.lastFrame; frame++) {
    if (frame - 1 === restoreAt) game.restore();
    game.playFrame(
      frame,
      frames.map((actions) => actions[frame] ?? []),
    );
  }
  return game.engines.map((engine) => engine.hash());
}

/** Replays a recorded match twice. Returns why it fails, or `null` if both runs match the record. */
export function checkRecordedMatch(file: string, match: RecordedMatch): string | null {
  const first = replay(match).join(', ');
  const second = replay(match).join(', ');
  if (first !== second) {
    return `${file} ended on ${first}, then on ${second}, from the same input. The engine is no longer deterministic: find what reads state outside the engine (docs/design.md §5.1).`;
  }
  if (match.engineVersion !== ENGINE_VERSION) {
    return `${file} was recorded with engine version ${match.engineVersion}, but ENGINE_VERSION is ${ENGINE_VERSION}. Re-record it: ${RECORD_COMMAND}`;
  }
  const expected = expectedHashes(match).join(', ');
  if (first !== expected) {
    return [
      `${file} ended on hash ${first}, but ${expected} was recorded. Game outcomes changed.`,
      'If the change is unintended, it is a bug: fix it rather than re-recording.',
      `If it is intended, bump ENGINE_VERSION in packages/engine/src/version.ts and re-record in the same PR: ${RECORD_COMMAND}`,
      '(During M1, before any release, ENGINE_VERSION stays at 1 and only the re-record is needed.)',
    ].join('\n');
  }
  return null;
}

/** Rewrites every recorded match with the hashes and engine version of the current engine. */
export function recordAll(): { file: string; changed: boolean }[] {
  return loadRecordedMatches().map(({ file, match }) => {
    const hashes = replay(match);
    const changed =
      hashes.join() !== expectedHashes(match).join() || match.engineVersion !== ENGINE_VERSION;
    if (changed) {
      writeRecordedMatch(file, { ...withHashes(match, hashes), engineVersion: ENGINE_VERSION });
    }
    return { file, changed };
  });
}

/** Writes a recorded match with one action per line, so diffs stay readable. */
export function writeRecordedMatch(file: string, match: RecordedMatch): void {
  let head: string;
  let body: string;
  if ('players' in match) {
    const { players, ...rest } = match;
    head = headOf(rest);
    const objects = players.map(
      ({ expectedHash, actions }) =>
        `    {\n      "expectedHash": ${JSON.stringify(expectedHash)},\n      "actions": [\n${actionLines(actions, 8)}\n      ]\n    }`,
    );
    body = `  "players": [\n${objects.join(',\n')}\n  ]`;
  } else {
    const { actions, ...rest } = match;
    head = headOf(rest);
    body = `  "actions": [\n${actionLines(actions, 4)}\n  ]`;
  }
  writeFileSync(new URL(file, RECORDED_MATCHES_DIR), `${head},\n${body}\n}\n`);
}

/** The fields of `rest` as the start of a pretty-printed object, without its closing brace. */
function headOf(rest: object): string {
  return fillNumberArrays(JSON.stringify(rest, null, 2)).slice(0, -2);
}

/** `actions` one to a line, indented by `indent` spaces. */
function actionLines(actions: readonly Action[], indent: number): string {
  return actions.map((action) => `${' '.repeat(indent)}${inlineJson(action)}`).join(',\n');
}

/** Biome's line width. */
const LINE_WIDTH = 100;

/**
 * Lays out each array of numbers in pretty-printed `json` as Biome does: on one line if it fits,
 * or else as many numbers to a line as fit, indented one level.
 */
function fillNumberArrays(json: string): string {
  return json.replace(
    /^( *)(.*)\[\n((?: *-?\d+,?\n)+) *\](,?)$/gm,
    (_, indent: string, key: string, body: string, comma: string) => {
      const numbers = body.split(/[\s,]+/).filter(Boolean);
      const oneLine = `${indent}${key}[${numbers.join(', ')}]${comma}`;
      if (oneLine.length <= LINE_WIDTH) return oneLine;
      const inner = `${indent}  `;
      const lines: string[] = [];
      let line = '';
      for (const number of numbers) {
        const next = line ? `${line}, ${number}` : `${inner}${number}`;
        // Every line but the last ends in a comma.
        if (line && next.length + 1 > LINE_WIDTH) {
          lines.push(`${line},`);
          line = `${inner}${number}`;
        } else {
          line = next;
        }
      }
      lines.push(line);
      return `${indent}${key}[\n${lines.join('\n')}\n${indent}]${comma}`;
    },
  );
}

/** `{ "frame": 1, "type": "moveLeft" }`, as Biome formats a one-line object. */
function inlineJson(object: object): string {
  const fields = Object.entries(object).map(([key, value]) => `"${key}": ${JSON.stringify(value)}`);
  return `{ ${fields.join(', ')} }`;
}
