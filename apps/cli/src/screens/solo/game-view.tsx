import type { SoloSessionState } from '@shura/client-core';
import { Box, Text } from 'ink';
import { boardRows, HIDDEN_ROWS_SHOWN } from '../../board/board';
import type { Look } from '../../board/look';
import { overlayRows } from '../../board/overlay';
import { NO_PIECE, pieceRows } from '../../board/piece';
import { Hud } from './hud';

export interface GameViewProps {
  readonly state: SoloSessionState;
  /** How cells look: the colour mode, the theme and the skin. */
  readonly look: Look;
  /** Whether to draw the ghost (a setting). */
  readonly ghost: boolean;
  /** The input adapter, for the status line. */
  readonly input: string;
  /** Lines drawn over the middle of the board: the countdown, or the in-game menu. */
  readonly overlay?: readonly string[];
  /** Short notices for the status line (a config file that couldn't be used). */
  readonly notices: readonly string[];
}

/** Rows of pre-coloured strings, one `<Text>` each (design §13.3). */
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

/** Hold, on the left (design §13.3), greyed out once used for this piece. */
function Hold({ state, look }: Pick<GameViewProps, 'state' | 'look'>) {
  const { hold, holdUsed } = state.engine;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>HOLD</Text>
      <Rows rows={hold ? pieceRows(hold, look, holdUsed) : NO_PIECE} />
    </Box>
  );
}

/** The next pieces, on the right (design §13.3). */
function Preview({ state, look }: Pick<GameViewProps, 'state' | 'look'>) {
  const { queue, settings } = state.engine;
  return (
    <Box flexDirection="column">
      <Text dimColor>NEXT</Text>
      {queue.slice(0, settings.previewSize).map((kind, index) => (
        // A preview slot is its position.
        <Box key={index} flexDirection="column" marginBottom={1}>
          <Rows rows={pieceRows(kind, look)} />
        </Box>
      ))}
    </Box>
  );
}

/** Which adapter turns keys into game controls (design §7.3), and any notices. */
export function StatusLine({ input, notices }: { input: string; notices: readonly string[] }) {
  return (
    <Box flexDirection="row">
      <Text dimColor>input: {input}</Text>
      {notices.map((notice) => (
        <Text key={notice} color="yellow">
          {'  '}
          {notice}
        </Text>
      ))}
    </Box>
  );
}

/**
 * A single-player game: hold and the HUD, the board (with the countdown or the menu over it), the
 * preview, and the status line.
 */
export function GameView({ state, look, ghost, input, overlay = [], notices }: GameViewProps) {
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box flexDirection="column" width={14} marginTop={HIDDEN_ROWS_SHOWN}>
          <Hold state={state} look={look} />
          <Hud state={state} />
        </Box>
        <Box flexDirection="column" marginRight={2}>
          <Rows rows={overlayRows(boardRows(state.engine, { ...look, ghost }), overlay)} />
        </Box>
        <Box flexDirection="column" width={10} marginTop={HIDDEN_ROWS_SHOWN}>
          <Preview state={state} look={look} />
        </Box>
      </Box>
      <StatusLine input={input} notices={notices} />
    </Box>
  );
}
