import {
  type ClientData,
  COUNTDOWN_MS,
  type ErrorBody,
  type PlayerKind,
  ROOM_TICK_MS,
  type RoomMode,
  type RoomPhase,
  SEATS,
  type ServerData,
  type ServerMessage,
} from '@shura/protocol';
import type { MatchLog } from '@shura/valkey';
import type { Logger } from 'pino';
import type { Clock } from '../clock';
import { Match, type NewMatch, type VerifiedGame } from '../match';
import { MATCH_LOG_APPEND_MS } from '../match-log';
import { REFUSALS } from './refusals';

/**
 * How long a quick-match room waits for its second player (design §9.4). A player paired with
 * someone whose gateway never attached them goes back to the waiting screen after it.
 */
export const QUICK_MATCH_ARRIVAL_MS = 10_000;

/** Where a room's messages to one session go: the gateway link it attached through. */
export type Deliver = (sessionId: string, message: ServerMessage) => void;

/** A session in the room: seated, or a spectator (`seat: null`). */
interface Member {
  readonly id: string;
  nickname: string;
  readonly kind: PlayerKind;
  seat: number | null;
  ready: boolean;
  lastPlace?: number;
  /** Where its messages go. A reconnect through another gateway (#64) changes it. */
  deliver: Deliver;
}

/** What the registry keeps of a room (design §9.5), as the room reports it after each change. */
export interface RoomSummary {
  readonly phase: RoomPhase;
  readonly hostId: string | null;
  readonly seated: number;
  readonly spectators: number;
}

export interface RoomOptions {
  readonly code: string;
  readonly epoch: number;
  readonly mode: RoomMode;
  /**
   * A quick-match room (design §9.4) has no host: it starts by itself once both seats are taken,
   * rematches once both players ask, and breaks up when one leaves.
   */
  readonly kind: 'hosted' | 'quick';
  readonly hostId?: string;
  /** The most spectators the room holds (design §10.1). */
  readonly maxSpectators: number;
  readonly clock: Clock;
  /** The room's own logger, with its `roomCode`. */
  readonly logger: Logger;
  readonly newMatch: NewMatch;
  /** Where its matches' logs go (design §9.6). */
  readonly matchLog: MatchLog;
  /** The room's phase, host or counts may have changed: for the registry (design §9.5). */
  readonly changed: (summary: RoomSummary) => void;
  /** The room has emptied. Its service deletes it after `EMPTY_ROOM_MS` unless someone comes. */
  readonly emptied: () => void;
}

/**
 * A room on its game pod (design §10.1): its members, seated or spectating, in the order they
 * came, the host and ready, the countdown and the match. At the match's end the room goes straight
 * back to the lobby, readies reset and each player's place kept: the results are a client screen
 * over `matchEnd`.
 *
 * A quick-match room (`kind: 'quick'`, design §9.4) has no host and no lobby to ready in: its
 * first match starts as soon as both seats are taken, the next once both players `rematch`, and
 * when a player leaves it breaks up (after the match, if one is running): everyone still in it
 * gets `opponentLeft` and is out of it.
 *
 * Seams for later issues:
 * - #64: `detach` holds the seat (30 s in the lobby, the 3 s window in a match) instead of
 *   leaving, `attach` of a known session restores it with a snapshot, and `spectate`/`takeSeat`
 *   move seats;
 * - #63: lag-outs, through `Match.goOut`.
 */
export class Room {
  readonly code: string;
  readonly epoch: number;
  readonly mode: RoomMode;
  readonly kind: 'hosted' | 'quick';
  #hostId: string | undefined;
  #phase: RoomPhase = 'lobby';
  /** In the order they joined: the first is the longest there. */
  readonly #members = new Map<string, Member>();
  #match: Match | null = null;
  /** The last match, kept after it ends for the server/client hash check. */
  #lastMatch: Match | null = null;
  #stopTimers: (() => void)[] = [];
  /** In a quick-match room: a player left mid-match, so the room breaks up once it ends. */
  #opponentGone = false;
  /** A quick-match room that broke up: whoever arrives late is sent away at once. */
  #brokenUp = false;
  #stopArrival: () => void = () => {};
  readonly #options: RoomOptions;

