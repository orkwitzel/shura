import { matchCountdownLabel, type OnlineMatchState } from '@shura/client-core';
import { Box, Text } from 'ink';
import { boardRows } from '../../board/board';
import type { Look } from '../../board/look';
import { opponentBoardRows } from '../../board/opponent-board';
import { overlayRows } from '../../board/overlay';

export interface MatchViewProps {
  readonly match: OnlineMatchState;
  /** Every nickname seen, by player id. */
  readonly names: ReadonlyMap<string, string>;
  readonly look: Look;
  readonly ghost: boolean;
  readonly ping: number | null;
}

/** How a player went out, in words (design §13.2). */
export const OUT_WORDS = {
  toppedOut: 'topped out',
  laggedOut: 'lagged out',
  removed: 'removed',
  left: 'left',
} as const;

function Rows({ rows }: { rows: readonly string[] }) {
  return (
    <>
      {rows.map((row, index) => (
        // The rows are positions, so their index is their identity.
        <Text key={index}>{row}</Text>
      ))}
    </>
  );
}

/**
 * An online match, bare-bones (#67 brings the real screen): your board with the countdown over
 * it, and beside it each opponent's half-block board (design §13.3) with their name, and whether
 * they're out.
 */
export function MatchView({ match, names, look, ghost, ping }: MatchViewProps) {
  const { me } = match;
  const opponents = match.players.filter(({ playerId }) => playerId !== me?.playerId);
  const label = matchCountdownLabel(match);
  return (
    <Box flexDirection="row">
      {me && (
        <Box flexDirection="column" marginRight={2}>
          <Rows
            rows={overlayRows(boardRows(me.engine, { ...look, ghost }), label ? [label] : [])}
          />
          <Text dimColor>
            {me.out ? `You ${OUT_WORDS[me.out.reason]}` : 'You'}
            {ping !== null && `  ping ${Math.round(ping)} ms`}
          </Text>
        </Box>
      )}
      {opponents.map((game) => (
        <Box key={game.playerId} flexDirection="column" marginRight={2} marginTop={2}>
          <Text bold>{names.get(game.playerId) ?? 'player'}</Text>
          <Rows rows={opponentBoardRows(game.engine, look, { out: game.out !== null })} />
          {game.out && <Text dimColor>{OUT_WORDS[game.out.reason]}</Text>}
        </Box>
      ))}
    </Box>
  );
}
