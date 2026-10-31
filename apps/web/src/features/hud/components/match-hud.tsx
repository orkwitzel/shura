import type { OnlineSession, OnlineSessionState } from '@shura/client-core';
import { useStore } from 'zustand';
import { PingChip } from '@/components/ping-chip';
import styles from './hud.module.css';

export interface MatchHudProps {
  readonly session: OnlineSession;
}

/** Your own game in the session's match. */
const mine = ({ match }: OnlineSessionState) =>
  match?.players.find(({ playerId }) => playerId === match.playerId);

/** Pieces per second, from your locks and your frame. */
const piecesPerSecond = (state: OnlineSessionState): string => {
  const engine = mine(state)?.engine;
  return engine && engine.frame > 0
    ? ((engine.piecesPlaced * 60) / engine.frame).toFixed(2)
    : '0.00';
};

/** In an FFA, the players still in, out of all of them; `null` in a 1v1. */
const stillIn = ({ match }: OnlineSessionState): string | null => {
  if (match?.mode !== 'ffa') return null;
  const players = match.players.length;
  return `${match.players.filter(({ out }) => out === null).length}/${players}`;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  );
}

/**
 * The HUD under your hold in an online match (design §13.2, Match): the garbage lines you've sent,
 * your pieces per second, the players still in (in an FFA), and your ping.
 */
export function MatchHud({ session }: MatchHudProps) {
  const sent = useStore(session, (state) => mine(state)?.linesSent ?? 0);
  const pps = useStore(session, piecesPerSecond);
  const alive = useStore(session, stillIn);
  const ping = useStore(session, (state) => state.ping);
  return (
    <div className={styles.match}>
      <dl className={styles.hud}>
        <Stat label="Sent" value={String(sent)} />
        <Stat label="PPS" value={pps} />
        {alive !== null && <Stat label="Alive" value={alive} />}
      </dl>
      <PingChip ping={ping} />
    </div>
  );
}
