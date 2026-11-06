import {
  type Clock,
  MODE_NAMES,
  matchCountdownLabel,
  type OnlineMatchState,
  type OnlinePlayerGame,
  type OnlineSession,
  OUT_WORDS,
  ordinal,
  PIECE_ACTIONS,
  piecesPerSecond,
  totalLines,
} from '@shura/client-core';
import { useSettings } from '@shura/client-core/react';
import { VISIBLE_ROWS } from '@shura/engine';
import { Box, Text } from 'ink';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { boardRows, HIDDEN_ROWS_SHOWN } from '../../board/board';
import { meterColumn } from '../../board/garbage-meter';
import type { Look } from '../../board/look';
import { opponentBoardRows } from '../../board/opponent-board';
import { menuLines, overlayRows } from '../../board/overlay';
import { NO_PIECE, pieceRows } from '../../board/piece';
import { cutTo } from '../../board/text-width';
import {
  eventTypeOf,
  type KeyName,
  keyName,
  type TerminalInput,
} from '../../platform/input/terminal-input';
import { useScreenKeys } from '../../platform/input/use-screen-keys';
import { type InputOptions, useTerminalInput } from '../../platform/input/use-terminal-input';
import { PingText } from './ping-text';

export interface MatchViewProps {
  readonly session: OnlineSession;
  readonly look: Look;
  readonly ghost: boolean;
  /** The loop's clock, which stamps keys and times the attack flashes. */
  readonly clock: Clock;
  readonly input: InputOptions;
  /** The terminal's size, for how many opponent boards fit. */
  readonly size: { readonly columns: number; readonly rows: number };
  /** Every player's nickname by id, as long as they've been seen in the room. */
  readonly names: ReadonlyMap<string, string>;
  /** Whether it takes keys: not while it can't be seen. */
  readonly active: boolean;
  /** The room was left: Esc while spectating. */
  readonly onLeave: () => void;
  /** An `auto` adapter has chosen (design §7.3). */
  readonly onInputChosen?: (choice: 'precise' | 'basic') => void;
}

/** Your board's columns: the HUD, the meter, the board between its walls, the preview, gaps. */
const HUD_WIDTH = 14;
const OWN_WIDTH = HUD_WIDTH + 1 + 22 + 2 + 10 + 2;
/** An opponent's half-block board: the meter, the board between its walls, a gap; its name. */
const OPPONENT_WIDTH = 14;
const OPPONENT_HEIGHT = 12;
/** How long an attack flashes its target's name, in ms (design §13.3). */
const FLASH_MS = 600;

/** An entry of the online menu, run by its keys (design §7.4). */
interface MenuEntry {
  readonly keys: readonly KeyName[];
  readonly hint: string;
  readonly label: string;
  readonly run: () => void;
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

/**
 * Which players' names flash now: those an attack was routed to in the last moment (an attack
 * flashes its target's name, design §13.3), heard from the session's garbage routings.
 */
function useAttackFlashes(session: OnlineSession, clock: Pick<Clock, 'now'>): ReadonlySet<string> {
  const until = useRef(new Map<string, number>());
  // A routing redraws at once; the match redraws every frame after it, which ends the flash.
  const [, redraw] = useState(0);
  useEffect(
    () =>
      session.onRoutings(({ to }) => {
        until.current.set(to, clock.now() + FLASH_MS);
        redraw((count) => count + 1);
      }),
    [session, clock],
  );
  const now = clock.now();
  const flashing = new Set<string>();
  for (const [playerId, end] of until.current) if (now < end) flashing.add(playerId);
  return flashing;
}

/** A name, flashing (inverted, in red) while an attack lands on it. */
function Name({ name, flashing, you = false }: { name: string; flashing: boolean; you?: boolean }) {
  if (flashing) {
    return (
      <Text bold inverse color="red">
        {name}
      </Text>
    );
  }
  return (
    <Text bold color={you ? 'yellow' : undefined}>
      {name}
    </Text>
  );
}

/** The place of the player `playerId` so far, from the match's roster. */
function placeIn(match: OnlineMatchState, playerId: string): number | null {
  return match.roster.find((entry) => entry.playerId === playerId)?.place ?? null;
}

/** A player's place and how they went out, as lines over their board. */
function outLines(match: OnlineMatchState, game: OnlinePlayerGame): string[] {
  if (!game.out) return [];
  const place = placeIn(match, game.playerId);
  return ['', place === null ? '' : ordinal(place).toUpperCase(), OUT_WORDS[game.out.reason], ''];
}

/** A HUD label and its value. */
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>{label}</Text>
      {children}
    </Box>
  );
}

