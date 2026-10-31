import { countdownLabel, type OnlineMatchState, type OnlineRoom } from '@shura/client-core';
import { Box, Text } from 'ink';
import { boardRows } from '../../board/board';
import type { Look } from '../../board/look';
import { opponentBoardRows } from '../../board/opponent-board';
import { overlayRows } from '../../board/overlay';

export interface MatchViewProps {
  readonly match: OnlineMatchState;
  readonly room: OnlineRoom | null;
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
export function MatchView({ match, room, look, ghost, ping }: MatchViewProps) {
  const nameOf = (id: string) =>
    room?.players.find((player) => player.id === id)?.nickname ?? 'player';
  const me = match.players.find(({ playerId }) => playerId === match.playerId);
  const opponents = match.players.filter((game) => game !== me);
  const label = me ? countdownLabel({ ...match, engine: me.engine }) : null;
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
          <Text bold>{nameOf(game.playerId)}</Text>
          <Rows rows={opponentBoardRows(game.engine, look, { out: game.out !== null })} />
          {game.out && <Text dimColor>{OUT_WORDS[game.out.reason]}</Text>}
        </Box>
      ))}
    </Box>
  );
}
