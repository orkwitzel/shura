import type { OnlineSession, OnlineSessionState, TimerClock } from '@shura/client-core';
import type { BotProfile } from '../brain/profile';
import { type Random, seededRandom } from '../brain/random';
import { type Pilot, type Seat, startPilot } from './pilot';

/** Where a bot plays: the room with a code, or a quick-match. */
export type BotTarget = { readonly room: string } | { readonly quickMatch: true };

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
  /**
   * Hears why it stopped, if it stops by itself: its connection failed, or the server refused it
   * (its room doesn't exist or is full, or it couldn't queue).
   */
  readonly ended?: (end: BotEnd, message: string) => void;
}

export interface Bot {
  readonly session: OnlineSession;
  readonly target: BotTarget;
  /** Stops playing and closes its connection. */
  stop(): void;
}

/** How long a bot takes to ready up in the lobby, or to rematch after results, in ms. */
const MOMENT_MS = { min: 500, spread: 1000 } as const;

/**
 * A bot (design §13.4): a client like any other, on client-core's online session with no special
 * trust. It joins its room and readies up a moment after each lobby starts, or quick-matches,
 * rematches a moment after each match's results and queues again if its opponent leaves. It plays
 * each match with a pilot. A bot the server refuses, or whose connection fails or closes, stops.
 */
export function startBot(options: BotOptions): Bot {
  return new BotPlayer(options);
}

class BotPlayer implements Bot {
  readonly #options: BotOptions;
  readonly #random: Random;
  readonly #unsubscribe: () => void;
  #pilot: Pilot | null = null;
  /** The match the pilot plays, and the room it plays it in. */
  #matchId: string | null = null;
  #matchRoom: string | null = null;
  /** The match it asked to rematch after. */
  #rematched: string | null = null;
  /** Cancels the moment it's waiting out before it readies up or rematches. */
  #waiting: (() => void) | null = null;
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
    this.#waiting?.();
    this.#options.session.close();
  }

  #enter(): void {
    const { session, target } = this.#options;
    if ('room' in target) session.joinRoom(target.room);
    else session.quickMatch();
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
      if (error && error !== previous.error) {
        // The room doesn't exist, is full or went away, or it couldn't queue: nothing to do.
        this.#end('refused', error.message);
      } else if (state.quickMatch === 'opponentLeft' && previous.quickMatch !== 'opponentLeft') {
        // Its opponent left a quick-match: it queues again.
        this.#cancelWait();
        this.#options.session.quickMatch();
      }
      return;
    }
    if (match && match.matchId !== this.#matchId && match.playerId) {
      this.#play(match.matchId, room.code);
    }
    if (match?.phase === 'ended') this.#stopPilot();
    if (room.quickMatch) {
      // Quick-match rooms skip the lobby: after the results it rematches, once per match.
      const ended = match?.phase === 'ended' && match.matchId === this.#matchId;
      if (ended && this.#matchRoom === room.code && this.#rematched !== match.matchId) {
        this.#rematched = match.matchId;
        this.#afterMoment(() => this.#rematch(room.code));
      }
      return;
    }
    const me = room.players.find(({ id }) => id === state.sessionId);
    if (room.phase === 'lobby' && me && !me.ready && !this.#waiting) {
      this.#afterMoment(() => this.#readyUp());
    }
  };

  /** Runs `then` after a person's moment, unless the bot stops or is sent elsewhere first. */
  #afterMoment(then: () => void): void {
    this.#cancelWait();
    const ms = MOMENT_MS.min + Math.floor(this.#random() * MOMENT_MS.spread);
    this.#waiting = this.#options.clock.after(ms, () => {
      this.#waiting = null;
      then();
    });
  }

  #cancelWait(): void {
    this.#waiting?.();
    this.#waiting = null;
  }

  /** Readies up, if it is still in the lobby and not ready. */
  #readyUp(): void {
    const { room, sessionId } = this.#options.session.getState();
    const me = room?.players.find(({ id }) => id === sessionId);
    if (room?.phase === 'lobby' && me && !me.ready) this.#options.session.setReady(true);
  }

  /** Asks for a rematch, if it is still in the room of the match that ended. */
  #rematch(code: string): void {
    const { room, match } = this.#options.session.getState();
    if (room?.code === code && match?.phase === 'ended') this.#options.session.rematch();
  }

  #play(matchId: string, roomCode: string): void {
    this.#stopPilot();
    this.#cancelWait();
    this.#matchId = matchId;
    this.#matchRoom = roomCode;
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
