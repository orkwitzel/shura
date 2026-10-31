import type { OnlineMatchState, OnlineRoom } from '@shura/client-core';
import { Box, Text } from 'ink';

export interface LobbyViewProps {
  readonly room: OnlineRoom;
  readonly sessionId: string | null;
  readonly ping: number | null;
  /** The match that just ended, for its results line. */
  readonly last: OnlineMatchState | null;
  /** The latest error the server sent, if any. */
  readonly error: string | null;
}

/** 1st, 2nd, 3rd, 4th… */
export function ordinal(place: number): string {
  const tens = place % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] ?? 'th');
  return `${place}${suffix}`;
}

/** The last match in one line: your place and your stats (design §10.1, Results). */
export function resultLine(match: OnlineMatchState, sessionId: string | null): string | null {
  const { result } = match;
  if (!result) return null;
  const place = result.placements.find(({ playerId }) => playerId === sessionId)?.place;
  const stats = result.stats.find(({ playerId }) => playerId === sessionId);
  if (place === undefined || !stats) return 'Match over.';
  return (
    `Match over: you placed ${ordinal(place)} of ${result.placements.length}` +
    ` · ${stats.linesSent} lines sent · ${stats.apm.toFixed(1)} APM · ${stats.pps.toFixed(2)} PPS`
  );
}

/**
 * A room's lobby, bare-bones (#67 brings the real screen): its code and mode, the seats with who
 * is host and ready, the spectators, the ping, the last match's result, and the keys.
 */
export function LobbyView({ room, sessionId, ping, last, error }: LobbyViewProps) {
  const host = room.hostId === sessionId;
  const result = last && resultLine(last, sessionId);
  return (
    <Box flexDirection="column" width={78} marginTop={2}>
      <Text bold>
        ROOM {room.code} <Text dimColor>({room.mode})</Text>
        {ping !== null && <Text dimColor>{`  ping ${Math.round(ping)} ms`}</Text>}
      </Text>
      <Box flexDirection="column" marginY={1}>
        {room.players.map((player) => (
          <Text key={player.id}>
            {player.id === sessionId ? '› ' : '  '}
            {player.nickname}
            {player.id === room.hostId ? ' (host)' : ''}
            {'  '}
            <Text dimColor>
              {player.id === room.hostId ? '' : player.ready ? 'ready' : 'not ready'}
              {player.lastPlace !== undefined ? `  last: ${ordinal(player.lastPlace)}` : ''}
            </Text>
          </Text>
        ))}
        {room.spectators.length > 0 && (
          <Text dimColor>
            Watching: {room.spectators.map(({ nickname }) => nickname).join(', ')}
          </Text>
        )}
      </Box>
      {result && <Text>{result}</Text>}
      {error && <Text color="yellow">{error}</Text>}
      <Text dimColor>{host ? 'Enter start  Esc leave' : 'Enter ready  Esc leave'}</Text>
    </Box>
  );
}
