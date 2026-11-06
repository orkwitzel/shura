import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  type Action,
  ActionType,
  ENGINE_VERSION,
  FFA,
  type GarbageAcceptedAction,
  type GarbageReceivedAction,
  MARATHON,
  type ModeSettings,
  ONE_VS_ONE,
  SPRINT,
  ULTRA,
} from '../../src/index';
import { byFrame, Match } from './match';

/** The presets, by the name a recorded match gives its mode. */
export const PRESETS = {
  marathon: MARATHON,
  sprint: SPRINT,
  ultra: ULTRA,
  '1v1': ONE_VS_ONE,
  ffa: FFA,
} as const satisfies Record<string, ModeSettings>;

export type PresetName = keyof typeof PRESETS;

/**
 * A recorded match (design §5.3): everything needed to replay a game, and the hash each player's
 * game must end on. A single-player mode's has one player; a 1v1's has two, and the replay plays
 * the server's part as `Match` does, so the garbage each player receives comes from the other's
 * attacks. Each player's log holds their `garbageReceived` actions, which must be the ones the
 * harness sends them, and their `garbageAccepted` actions, which say where it lands.
 */
export interface RecordedMatch {
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
  /** Each player's game, by player index. */
  players: RecordedPlayer[];
}

/**
 * The mode settings a recorded match plays: its mode's preset as the engine exports it now, so a
 * change to a preset shows in the replay-hash suite, with any settings the match replaces.
 */
export function settingsOf({
  mode,
  settings,
}: Pick<RecordedMatch, 'mode' | 'settings'>): ModeSettings {
  const preset: ModeSettings | undefined = PRESETS[mode];
  if (!preset) throw new Error(`no preset is named ${JSON.stringify(mode)}`);
  return settings ? { ...preset, ...settings } : preset;
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
  return match.players.map(({ expectedHash }) => expectedHash);
}

/** `match` with the expected hashes `hashes`, by player. */
export function withHashes(match: RecordedMatch, hashes: readonly string[]): RecordedMatch {
  const players = match.players.map((player, index) => ({
    ...player,
    expectedHash: hashes[index] ?? '',
  }));
  return { ...match, players };
}

export interface ReplayOptions {
  /** Serialize and restore every engine before every frame, as a reconnect would. */
  restoring?: boolean;
  /**
   * Play as the players' clients do: leave out the recorded `garbageAccepted` actions and let each
   * engine land garbage itself, recording where it did.
   */
  acceptGarbage?: boolean;
}

/** What a replay of a recorded match ended on and recorded, by player. */
export interface Replayed {
  /** The final hash of each player's game. */
  hashes: string[];
  /** The `garbageReceived` actions the harness gave each player. */
  received: GarbageReceivedAction[][];
  /** Accepting garbage, the `garbageAccepted` actions each player's engine recorded. */
  accepted: GarbageAcceptedAction[][];
}

/**
 * Plays a recorded match through in lockstep, frame by frame, with the harness sending the garbage
 * each player receives in place of the `garbageReceived` actions in their log.
 */
export function replay(
  match: RecordedMatch,
  { restoring = false, acceptGarbage = false }: ReplayOptions = {},
): Replayed {
  const { players, lastFrame } = match;
  const game = new Match(settingsOf(match), match.seed, players.length);
  const fromHarness = (type: ActionType) =>
    type === ActionType.GarbageReceived || (acceptGarbage && type === ActionType.GarbageAccepted);
  const frames = players.map(({ actions }) =>
    byFrame(
      actions.filter(({ type }) => !fromHarness(type)),
      lastFrame,
    ),
  );
  const received: GarbageReceivedAction[][] = players.map(() => []);
  const accepted: GarbageAcceptedAction[][] = players.map(() => []);
  for (let frame = 1; frame <= lastFrame; frame++) {
    if (restoring) game.restore();
    const played = game.playFrame(
      frame,
      frames.map((actions) => actions[frame] ?? []),
      { acceptGarbage },
    );
    for (const [player, actions] of played.received.entries()) received[player]?.push(...actions);
    for (const [player, actions] of played.accepted.entries()) accepted[player]?.push(...actions);
  }
  return { hashes: game.engines.map((engine) => engine.hash()), received, accepted };
}

