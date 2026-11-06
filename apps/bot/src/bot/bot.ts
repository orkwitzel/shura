import type { OnlineSession, OnlineSessionState, TimerClock } from '@shura/client-core';
import type { BotProfile } from '../brain/profile';
import { type Random, seededRandom } from '../brain/random';
import { type Pilot, type Seat, startPilot } from './pilot';

/**
 * Where a bot plays: the room with a code. Quick-match bots (`{ quickMatch: true }`) come with the
 * online session's quick-match (#65).
 */
export type BotTarget = { readonly room: string };

/** Why a bot stopped playing on its own. */
export type BotEnd = 'failed' | 'refused' | 'closed';

export interface BotOptions {
  /**
   * Its session: client-core's online session, as any client's, made with `kind: 'bot'` (the pool
   * does) and not yet connected.
   */
  readonly session: OnlineSession;
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
  readonly session: OnlineSession;
  readonly target: BotTarget;
  /** Stops playing and closes its connection. */
  stop(): void;
}

/** How long a bot takes to ready up in the lobby, in ms: a person's moment. */
const READY_MS = { min: 500, spread: 1000 } as const;

/**
 * A bot (design §13.4): a client like any other, on client-core's online session with no special
 * trust. It joins its room, readies up a moment after each lobby starts, and plays each match with
 * a pilot. A bot whose room refuses it, or whose connection fails or closes, stops.
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
  #readying: (() => void) | null = null;
  #stopped = false;

  constructor(options: BotOptions) {
    this.#options = options;
    this.#random = seededRandom(options.seed);
    this.#unsubscribe = options.session.subscribe(this.#changed);
    this.#enter();
  }

  get session(): OnlineSession {
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
    session.joinRoom(target.room);
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
      // The room doesn't exist, is full, or went away: there's nothing for it to do.
      if (error && error !== previous.error) this.#end('refused', error.message);
      return;
    }
    if (match && match.matchId !== this.#matchId && match.playerId) this.#play(match.matchId);
    if (match?.phase === 'ended') this.#stopPilot();
    const me = room.players.find(({ id }) => id === state.sessionId);
    if (room.phase === 'lobby' && me && !me.ready && !this.#readying) this.#readyUp();
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
      if (match?.phase !== 'playing' || !match.me) return null;
      return match.me.out ? null : match.me.engine;
    },
    key: (event) => session.key(event),
  };
}
