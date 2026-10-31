import type { SoloSessionState } from '@shura/client-core';
import { Box, Text } from 'ink';
import { boardRows, HIDDEN_ROWS_SHOWN } from '../render/board';
import { overlayRows } from '../render/overlay';
import type { ColorMode } from '../render/palette';
import { NO_PIECE, pieceRows } from '../render/piece';
import { Hud } from './hud';

export interface GameViewProps {
  readonly state: SoloSessionState;
  readonly colors: ColorMode;
  /** Whether to draw the ghost (a setting). */
  readonly ghost: boolean;
  /** The input adapter, for the status line. */
  readonly input: string;
  /** Lines drawn over the middle of the board: the countdown, or the in-game menu. */
  readonly overlay?: readonly string[];
}

/** Rows of pre-coloured strings, one `<Text>` each (design §13.3). */
function Rows({ rows }: { rows: readonly string[] }) {
  return (
    <>
      {rows.map((row, index) => (
        // The rows are positions, so their index is their identity.
        // biome-ignore lint/suspicious/noArrayIndexKey: rows never reorder
        <Text key={index}>{row}</Text>
      ))}
    </>
  );
}

/** Hold, on the left (design §13.3), greyed out once used for this piece. */
function Hold({ state, colors }: Pick<GameViewProps, 'state' | 'colors'>) {
  const { hold, holdUsed } = state.engine;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>HOLD</Text>
      <Rows rows={hold ? pieceRows(hold, colors, holdUsed) : NO_PIECE} />
    </Box>
  );
}

/** The next pieces, on the right (design §13.3). */
function Preview({ state, colors }: Pick<GameViewProps, 'state' | 'colors'>) {
  const { queue, settings } = state.engine;
  return (
    <Box flexDirection="column">
      <Text dimColor>NEXT</Text>
      {queue.slice(0, settings.previewSize).map((kind, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a preview slot is its position
        <Box key={index} flexDirection="column" marginBottom={1}>
          <Rows rows={pieceRows(kind, colors)} />
        </Box>
      ))}
    </Box>
  );
}

/** Which adapter turns keys into game controls (design §7.3). */
export function StatusLine({ input }: { input: string }) {
  return <Text dimColor>input: {input}</Text>;
}

/**
 * A single-player game: hold and the HUD, the board (with the countdown or the menu over it), the
 * preview, and the status line.
 */
export function GameView({ state, colors, ghost, input, overlay = [] }: GameViewProps) {
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box flexDirection="column" width={14} marginTop={HIDDEN_ROWS_SHOWN}>
          <Hold state={state} colors={colors} />
          <Hud state={state} />
        </Box>
        <Box flexDirection="column" marginRight={2}>
          <Rows rows={overlayRows(boardRows(state.engine, { colors, ghost }), overlay)} />
        </Box>
        <Box flexDirection="column" width={10} marginTop={HIDDEN_ROWS_SHOWN}>
          <Preview state={state} colors={colors} />
        </Box>
      </Box>
      <StatusLine input={input} />
    </Box>
  );
}