/** Each player's `garbageReceived` actions in their log, by player. */
function receivedIn(match: RecordedMatch): GarbageReceivedAction[][] {
  return match.players.map(({ actions }) =>
    actions.filter(
      (action): action is GarbageReceivedAction => action.type === ActionType.GarbageReceived,
    ),
  );
}

/**
 * `actions` with its `garbageReceived` actions replaced by `received`, each first in its frame, as
 * the engine applies it.
 */
function withReceived(
  actions: readonly Action[],
  received: readonly GarbageReceivedAction[],
): Action[] {
  const rest = actions.filter((action) => action.type !== ActionType.GarbageReceived);
  const merged: Action[] = [];
  let next = 0;
  for (const action of rest) {
    while ((received[next]?.frame ?? Number.POSITIVE_INFINITY) <= action.frame) {
      merged.push(received[next++] as GarbageReceivedAction);
    }
    merged.push(action);
  }
  merged.push(...received.slice(next));
  return merged;
}

/** Replays a recorded match twice. Returns why it fails, or `null` if both runs match the record. */
export function checkRecordedMatch(file: string, match: RecordedMatch): string | null {
  const replayed = replay(match);
  const first = replayed.hashes.join(', ');
  const second = replay(match).hashes.join(', ');
  if (first !== second) {
    return `${file} ended on ${first}, then on ${second}, from the same input. The engine is no longer deterministic: find what reads state outside the engine (docs/design.md §5.1).`;
  }
  if (match.engineVersion !== ENGINE_VERSION) {
    return `${file} was recorded with engine version ${match.engineVersion}, but ENGINE_VERSION is ${ENGINE_VERSION}. Re-record it: ${RECORD_COMMAND}`;
  }
  if (JSON.stringify(replayed.received) !== JSON.stringify(receivedIn(match))) {
    return `${file}'s garbageReceived actions aren't the garbage the other player sends, at the frame after. Re-record it: ${RECORD_COMMAND}`;
  }
  const expected = expectedHashes(match).join(', ');
  if (first !== expected) {
    return [
      `${file} ended on hash ${first}, but ${expected} was recorded. Game outcomes changed.`,
      'If the change is unintended, it is a bug: fix it rather than re-recording.',
      `If it is intended, bump ENGINE_VERSION in packages/engine/src/version.ts and re-record in the same PR: ${RECORD_COMMAND}`,
    ].join('\n');
  }
  return null;
}

/**
 * Rewrites every recorded match with the hashes and engine version of the current engine, and the
 * `garbageReceived` actions the harness sends each player.
 */
export function recordAll(): { file: string; changed: boolean }[] {
  return loadRecordedMatches().map(({ file, match }) => {
    const { hashes, received } = replay(match);
    const players = withHashes(match, hashes).players.map((player, index) => ({
      ...player,
      actions: withReceived(player.actions, received[index] ?? []),
    }));
    const recorded: RecordedMatch = { ...match, engineVersion: ENGINE_VERSION, players };
    const changed = JSON.stringify(recorded) !== JSON.stringify(match);
    if (changed) writeRecordedMatch(file, recorded);
    return { file, changed };
  });
}

/** Writes a recorded match with one action per line, so diffs stay readable. */
export function writeRecordedMatch(file: string, match: RecordedMatch): void {
  const { players, ...rest } = match;
  const objects = players.map(
    ({ expectedHash, actions }) =>
      `    {\n      "expectedHash": ${JSON.stringify(expectedHash)},\n      "actions": [\n${actionLines(actions, 8)}\n      ]\n    }`,
  );
  const body = `  "players": [\n${objects.join(',\n')}\n  ]`;
  writeFileSync(new URL(file, RECORDED_MATCHES_DIR), `${headOf(rest)},\n${body}\n}\n`);
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
