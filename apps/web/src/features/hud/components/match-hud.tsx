import { type OnlineSession, type OnlineSessionState, piecesPerSecond } from '@shura/client-core';
import { useStore } from 'zustand';
import { PingChip } from '@/components/ping-chip';
import { Stat } from '@/components/stat';
import styles from './hud.module.css';

export interface MatchHudProps {
  readonly session: OnlineSession;
}

/** Pieces per second, from your locks and your frame. */
const yourPiecesPerSecond = ({ match }: OnlineSessionState): string => {
  const engine = match?.me?.engine;
  return (engine ? piecesPerSecond(engine) : 0).toFixed(2);
};

/** In an FFA, the players still in, out of all of them; `null` in a 1v1. */
const stillIn = ({ match }: OnlineSessionState): string | null => {
  if (match?.mode !== 'ffa') return null;
  const { roster } = match;
  return `${roster.filter(({ out }) => out === null).length}/${roster.length}`;
};

/**
 * The HUD under your hold in an online match (design §13.2, Match): the garbage lines you've sent,
 * your pieces per second, the players still in (in an FFA), and your ping.
 */
export function MatchHud({ session }: MatchHudProps) {
  const sent = useStore(session, (state) => state.match?.me?.linesSent ?? 0);
  const pps = useStore(session, yourPiecesPerSecond);
  const alive = useStore(session, stillIn);
  const ping = useStore(session, (state) => state.ping);
  return (
    <div className={styles.match}>
      <dl className={styles.hud}>
        <Stat look="hud" label="Sent" value={String(sent)} />
        <Stat look="hud" label="PPS" value={pps} />
        {alive !== null && <Stat look="hud" label="Alive" value={alive} />}
      </dl>
      <PingChip ping={ping} />
    </div>
  );
}
