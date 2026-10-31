import { formatFrames, formatScore, type SoloSessionState, soloResult } from '@shura/client-core';
import { Box, Text } from 'ink';
import type { MenuCommand } from '../../board/game-menu';

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

/**
 * What the results screen shows of an ended game, from client-core's `soloResult` (design §13.1):
 * Sprint's headline is its time, every other mode's its score, and whichever of the two isn't the
 * headline goes with the stats.
 */
export function resultsOf(state: SoloSessionState): Results {
  const result = soloResult(state);
  const time: ResultField = { label: 'TIME', value: formatFrames(result.frames) };
  const score: ResultField = { label: 'SCORE', value: formatScore(result.score) };
  const timed = result.headline.kind === 'time';
  return {
    title: state.mode.toUpperCase(),
    outcome: result.outcome === 'finished' ? 'FINISHED' : 'GAME OVER',
    headline: timed ? time : score,
    stats: [
      { label: 'LINES', value: String(result.lines) },
      { label: 'PIECES', value: String(result.pieces) },
      { label: 'PPS', value: result.piecesPerSecond.toFixed(2) },
      timed ? score : time,
      { label: 'LEVEL', value: String(result.level) },
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
