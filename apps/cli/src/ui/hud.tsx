import { type SoloHeadline, type SoloSessionState, soloResult } from '@shura/client-core';
import { Box, Text } from 'ink';
import { formatFrames, formatScore } from '../format';

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
  const { frame, score, settings } = state.engine;
  const left = Math.max((settings.frameLimit ?? 0) - frame, 0);
  return (
    <>
      <Stat label="TIME LEFT" value={formatFrames(left)} />
      <Stat label="SCORE" value={formatScore(score)} />
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

/** A result's headline as text: Sprint's time, or the score. */
export function formatHeadline(headline: SoloHeadline): string {
  return headline.kind === 'time' ? formatFrames(headline.frames) : formatScore(headline.score);
}

/** The game's headline once it ends (the results screen shows the rest). */
export function Headline({ state }: { state: SoloSessionState }) {
  const result = soloResult(state);
  const finished = result.outcome === 'finished';
  return (
    <Box flexDirection="column">
      <Text bold>{finished ? 'FINISHED' : 'GAME OVER'}</Text>
      {finished && <Text bold>{formatHeadline(result.headline)}</Text>}
      <Text dimColor>Ctrl+C quits</Text>
    </Box>
  );
}
