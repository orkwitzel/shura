import { formatFrames, formatScore, type SoloSessionState, timeLeft } from '@shura/client-core';
import { Box, Text } from 'ink';

/** A HUD label and its value. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>{label}</Text>
      <Text bold>{value}</Text>
    </Box>
  );
}

/** Lines cleared, out of the mode's line goal if it has one. */
function linesOf({ linesCleared, settings }: SoloSessionState['engine']): string {
  return settings.lineGoal === null ? String(linesCleared) : `${linesCleared}/${settings.lineGoal}`;
}

/** Sprint: the time since Go and the lines towards 40. */
function SprintHud({ state }: { state: SoloSessionState }) {
  return (
    <>
      <Stat label="TIME" value={formatFrames(state.engine.frame)} />
      <Stat label="LINES" value={linesOf(state.engine)} />
    </>
  );
}

/** Marathon: the level, the lines towards 150 and the score. */
function MarathonHud({ state }: { state: SoloSessionState }) {
  return (
    <>
      <Stat label="LEVEL" value={String(state.engine.level)} />
      <Stat label="LINES" value={linesOf(state.engine)} />
      <Stat label="SCORE" value={formatScore(state.engine.score)} />
    </>
  );
}

/** Ultra: the time left of the 2 minutes, and the score. */
function UltraHud({ state }: { state: SoloSessionState }) {
  return (
    <>
      <Stat label="TIME LEFT" value={formatFrames(timeLeft(state.engine) ?? 0)} />
      <Stat label="SCORE" value={formatScore(state.engine.score)} />
    </>
  );
}

/** The mode's numbers beside the board. */
export function Hud({ state }: { state: SoloSessionState }) {
  switch (state.mode) {
    case 'sprint':
      return <SprintHud state={state} />;
    case 'marathon':
      return <MarathonHud state={state} />;
    case 'ultra':
      return <UltraHud state={state} />;
  }
}