/** An opponent's board in half-blocks with its meter and name, greyed with its place once out. */
function OpponentBoard({
  match,
  game,
  look,
  name,
  flashing,
}: {
  match: OnlineMatchState;
  game: OnlinePlayerGame;
  look: Look;
  name: string;
  flashing: boolean;
}) {
  const board = opponentBoardRows(game.engine, look, {
    out: game.out !== null,
    lines: outLines(match, game),
  });
  const meter = meterColumn(game.out ? 0 : totalLines(game.engine.garbageMeter), 10, 2, look);
  const rows = board.map((row, at) => `${meter[at] ?? ' '}${row}`);
  return (
    <Box flexDirection="column" width={OPPONENT_WIDTH} height={OPPONENT_HEIGHT}>
      <Text wrap="truncate">
        {' '}
        <Name name={cutTo(name, 12)} flashing={flashing} />
      </Text>
      <Rows rows={rows} />
    </Box>
  );
}

/** Opponents as a list, when their boards don't fit: name, stack height, and in or out. */
function OpponentList({
  match,
  games,
  names,
  flashes,
}: {
  match: OnlineMatchState;
  games: readonly OnlinePlayerGame[];
  names: ReadonlyMap<string, string>;
  flashes: ReadonlySet<string>;
}) {
  return (
    <Box flexDirection="column" marginTop={HIDDEN_ROWS_SHOWN}>
      {games.map((game) => {
        const place = placeIn(match, game.playerId);
        const height = stackHeight(game.engine);
        const waiting = totalLines(game.engine.garbageMeter);
        return (
          <Box key={game.playerId}>
            <Box width={14}>
              <Name name={nameOf(names, game.playerId)} flashing={flashes.has(game.playerId)} />
            </Box>
            {game.out ? (
              <Text dimColor>
                {place === null ? '' : `${ordinal(place)} · `}
                {OUT_WORDS[game.out.reason]}
              </Text>
            ) : (
              <Text>
                height {String(height).padStart(2)}
                {waiting > 0 && <Text color="red">{`  ▐ ${waiting}`}</Text>}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/** How high a game's stack is, in rows. */
function stackHeight({ board }: OnlinePlayerGame['engine']): number {
  for (let row = board.length - 1; row >= 0; row--) {
    if (board[row]?.some((cell) => cell !== null)) return row + 1;
  }
  return 0;
}

function nameOf(names: ReadonlyMap<string, string>, id: string): string {
  return names.get(id) ?? 'player';
}

/** Opponents' boards in a grid of `columns`, or a list if `fits` is false. */
function Opponents({
  match,
  games,
  look,
  names,
  flashes,
  columns,
  fits,
}: {
  match: OnlineMatchState;
  games: readonly OnlinePlayerGame[];
  look: Look;
  names: ReadonlyMap<string, string>;
  flashes: ReadonlySet<string>;
  columns: number;
  fits: boolean;
}) {
  if (!fits) return <OpponentList match={match} games={games} names={names} flashes={flashes} />;
  const rows: OnlinePlayerGame[][] = [];
  for (let at = 0; at < games.length; at += columns) rows.push(games.slice(at, at + columns));
  return (
    <Box flexDirection="column">
      {rows.map((row) => (
        <Box key={row[0]?.playerId} flexDirection="row">
          {row.map((game) => (
            <OpponentBoard
              key={game.playerId}
              match={match}
              game={game}
              look={look}
              name={nameOf(names, game.playerId)}
              flashing={flashes.has(game.playerId)}
            />
          ))}
        </Box>
      ))}
    </Box>
  );
}

/** How many half-block boards fit in `columns`×`rows`: per row, and in all. */
function boardsFitting(columns: number, rows: number): { perRow: number; total: number } {
  const perRow = Math.max(0, Math.floor(columns / OPPONENT_WIDTH));
  return { perRow, total: perRow * Math.max(0, Math.floor(rows / OPPONENT_HEIGHT)) };
}

/**
 * An online match (design §13.2, §13.3). Playing: your board as in single-player with the garbage
 * meter (`▐`) on the well's left, the countdown over it, and under hold the HUD (lines sent, pieces
 * per second, players still in for an FFA, your ping, and "Reconnecting…" while the connection is
 * down); beside it each opponent's half-block board with its meter and name, as many as fit, or a
 * list. An attack flashes its target's name. An out board greys, with its place and why. Esc or P
 * opens the online menu (Back to game, Leave match) over your board, and the match plays on
 * underneath it (design §7.4). Once you're out, or watching, the boards stay up with a "Spectating"
 * banner, and Esc leaves the room.
 */
export function MatchView({
  session,
  look,
  ghost,
  clock,
  input,
  size,
  names,
  active,
  onLeave,
  onInputChosen,
}: MatchViewProps) {
  const match = useStore(session, (state) => state.match);
  const roomCode = useStore(session, (state) => state.room?.code ?? null);
  const roomMode = useStore(session, (state) => state.room?.mode ?? null);
  const ping = useStore(session, (state) => state.ping);
  const reconnecting = useStore(session, (state) => state.connection.status === 'reconnecting');
  const { bindings } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const players = match?.players ?? [];
  const flashes = useAttackFlashes(session, clock);
  const me = match?.me ?? null;
  const playing = me !== null && me.out === null && match?.phase !== 'ended';

  const leave = () => {
    session.leaveRoom();
    onLeave();
  };
  const releaseAll = () => {
    const time = clock.now();
    for (const action of PIECE_ACTIONS) session.key({ action, kind: 'release', time });
  };
  // The online menu's shortcuts (design §7.4): no Restart and no Settings, and it never pauses.
  const menu: MenuEntry[] = [
    {
      keys: ['escape', 'enter'],
      hint: 'Esc',
      label: 'Back to game',
      run: () => setMenuOpen(false),
    },
    {
      keys: ['q'],
      hint: 'Q',
      label: 'Leave match',
      run: () => {
        setMenuOpen(false);
        // Leaving the match leaves the room: you're out with `left` (design §7.4, §10.1).
        leave();
      },
    },
  ];
  /**
   * While the menu is open, it takes every press and repeat, so none reaches the game; releases go
   * on, so a key let go there isn't left held.
   */
  const shortcut = (raw: TerminalInput): boolean => {
    if (!menuOpen) return false;
    const kind = eventTypeOf(raw.key);
    if (kind === 'release') return false;
    const name = kind === 'press' ? keyName(raw) : null;
    menu.find(({ keys }) => name !== null && keys.includes(name))?.run();
    return true;
  };
  const terminalInput = useTerminalInput({
    session,
    clock,
    bindings,
    options: input,
    onMenu: () => {
      releaseAll();
      setMenuOpen(true);
    },
    onChosen: onInputChosen,
    shortcut,
    active: active && playing,
  });
  useScreenKeys({ active: active && !playing, clock }, ({ key }, press) => {
    if (press && key.escape) leave();
  });

  if (!match) return null;
  const opponents = players.filter((game) => game !== me);
  const where =
    roomCode !== null && roomMode !== null
      ? `${roomCode} · ${MODE_NAMES[roomMode]}`
      : MODE_NAMES[match.mode];

  if (!me) {
    // Watching: every board the same size, under the banner (design §13.2).
    const fit = boardsFitting(size.columns, size.rows - 3);
    return (
      <Box flexDirection="column">
        <Text>
          <Text bold color="yellow">
            SPECTATING
          </Text>
          <Text>{`  ${where} · you take a seat at the next lobby`}</Text>
          <Text dimColor>{'   Esc leave'}</Text>
        </Text>
        <Box marginTop={1}>
          <Opponents
            match={match}
            games={opponents}
            look={look}
            names={names}
            flashes={flashes}
            columns={fit.perRow}
            fits={opponents.length <= fit.total}
          />
        </Box>
      </Box>
    );
  }

  const label = matchCountdownLabel(match);
  const overlay = me.out
    ? outLines(match, me)
    : menuOpen
      ? menuLines('MENU', menu)
      : label
        ? ['', label, '']
        : [];
  const board = overlayRows(
    boardRows(me.engine, { ...look, ghost, grey: me.out !== null }),
    overlay,
  );
  const meter = [
    ...Array.from({ length: HIDDEN_ROWS_SHOWN }, () => ' '),
    ...meterColumn(me.out ? 0 : totalLines(me.engine.garbageMeter), VISIBLE_ROWS, 1, look),
    ' ',
  ];
  const rows = board.map((row, at) => `${meter[at] ?? ' '}${row}`);
  const { hold, holdUsed, queue, settings } = me.engine;
  const still = match.roster.filter(({ out }) => out === null).length;
  const fit = boardsFitting(size.columns - OWN_WIDTH, size.rows - 1);
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box flexDirection="column" width={HUD_WIDTH}>
          <Text wrap="truncate">
            <Name name={nameOf(names, me.playerId)} flashing={flashes.has(me.playerId)} you />
          </Text>
          {reconnecting ? <Text color="yellow">Reconnecting…</Text> : <Text> </Text>}
          <Box flexDirection="column" marginBottom={1}>
            <Text dimColor>HOLD</Text>
            <Rows rows={hold ? pieceRows(hold, look, holdUsed) : NO_PIECE} />
          </Box>
          <Stat label="SENT">
            <Text bold>{me.linesSent}</Text>
          </Stat>
          <Stat label="PPS">
            <Text bold>{piecesPerSecond(me.engine).toFixed(2)}</Text>
          </Stat>
          {match.mode === 'ffa' && (
            <Stat label="ALIVE">
              <Text bold>
                {still}/{players.length}
              </Text>
            </Stat>
          )}
          <Stat label="PING">
            <PingText ping={ping} />
          </Stat>
        </Box>
        <Box flexDirection="column" marginRight={2}>
          <Rows rows={rows} />
        </Box>
        <Box flexDirection="column" width={10} marginTop={HIDDEN_ROWS_SHOWN} marginRight={2}>
          <Text dimColor>NEXT</Text>
          {queue.slice(0, settings.previewSize).map((kind, index) => (
            // A preview slot is its position.
            <Box key={index} flexDirection="column" marginBottom={1}>
              <Rows rows={pieceRows(kind, look)} />
            </Box>
          ))}
        </Box>
        <Opponents
          match={match}
          games={opponents}
          look={look}
          names={names}
          flashes={flashes}
          columns={fit.perRow}
          fits={opponents.length <= fit.total}
        />
      </Box>
      {me.out ? (
        <Text>
          <Text bold color="yellow">
            SPECTATING
          </Text>
          <Text dimColor>{`  ${where}   Esc leave`}</Text>
        </Text>
      ) : (
        <Box>
          <Text dimColor>{`${where}  `}</Text>
          <Text dimColor>input: {terminalInput.adapter}</Text>
        </Box>
      )}
    </Box>
  );
}
