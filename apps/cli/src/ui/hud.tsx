import type { SoloSessionState } from '@shura/client-core';
import { Box, Text } from 'ink';
import { formatFrames } from '../format';

/** A HUD label and its value. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>{label}</Text>
      <Text bold>{value}</Text>
    </Box>
  );
}

/** Sprint: the time since Go and the lines towards 40. */
function SprintHud({ state }: { state: SoloSessionState }) {
  const { frame, linesCleared, settings } = state.engine;
  return (
    <>
      <Stat label="TIME" value={formatFrames(frame)} />
      <Stat label="LINES" value={`${linesCleared}/${settings.lineGoal ?? 0}`} />
    </>
  );
}

/** The mode's numbers beside the board. */
export function Hud({ state }: { state: SoloSessionState }) {
  switch (state.mode) {
    case 'sprint':
      return <SprintHud state={state} />;
  }
}