  constructor(options: RoomOptions) {
    this.#options = options;
    this.code = options.code;
    this.epoch = options.epoch;
    this.mode = options.mode;
    this.kind = options.kind;
    this.#hostId = options.hostId;
    if (this.kind === 'quick') {
      this.#stopArrival = options.clock.after(QUICK_MATCH_ARRIVAL_MS, () => {
        if (!this.empty && this.#seated().length < SEATS[this.mode]) this.#breakUp();
      });
    }
  }

  get empty(): boolean {
    return this.#members.size === 0;
  }

  /** The current match's games as verified so far, or the last match's once it has ended. */
  verifiedGames(): VerifiedGame[] {
    return (this.#match ?? this.#lastMatch)?.verifiedGames() ?? [];
  }

  /**
   * A session joins (design §10.1): a free seat in the lobby, otherwise a spectator, unless the
   * spectators are full. A nickname already in the room gets `#2`, `#3`…
   */
  attach(sessionId: string, nickname: string, kind: PlayerKind, deliver: Deliver): void {
    const known = this.#members.get(sessionId);
    if (known) {
      known.deliver = deliver;
      this.#broadcastState();
      return;
    }
    if (this.#brokenUp) {
      deliver(sessionId, { event: 'opponentLeft', data: {} });
      return;
    }
    const seat = this.#phase === 'lobby' ? this.#freeSeat() : null;
    if (seat === null && this.#spectators().length >= this.#options.maxSpectators) {
      deliver(sessionId, exception(REFUSALS.full));
      return;
    }
    const member: Member = {
      id: sessionId,
      nickname: this.#uniqueNickname(nickname),
      kind,
      seat,
      ready: false,
      deliver,
    };
    this.#members.set(sessionId, member);
    this.#options.logger.info({ sessionId, seat }, 'joined room');
    this.#broadcastState();
    const seated = this.#seated();
    if (this.kind === 'quick' && seated.length === SEATS[this.mode] && !this.#lastMatch) {
      this.#stopArrival();
      this.#launch(seated);
    }
  }

  /** The session's connection closed. Until #64 holds its seat, that's leaving. */
  detach(sessionId: string): void {
    this.leave(sessionId);
  }

  /**
   * A member leaves: out of the match at their last verified frame if they were playing, and a new
   * host if they were the host, the longest-seated player (or member) left. A quick-match room
   * breaks up instead, once any match running has ended.
   */
  leave(sessionId: string): void {
    if (!this.#members.delete(sessionId)) return;
    this.#options.logger.info({ sessionId }, 'left room');
    if (this.kind === 'quick' && !this.empty) {
      if (!this.#match) {
        this.#breakUp();
        return;
      }
      // The match ends without them (now, or once the others are verified), then it breaks up.
      this.#opponentGone = true;
      this.#match.leave(sessionId);
      return;
    }
    this.#match?.leave(sessionId);
    if (this.#hostId === sessionId) {
      const members = [...this.#members.values()];
      this.#hostId = (members.find(({ seat }) => seat !== null) ?? members[0])?.id;
    }
    if (this.empty) {
      this.#stopMatch();
      this.#setPhase('lobby');
      this.#report();
      this.#options.emptied();
    } else {
      this.#broadcastState();
    }
  }

  /** A seated member readies up or stands down, in the lobby (design §10.1). */
  ready(sessionId: string, { ready }: Pick<ClientData<'ready'>, 'ready'>): void {
    const member = this.#members.get(sessionId);
    if (!member) return;
    if (this.kind === 'quick') {
      this.#refuse(member, REFUSALS.startsItself);
      return;
    }
    if (this.#phase !== 'lobby') {
      this.#refuse(member, REFUSALS.notInLobby);
      return;
    }
    if (member.seat === null) {
      this.#refuse(member, REFUSALS.notSeated);
      return;
    }
    member.ready = ready;
    this.#broadcastState();
  }

  /**
   * The host starts the match (design §10.1): their Start is their ready, and at least one other
   * seated player must be ready. Seated players who aren't sit it out and watch.
   */
  start(sessionId: string): void {
    const member = this.#members.get(sessionId);
    if (!member) return;
    if (this.kind === 'quick') {
      this.#refuse(member, REFUSALS.startsItself);
      return;
    }
    if (member.id !== this.#hostId) {
      this.#refuse(member, REFUSALS.notHost);
      return;
    }
    if (this.#phase !== 'lobby') {
      this.#refuse(member, REFUSALS.notInLobby);
      return;
    }
    const players = this.#seated().filter(({ id, ready }) => ready || id === this.#hostId);
    if (players.length < 2) {
      this.#refuse(member, REFUSALS.nobodyReady);
      return;
    }
    this.#launch(players);
  }

  /**
   * After results in a quick-match room (design §9.4): the player is ready for the next match,
   * which starts once both are.
   */
  rematch(sessionId: string): void {
    const member = this.#members.get(sessionId);
    if (!member) return;
    if (
      this.kind !== 'quick' ||
      this.#phase !== 'lobby' ||
      !this.#lastMatch ||
      member.seat === null
    ) {
      this.#refuse(member, REFUSALS.noRematch);
      return;
    }
    member.ready = true;
    this.#broadcastState();
    const seated = this.#seated();
    if (seated.length === SEATS[this.mode] && seated.every(({ ready }) => ready)) {
      this.#launch(seated);
    }
  }

  /** The countdown to a match between `players`, in seat order. */
  #launch(players: readonly Member[]): void {
    const { matchId, seed } = this.#options.newMatch();
    const { clock, logger, matchLog } = this.#options;
    const match = new Match({
      matchId,
      mode: this.mode,
      seed,
      players: players.map(({ id }) => id),
      epoch: this.epoch,
      log: matchLog,
      logger: logger.child({ matchId }),
      output: {
        toPlayer: (id, message) => this.#send(id, message),
        toOthers: (id, message) => {
          for (const other of this.#members.values()) if (other.id !== id) this.#to(other, message);
        },
        toRoom: (message) => this.#broadcast(message),
        ended: (result) => this.#ended(result),
      },
    });
    this.#match = match;
    const startAt = clock.now() + COUNTDOWN_MS;
    this.#setPhase('countdown');
    logger.info({ matchId, players: players.length }, 'match counting down');
    this.#broadcast({
      event: 'countdown',
      data: { startAt, seed, matchId, players: match.players },
    });
    this.#broadcastState();
    this.#stopTimers.push(
      clock.after(COUNTDOWN_MS, () => {
        if (this.#match !== match || match.ended) return;
        this.#setPhase('playing');
        this.#broadcastState();
      }),
      clock.every(ROOM_TICK_MS, () => match.tick()),
      clock.every(MATCH_LOG_APPEND_MS, () => match.appendLog()),
    );
  }

  /** An input batch from a player of the current match (design §8.1). */
  inputBatch(sessionId: string, batch: Pick<ClientData<'inputBatch'>, 'seq' | 'frames'>): void {
    if (this.#members.has(sessionId)) this.#match?.receive(sessionId, batch);
  }

  /** Stops the room's timers, as the room is deleted. */
  close(): void {
    this.#stopArrival();
    this.#stopMatch();
  }

  /** The match has ended: places for the lobby, every ready reset, and back to the lobby. */
  #ended({ placements }: ServerData<'matchEnd'>): void {
    this.#options.logger.info({ matchId: this.#match?.matchId }, 'match ended');
    for (const { playerId, place } of placements) {
      const member = this.#members.get(playerId);
      if (member) member.lastPlace = place;
    }
    for (const member of this.#members.values()) member.ready = false;
    this.#stopMatch();
    this.#setPhase('lobby');
    if (this.#opponentGone) {
      this.#breakUp();
      return;
    }
    this.#broadcastState();
  }

  /**
   * A quick-match room's players are no longer a pair (design §9.4): everyone still in it gets
   * `opponentLeft` and is out of it, back at the waiting screen, free to queue again. The room
   * is empty from here, and whoever arrives late is sent away the same way.
   */
  #breakUp(): void {
    this.#brokenUp = true;
    this.#stopArrival();
    this.#stopMatch();
    this.#setPhase('lobby');
    for (const member of [...this.#members.values()]) {
      this.#members.delete(member.id);
      this.#to(member, { event: 'opponentLeft', data: {} });
    }
    this.#options.logger.info('quick-match room broke up');
    this.#report();
    this.#options.emptied();
  }

  #stopMatch(): void {
    for (const stop of this.#stopTimers) stop();
    this.#stopTimers = [];
    // A match stopped before its end (the room emptied, or closed) deletes its log.
    this.#match?.stop();
    if (this.#match) this.#lastMatch = this.#match;
    this.#match = null;
  }

  #setPhase(phase: RoomPhase): void {
    this.#phase = phase;
  }

  #seated(): Member[] {
    return [...this.#members.values()]
      .filter((member) => member.seat !== null)
      .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
  }

  #spectators(): Member[] {
    return [...this.#members.values()].filter((member) => member.seat === null);
  }

  #freeSeat(): number | null {
    const taken = new Set(this.#seated().map(({ seat }) => seat));
    for (let seat = 0; seat < SEATS[this.mode]; seat++) if (!taken.has(seat)) return seat;
    return null;
  }

  #uniqueNickname(nickname: string): string {
    const names = new Set([...this.#members.values()].map((member) => member.nickname));
    if (!names.has(nickname)) return nickname;
    let suffix = 2;
    while (names.has(`${nickname}#${suffix}`)) suffix++;
    return `${nickname}#${suffix}`;
  }

  #state(): ServerData<'roomState'> {
    return {
      code: this.code,
      mode: this.mode,
      ...(this.#hostId !== undefined && { hostId: this.#hostId }),
      ...(this.kind === 'quick' && { quickMatch: true as const }),
      phase: this.#phase,
      players: this.#seated().map(({ id, nickname, kind, seat, ready, lastPlace }) => ({
        id,
        nickname,
        kind,
        seat: seat ?? 0,
        ready,
        ...(lastPlace !== undefined && { lastPlace }),
      })),
      spectators: this.#spectators().map(({ id, nickname, kind }) => ({ id, nickname, kind })),
    };
  }

  /** Tells the registry where the room is (design §9.5). */
  #report(): void {
    this.#options.changed({
      phase: this.#phase,
      hostId: this.#hostId ?? null,
      seated: this.#seated().length,
      spectators: this.#spectators().length,
    });
  }

  #broadcastState(): void {
    this.#broadcast({ event: 'roomState', data: this.#state() });
    this.#report();
  }

  #broadcast(message: ServerMessage): void {
    for (const member of this.#members.values()) this.#to(member, message);
  }

  #send(sessionId: string, message: ServerMessage): void {
    const member = this.#members.get(sessionId);
    if (member) this.#to(member, message);
  }

  #to(member: Member, message: ServerMessage): void {
    member.deliver(member.id, message);
  }

  #refuse(member: Member, refusal: ErrorBody): void {
    this.#to(member, exception(refusal));
  }
}

/** A refusal as the `exception` it's sent as. */
export const exception = ({ code, message }: ErrorBody): ServerMessage => ({
  event: 'exception',
  data: { code, message },
});
