import { errorText, formatWait, type OnlineSession, type TimerClock } from '@shura/client-core';
import { Box, Text } from 'ink';
import { useState } from 'react';
import { useStore } from 'zustand';
import { useScreenKeys } from '../../platform/input/use-screen-keys';
import { useNow } from './use-now';

export interface WaitingViewProps {
  readonly session: OnlineSession;
  /** Times the wait. */
  readonly clock: TimerClock;
  readonly active: boolean;
  /** Back to the *Play online* menu. */
  readonly onBack: () => void;
}

/** The time since the view opened, or since `restart`, in ms, updated every half second. */
function useWaited(clock: TimerClock): { ms: number; restart: () => void } {
  const [since, setSince] = useState(() => clock.now());
  const now = useNow(clock, true);
  return { ms: Math.max(0, now - since), restart: () => setSince(clock.now()) };
}

/**
 * The quick-match waiting screen (design §13.2, §9.4): the time waited and Esc to cancel; once
 * paired, the opponent's name until the countdown; and after a quick-match opponent left, "Opponent
 * left", with Enter to queue again.
 */
export function WaitingView({ session, clock, active, onBack }: WaitingViewProps) {
  const room = useStore(session, (state) => state.room);
  const quickMatch = useStore(session, (state) => state.quickMatch);
  const sessionId = useStore(session, (state) => state.sessionId);
  const error = useStore(session, (state) => state.error);
  // Only an error from here on is about the queue: one from before is the menu's.
  const [before] = useState(error);
  const { ms, restart } = useWaited(clock);
  const opponent = room?.players.find(({ id }) => id !== sessionId);
  const left = !room && quickMatch === 'opponentLeft';

  useScreenKeys({ active, clock }, ({ key }, press) => {
    if (!press) return;
    if (key.escape) {
      if (room) session.leaveRoom();
      else if (!left) session.cancelQuickMatch();
      onBack();
    } else if (key.return && left) {
      session.quickMatch();
      restart();
    }
  });

  return (
    <Box flexDirection="column" width={56} marginTop={2}>
      <Text bold color="yellow">
        QUICK MATCH
      </Text>
      <Box flexDirection="column" marginY={1}>
        {room ? (
          <>
            <Text bold>Opponent found: {opponent?.nickname ?? '…'}</Text>
            <Text dimColor>The match starts in a moment.</Text>
          </>
        ) : left ? (
          <>
            <Text bold>Opponent left.</Text>
            <Text dimColor>Queue again for another 1v1.</Text>
          </>
        ) : (
          <>
            <Text>
              Looking for an opponent… <Text bold>{formatWait(ms)}</Text>
            </Text>
            <Text dimColor>A 1v1 against the next player who asks.</Text>
          </>
        )}
      </Box>
      {error && error !== before && (
        <Text color="yellow">{errorText(error.code, error.message)}</Text>
      )}
      <Text dimColor>
        {room ? 'Esc leave' : left ? 'Enter queue again  Esc back' : 'Esc cancel'}
      </Text>
    </Box>
  );
}
