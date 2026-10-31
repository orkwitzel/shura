import type { SoloSessionState } from '@shura/client-core';
import { Box, Text } from 'ink';
import { formatFrames } from '../format';
import type { MenuCommand } from './game-menu';

/** A label and its value, as the results screen shows them. */
export interface ResultField {
  readonly label: string;
  readonly value: string;
}

/** What the results screen shows of a game that ended (design §13.1). */
export interface Results {
  /** The mode's name. */
  readonly title: string;
  readonly outcome: 'FINISHED' | 'GAME OVER';
  /** The mode's headline: Sprint's time, or the score. */
  readonly headline: ResultField;
  /** Lines, pieces, pieces per second, the score or time the headline isn't, and the level. */
  readonly stats: readonly ResultField[];
}

/** Pieces per second over the game's frames, to two decimals. */
function piecesPerSecond(pieces: number, frames: number): string {
  return (frames === 0 ? 0 : (pieces * 60) / frames).toFixed(2);
}

/**
 * The results of an ended game. Sprint's headline is its time; every other mode's is its score, and
 * the time moves into the stats.
 */
export function resultsOf(state: SoloSessionState): Results {
  const { finished, frame, linesCleared, piecesPlaced, score, level } = state.engine;
  const time: ResultField = { label: 'TIME', value: formatFrames(frame) };
  const points: ResultField = { label: 'SCORE', value: String(score) };
  const timed = state.mode === 'sprint';
  return {
    title: state.mode.toUpperCase(),
    outcome: finished ? 'FINISHED' : 'GAME OVER',
    headline: timed ? time : points,
    stats: [
      { label: 'LINES', value: String(linesCleared) },
      { label: 'PIECES', value: String(piecesPlaced) },
      { label: 'PPS', value: piecesPerSecond(piecesPlaced, frame) },
      timed ? points : time,
      { label: 'LEVEL', value: String(level) },
    ],
  };
}

/** The width of a label and value row. */
const WIDTH = 24;

function Field({ field, bold = false }: { field: ResultField; bold?: boolean }) {
  return (
    <Box width={WIDTH} justifyContent="space-between">
      <Text dimColor>{field.label}</Text>
      <Text bold={bold}>{field.value}</Text>
    </Box>
  );
}

export interface ResultsScreenProps {
  readonly state: SoloSessionState;
  /** The keys the screen takes, listed at the bottom: play again, and back. */
  readonly keys: readonly Pick<MenuCommand, 'hint' | 'label'>[];
  /** The personal best line ("new personal best", or how far off it the run was), if any. */
  readonly personalBest?: string;
}

/** An ended game's results: the outcome, the headline, the stats, and the keys. */
export function ResultsScreen({ state, keys, personalBest }: ResultsScreenProps) {
  const results = resultsOf(state);
  return (
    <Box flexDirection="column" width={WIDTH} marginTop={2}>
      <Text dimColor>{results.title}</Text>
      <Text bold>{results.outcome}</Text>
      <Box flexDirection="column" marginY={1}>
        <Field field={results.headline} bold />
        {personalBest !== undefined && <Text>{personalBest}</Text>}
      </Box>
      {results.stats.map((field) => (
        <Field key={field.label} field={field} />
      ))}
      <Box flexDirection="column" marginTop={1}>
        {keys.map(({ hint, label }) => (
          <Box key={hint} gap={2}>
            <Text bold>{hint}</Text>
            <Text>{label}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
