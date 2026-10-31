import type { OnlineSession, OnlineSessionState, TimerClock } from '@shura/client-core';
import { type Pilot, type Seat, startPilot } from './pilot';
import type { BotProfile } from './profile';
import { type Random, seededRandom } from './random';

/** Where a bot plays: the room with a code, or a quick-match. */
export type BotTarget = { readonly room: string } | { readonly quickMatch: true };

/**
 * The online session a bot plays through: client-core's, as any client's. Quick-match and rematch
 * come to it with #65; until then a quick-match bot connects and waits.
 */
export type BotSession = OnlineSession & {
  quickMatch?(): void;
  rematch?(): void;
};

/** Why a bot stopped playing on its own. */
export type BotEnd = 'failed' | 'refused' | 'closed';

export interface BotOptions {
  /** Its session, made with `kind: 'bot'` (the pool does), not yet connected. */
  readonly session: BotSession;
  readonly clock: TimerClock;
  readonly profile: BotProfile;
  /** Seeds its random choices, so a bot's play can be replayed. */
  readonly seed: number;
  readonly target: BotTarget;
  /** Pieces per second to aim for instead of the profile's, for load tests. */
  readonly pps?: number;
  /** Hears why it stopped, if it stops by itself: its connection failed, or its room refused it. */
  readonly ended?: (end: BotEnd, message: string) => void;
}

export interface Bot {
  readonly session: BotSession;
  readonly target: BotTarget;
  /** Stops playing and closes its connection. */
  stop(): void;
}

/** How long a bot takes to ready up in the lobby, in ms: a person's moment. */
const READY_MS = { min: 500, spread: 1000 } as const;

/**
 * A bot (design §13.4): a client like any other, on client-core's online session with no special
 * trust. It joins its room (or quick-matches), readies up in the lobby, plays each match with a
 * pilot, and in a quick-match room rematches after the results.
 */
export function startBot(options: BotOptions): Bot {
  return new BotPlayer(options);
}

class BotPlayer implements Bot {
  readonly #options: BotOptions;
  readonly #random: Random;
  readonly #unsubscribe: () => void;
  #pilot: Pilot | null = null;
  /** The match the pilot plays. */
  #matchId: string | null = null;
  /** The match it asked to rematch after. */
  #rematched: string | null = null;
  #readying: (() => void) | null = null;
  #hadRoom = false;
  #stopped = false;

  constructor(options: BotOptions) {
    this.#options = options;
    this.#random = seededRandom(options.seed);
    this.#unsubscribe = options.session.subscribe(this.#changed);
    this.#enter();
  }

  get session(): BotSession {
    return this.#options.session;
  }

  get target(): BotTarget {
    return this.#options.target;
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#unsubscribe();
    this.#stopPilot();
    this.#readying?.();
    this.#options.session.close();
  }

  #enter(): void {
    const { session, target } = this.#options;
    if ('room' in target) session.joinRoom(target.room);
    else session.quickMatch?.();
  }

  #changed = (state: OnlineSessionState, previous: OnlineSessionState): void => {
    if (this.#stopped) return;
    const { connection, room, match, error } = state;
    if (connection.status === 'failed') {
      this.#end('failed', connection.message);
      return;
    }
    if (connection.status === 'closed') {
      this.#end('closed', 'closed');
      return;
    }
    if (!room) {
      if (error && error !== previous.error && 'room' in this.#options.target) {
        // The room doesn't exist, or is full: there's nothing for it to do.
        this.#end('refused', error.message);
      } else if (this.#hadRoom && 'quickMatch' in this.#options.target) {
        // Its opponent left a quick-match: it queues again.
        this.#hadRoom = false;
        this.#options.session.quickMatch?.();
      }
      return;
    }
    this.#hadRoom = true;
    if (match && match.matchId !== this.#matchId && match.playerId) this.#play(match.matchId);
    if (match?.phase === 'ended') this.#stopPilot();
    const quickMatchRoom = room.hostId === undefined;
    if (quickMatchRoom && match?.phase === 'ended' && this.#rematched !== match.matchId) {
      this.#rematched = match.matchId;
      this.#options.session.rematch?.();
    }
    const me = room.players.find(({ id }) => id === state.sessionId);
    if (!quickMatchRoom && room.phase === 'lobby' && me && !me.ready && !this.#readying) {
      this.#readyUp();
    }
  };

  /** Readies up after a moment, if it is still in the lobby and not ready. */
  #readyUp(): void {
    const ms = READY_MS.min + Math.floor(this.#random() * READY_MS.spread);
    this.#readying = this.#options.clock.after(ms, () => {
      this.#readying = null;
      const { room, sessionId } = this.#options.session.getState();
      const me = room?.players.find(({ id }) => id === sessionId);
      if (room?.phase === 'lobby' && me && !me.ready) this.#options.session.setReady(true);
    });
  }

  #play(matchId: string): void {
    this.#stopPilot();
    this.#matchId = matchId;
    const { clock, profile, pps } = this.#options;
    this.#pilot = startPilot({
      clock,
      seat: sessionSeat(this.#options.session),
      profile,
      random: seededRandom(Math.floor(this.#random() * 2 ** 32)),
      ...(pps !== undefined && { pps }),
    });
  }

  #stopPilot(): void {
    this.#pilot?.stop();
    this.#pilot = null;
  }

  #end(end: BotEnd, message: string): void {
    this.stop();
    this.#options.ended?.(end, message);
  }
}

/** A bot's own game in its session's current match, while it plays it. */
function sessionSeat(session: OnlineSession): Seat {
  return {
    game() {
      const { match } = session.getState();
      if (match?.phase !== 'playing' || !match.playerId) return null;
      const own = match.players.find(({ playerId }) => playerId === match.playerId);
      return own && !own.out ? own.engine : null;
    },
    key: (event) => session.key(event),
  };
}
