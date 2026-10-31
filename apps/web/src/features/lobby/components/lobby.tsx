import type { OnlineRoom, OnlineSession } from '@shura/client-core';
import { SEATS } from '@shura/protocol';
import { type ReactNode, useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { PingChip } from '@/components/ping-chip';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/clipboard';
import { showToast } from '@/lib/toasts';
import { ordinal } from '@/utils/ordinal';
import { useRoomToasts } from '../hooks/use-room-toasts';
import styles from './lobby.module.css';

export interface LobbyProps {
  /** The online session, in a room that's in its lobby. */
  readonly session: OnlineSession;
  /** The room's link, which *Copy link* copies. */
  readonly link: string;
  /** N: the player wants another nickname. The page asks for it. */
  readonly onChangeNickname: () => void;
  /** Whether the lobby's keys work: not while a dialog is open over it. `true` by default. */
  readonly acceptKeys?: boolean;
}

const MODE_NAMES = { '1v1': '1v1', ffa: 'FFA' } as const;

type Seated = OnlineRoom['players'][number];

/** What you can do with Enter (and R): who you are in the room decides. */
type Role =
  | { readonly kind: 'host'; readonly canStart: boolean; readonly waitingFor: 'join' | 'ready' }
  | { readonly kind: 'player'; readonly ready: boolean }
  | { readonly kind: 'spectator' };

function roleOf(room: OnlineRoom, me: string | null): Role {
  const others = room.players.filter(({ id }) => id !== me);
  if (me !== null && room.hostId === me && room.players.some(({ id }) => id === me)) {
    const canStart = others.some(({ ready }) => ready);
    return { kind: 'host', canStart, waitingFor: others.length === 0 ? 'join' : 'ready' };
  }
  const seat = room.players.find(({ id }) => id === me);
  return seat ? { kind: 'player', ready: seat.ready } : { kind: 'spectator' };
}

/**
 * A room's lobby (design §13.2, Lobby): the room code, big, and the mode, with *Copy link*; the
 * seats (2 or 8 rows), each with the player's name, a dim `guest` or `bot` tag, the host's crown,
 * `ready` or `not ready` and their place in the last match, or empty; the spectators under them,
 * with a count; the player's ping in a corner. Keys, each shown as a key cap: **R** or Enter
 * toggles ready (Enter is *Start* for the host, once another seated player is ready, with a hint
 * saying what it waits for until then), **S** steps out to watch or takes a free seat, **N**
 * changes the nickname, **Esc** leaves the room. Joins, leaves and host changes show as toasts.
 */
export function Lobby({ session, link, onChangeNickname, acceptKeys = true }: LobbyProps) {
  const room = useStore(session, (state) => state.room);
  const sessionId = useStore(session, (state) => state.sessionId);
  const ping = useStore(session, (state) => state.ping);
  useRoomToasts(session);
  const role = room ? roleOf(room, sessionId) : ({ kind: 'spectator' } as const);
  const seatFree = room !== null && room.players.length < SEATS[room.mode];

  const copy = async () => {
    showToast((await copyText(link)) ? 'Link copied' : `Couldn’t copy: ${link}`);
  };

  const keys = useRef({ role, seatFree, onChangeNickname });
  keys.current = { role, seatFree, onChangeNickname };
  useEffect(() => {
    if (!acceptKeys) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const { role, seatFree, onChangeNickname } = keys.current;
      const ready = event.code === 'KeyR' || event.code === 'Enter' || event.code === 'NumpadEnter';
      if (ready) {
        if (role.kind === 'host' && role.canStart) session.startMatch();
        else if (role.kind === 'player') session.setReady(!role.ready);
      } else if (event.code === 'KeyS') {
        if (role.kind === 'spectator') {
          if (seatFree) session.takeSeat();
          else showToast('No free seat', 'alert');
        } else session.spectate();
      } else if (event.code === 'KeyN') onChangeNickname();
      else if (event.code === 'Escape') session.leaveRoom();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session, acceptKeys]);

  if (!room) return null;
  const seats = Array.from(
    { length: SEATS[room.mode] },
    (_, seat) => room.players.find((player) => player.seat === seat) ?? null,
  );

  return (
    <div className={styles.lobby}>
      <header className={styles.header}>
        <div className={styles.corner}>
          <PingChip ping={ping} />
        </div>
        <h1 className={styles.code}>
          <span className={styles.codeLabel}>Room </span>
          <span className={styles.codeText}>{room.code}</span>
        </h1>
        <div className={styles.meta}>
          <span className={styles.mode}>{MODE_NAMES[room.mode]}</span>
          <Button variant="secondary" className={styles.copy} onClick={copy}>
            Copy link
          </Button>
        </div>
      </header>

      <ol aria-label="Seats" className={styles.seats}>
        {seats.map((player, seat) =>
          player ? (
            <SeatRow
              // The seat is the row's place.
              key={seat}
              player={player}
              you={player.id === sessionId}
              host={player.id === room.hostId}
            />
          ) : (
            <li key={seat} aria-label={`Seat ${seat + 1}, empty`} className={styles.empty}>
              <span className={styles.seatNumber}>{seat + 1}</span>
              <span>empty</span>
            </li>
          ),
        )}
      </ol>

      {room.spectators.length > 0 && (
        <section className={styles.watching}>
          <h2 className={styles.watchingTitle}>Watching ({room.spectators.length})</h2>
          <ul aria-label={`Watching (${room.spectators.length})`} className={styles.watchers}>
            {room.spectators.map((spectator) => (
              <li key={spectator.id} className={styles.watcher}>
                <span className={styles.name}>{spectator.nickname}</span>
                {spectator.id === sessionId && <span className={styles.you}>you</span>}
                <span className={styles.kind}>{spectator.kind}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className={styles.keys}>
        <ReadyKeys role={role} />
        <KeyHint keys={['S']}>{role.kind === 'spectator' ? 'Take a seat' : 'Watch'}</KeyHint>
        <KeyHint keys={['N']}>Nickname</KeyHint>
        <KeyHint keys={['Esc']}>Leave</KeyHint>
      </footer>
    </div>
  );
}

function SeatRow({ player, you, host }: { player: Seated; you: boolean; host: boolean }) {
  return (
    <li
      aria-label={player.nickname}
      className={styles.seat}
      data-you={you || undefined}
      data-ready={(!host && player.ready) || undefined}
    >
      <span className={styles.seatNumber}>{player.seat + 1}</span>
      <span className={styles.who}>
        {host && <Crown />}
        <span className={styles.name}>{player.nickname}</span>
        {you && <span className={styles.you}>you</span>}
        <span className={styles.kind}>{player.kind}</span>
      </span>
      {player.lastPlace !== undefined && (
        <span className={styles.last}>last: {ordinal(player.lastPlace)}</span>
      )}
      <span className={styles.status}>{host ? 'host' : player.ready ? 'ready' : 'not ready'}</span>
    </li>
  );
}

/** The host's crown, as pixels. */
function Crown() {
  return (
    <svg
      role="img"
      aria-label="host"
      className={styles.crown}
      viewBox="0 0 7 5"
      shapeRendering="crispEdges"
    >
      <title>host</title>
      <path d="M0 0h1v1h1v1h1V0h1v2h1V1h1V0h1v5H0z" />
    </svg>
  );
}

function ReadyKeys({ role }: { role: Role }) {
  if (role.kind === 'spectator') return null;
  if (role.kind === 'player') {
    return <KeyHint keys={['R', 'Enter']}>{role.ready ? 'Not ready' : 'Ready'}</KeyHint>;
  }
  return (
    <>
      <KeyHint keys={['Enter']} disabled={!role.canStart}>
        Start
      </KeyHint>
      {!role.canStart && (
        <p className={styles.wait}>
          {role.waitingFor === 'join'
            ? 'Waiting for a player to join'
            : 'Waiting for a player to get ready'}
        </p>
      )}
    </>
  );
}

function KeyHint({
  keys,
  disabled = false,
  children,
}: {
  keys: readonly string[];
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={styles.key} data-disabled={disabled || undefined}>
      {keys.map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
      <span>{children}</span>
    </span>
  );
}
