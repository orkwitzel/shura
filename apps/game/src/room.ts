import {
  type ClientMessage,
  COUNTDOWN_MS,
  type ErrorCode,
  MAX_SPECTATORS,
  type PlayerKind,
  ROOM_TICK_MS,
  type RoomMode,
  type RoomPhase,
  SEAT_HOLD_MS,
  SEATS,
  type ServerMessage,
  type ServerMessageOf,
} from '@shura/protocol';
import type { MatchLog } from '@shura/valkey';
import type { ServerClock } from './clock';
import type { Logger } from './logger';
import { Match, type VerifiedGame } from './match';
import { MATCH_LOG_APPEND_MS } from './match-log-writer';

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
  /**
   * Where its messages go: the link it last attached through, which a reconnect through another
   * gateway changes. `null` while it's disconnected and its place is held.
   */
  deliver: Deliver | null;
  /**
   * A spectator waiting for a seat: one who joined a full room or mid-match, and takes a free seat
   * at the next lobby (design §10.1). Stepping out with `spectate` isn't waiting.
   */
  waiting: boolean;
  /** Cancels the timer that frees its place, while it's disconnected and held. */
  cancelHold: (() => void) | null;
  /** It was disconnected when the last match ended, so it hasn't had its `matchEnd`. */
  missedEnd: boolean;
}

export interface RoomOptions {
  readonly code: string;
  readonly epoch: number;
  readonly mode: RoomMode;
  readonly hostId?: string;
  /** The most spectators it holds: `MAX_SPECTATORS` unless the gateway says otherwise. */
  readonly maxSpectators?: number;
  readonly clock: ServerClock;
  readonly logger: Logger;
  /** Where each match's log goes (design §9.6). */
  readonly matchLog: MatchLog;
  /** A fresh match: its id and seed. */
  readonly newMatch: () => { matchId: string; seed: number };
  /** The room's phase or host changed, for the registry (design §9.5). */
  readonly changed: (update: { phase?: RoomPhase; hostId?: string | null }) => void;
  /** The room is empty, and has been for `EMPTY_ROOM_MS` once the caller's timer says so. */
  readonly emptied: () => void;
}

/**
 * A room on its game pod (design §10.1): its members, seated or spectating, in the order they
 * came, the host and ready, the countdown and the match.
 *
 * A member whose connection closes keeps their place (design §10.2): in the lobby, or as a
 * spectator, for `SEAT_HOLD_MS`; as a player in a match, until it ends and then for
 * `SEAT_HOLD_MS`. Coming back, or joining, mid-match brings the countdown, the outs so far and a
 * snapshot, so the client can show every game from there (§8.6). A quick-match room holds seats
 * the same way, and breaks up only once a hold runs out or a player really leaves.
 */
export class Room {
  readonly code: string;
  readonly epoch: number;
  readonly mode: RoomMode;
  /**
   * A quick-match room (design §9.4): created with no host, it starts by itself once both seats
   * are taken, rematches when both players ask, and sends the other player away when one leaves.
   */
  readonly quickMatch: boolean;
  #hostId: string | undefined;
  /** In a quick-match room: a player left mid-match, so the room breaks up once it ends. */
  #opponentGone = false;
  /** A quick-match room that broke up: whoever arrives late is sent away at once. */
  #brokenUp = false;
  #stopArrival: () => void = () => {};
  #phase: RoomPhase = 'lobby';
  /** In the order they joined: the first is the longest there. */
  readonly #members = new Map<string, Member>();
  #match: Match | null = null;
  /** The current match's `countdown`, sent again to whoever joins or comes back during it. */
  #countdown: ServerMessageOf<'countdown'> | null = null;
  /**
   * The last match, kept after it ends for the server/client hash check, and with its countdown
   * and result for a member who comes back having missed its end.
   */
  #lastMatch: Match | null = null;
  #last: { countdown: ServerMessageOf<'countdown'>; result: ServerMessageOf<'matchEnd'> } | null =
    null;
  #stopTimers: (() => void)[] = [];
  readonly #options: RoomOptions;

  constructor(options: RoomOptions) {
    this.#options = options;
    this.code = options.code;
    this.epoch = options.epoch;
    this.mode = options.mode;
    this.#hostId = options.hostId;
    this.quickMatch = options.hostId === undefined;
    if (this.quickMatch) {
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
   * spectators are full. A nickname already in the room gets `#2`, `#3`… A session already here
   * comes back to its place (design §10.2).
   */
  attach(sessionId: string, nickname: string, kind: PlayerKind, deliver: Deliver): void {
    const known = this.#members.get(sessionId);
    if (known) {
      known.deliver = deliver;
      known.cancelHold?.();
      known.cancelHold = null;
      this.#options.logger.info({ roomCode: this.code, sessionId }, 'came back to room');
      this.#broadcastState();
      if (this.#match) this.#catchUp(known);
      else if (known.missedEnd) this.#catchUpEnded(known);
      known.missedEnd = false;
      return;
    }
    if (this.#brokenUp) {
      deliver(sessionId, { type: 'opponentLeft' });
      return;
    }
    const seat = this.#phase === 'lobby' ? this.#freeSeat() : null;
    const maxSpectators = this.#options.maxSpectators ?? MAX_SPECTATORS;
    if (seat === null && this.#spectators().length >= maxSpectators) {
      deliver(sessionId, error('room_full', 'That room is full.'));
      return;
    }
    const member: Member = {
      id: sessionId,
      nickname: this.#uniqueNickname(nickname),
      kind,
      seat,
      ready: false,
      deliver,
      waiting: seat === null,
      cancelHold: null,
      missedEnd: false,
    };
    this.#members.set(sessionId, member);
    this.#options.logger.info({ roomCode: this.code, sessionId, seat }, 'joined room');
    this.#broadcastState();
    this.#catchUp(member);
    if (this.quickMatch && this.#seated().length === SEATS[this.mode] && !this.#lastMatch) {
      this.#stopArrival();
      this.#launch(this.#seated());
    }
  }

  /**
   * The session's connection, through the link `deliver` stands for, closed: its place is held
   * (design §10.2). A link it has already come back through another one from changes nothing.
   */
  detach(sessionId: string, deliver: Deliver): void {
    const member = this.#members.get(sessionId);
    if (!member || member.deliver !== deliver) return;
    member.deliver = null;
    this.#options.logger.info({ roomCode: this.code, sessionId }, 'disconnected from room');
    // A player's seat is held until the match ends; the hold starts then (`#ended`).
    if (!this.#match?.has(sessionId)) this.#hold(member);
  }

  /** A room-scoped message from a member's client. */
  handle(sessionId: string, message: ClientMessage): void {
    const member = this.#members.get(sessionId);
    if (!member) return;
    switch (message.type) {
      case 'ready':
        this.#ready(member, message.ready);
        return;
      case 'startMatch':
        this.#start(member);
        return;
      case 'rematch':
        this.#rematch(member);
        return;
      case 'leaveRoom':
        this.leave(sessionId);
        return;
      case 'leaveMatch':
        this.#leaveMatch(member);
        return;
      case 'inputBatch':
        this.#match?.receive(sessionId, message);
        return;
      case 'spectate':
        this.#spectate(member);
        return;
      case 'takeSeat':
        this.#takeSeat(member);
        return;
      case 'setNickname':
        this.#setNickname(member, message.nickname);
        return;
      default:
        // The gateway's own messages, which never reach a room.
        this.#refuse(member, 'wrong_phase', "That isn't for a room.");
        return;
    }
  }

  /**
   * A member leaves: out of the match at their last verified frame if they were playing, and a new
   * host if they were the host, the one there longest of those still connected. A quick-match room
   * breaks up instead, once any match running has ended.
   */
  leave(sessionId: string): void {
    const member = this.#members.get(sessionId);
    if (!member) return;
    member.cancelHold?.();
    this.#members.delete(sessionId);
    this.#options.logger.info({ roomCode: this.code, sessionId }, 'left room');
    this.#match?.leave(sessionId);
    if (this.quickMatch && !this.empty) {
      // Leaving can end the match there and then, which already broke the room up.
      if (this.#match) this.#opponentGone = true;
      else this.#breakUp();
      return;
    }
    if (this.#hostId === sessionId) {
      const members = [...this.#members.values()];
      const next = members.find(({ deliver }) => deliver !== null) ?? members[0];
      this.#hostId = next?.id;
      this.#options.changed({ hostId: next?.id ?? null });
    }
    if (this.empty) {
      this.#stopMatch();
      this.#options.emptied();
    } else {
      this.#broadcastState();
    }
  }

  /** Stops the room's timers, as the room is deleted. */
  close(): void {
    this.#stopArrival();
    this.#stopMatch();
    this.#stopHolds();
  }

  /** Frees a disconnected member's place once `SEAT_HOLD_MS` has passed without them back. */
  #hold(member: Member): void {
    member.cancelHold?.();
    member.cancelHold = this.#options.clock.after(SEAT_HOLD_MS, () => {
      member.cancelHold = null;
      this.#options.logger.info({ roomCode: this.code, sessionId: member.id }, 'seat hold ended');
      this.leave(member.id);
    });
  }

  #stopHolds(): void {
    for (const member of this.#members.values()) {
      member.cancelHold?.();
      member.cancelHold = null;
    }
  }

  /**
   * Brings someone joining or coming back mid-match up to date (design §8.6): the countdown to set
   * up the match, who is out already, every game at its last verified frame, and for a player
   * still in, the attacks sent to them that their game may not have received yet (§8.5).
   */
  #catchUp(member: Member): void {
    if (!this.#match || !this.#countdown) return;
    this.#to(member, this.#countdown);
    for (const out of this.#match.outs()) this.#to(member, out);
    this.#to(member, this.#match.snapshot());
    for (const attack of this.#match.unreceivedGarbage(member.id)) this.#to(member, attack);
  }

  /**
   * Brings a member who was away when the last match ended up to date: as `#catchUp` would have
   * during it, then its `matchEnd`, so the client shows the result over the final boards.
   */
  #catchUpEnded(member: Member): void {
    if (!this.#lastMatch || !this.#last) return;
    this.#to(member, this.#last.countdown);
    for (const out of this.#lastMatch.outs()) this.#to(member, out);
    this.#to(member, this.#lastMatch.snapshot());
    this.#to(member, this.#last.result);
  }

  /** A player leaves the match but not the room: out with `left`, they watch the rest of it. */
  #leaveMatch(member: Member): void {
    if (!this.#match?.has(member.id)) {
      this.#refuse(member, 'wrong_phase', "You're not playing a match.");
      return;
    }
    this.#match.leave(member.id);
  }

  #ready(member: Member, ready: boolean): void {
    if (this.quickMatch) {
      this.#refuse(member, 'wrong_phase', 'Quick-match rooms start by themselves.');
      return;
    }
    if (this.#phase !== 'lobby') {
      this.#refuse(member, 'wrong_phase', 'Not in the lobby.');
      return;
    }
    if (member.seat === null) {
      this.#refuse(member, 'wrong_phase', 'Take a seat to play.');
      return;
    }
    member.ready = ready;
    this.#broadcastState();
  }

  /** Steps out of a seat to watch, in the lobby (design §10.1). */
  #spectate(member: Member): void {
    if (this.quickMatch || this.#phase !== 'lobby') {
      this.#refuse(member, 'wrong_phase', 'Seats move in a lobby.');
      return;
    }
    member.seat = null;
    member.ready = false;
    member.waiting = false;
    this.#broadcastState();
  }

  /** Takes a free seat, in the lobby. */
  #takeSeat(member: Member): void {
    if (this.quickMatch || this.#phase !== 'lobby') {
      this.#refuse(member, 'wrong_phase', 'Seats move in a lobby.');
      return;
    }
    if (member.seat === null) {
      const seat = this.#freeSeat();
      if (seat === null) {
        this.#refuse(member, 'no_free_seat', 'Every seat is taken.');
        return;
      }
      member.seat = seat;
      member.waiting = false;
    }
    this.#broadcastState();
  }

  /** A new nickname, in the lobby only (design §10.2), already normalised by the gateway. */
  #setNickname(member: Member, nickname: string): void {
    if (this.#phase !== 'lobby') {
      this.#refuse(member, 'wrong_phase', 'Nicknames change in the lobby.');
      return;
    }
    member.nickname = this.#uniqueNickname(nickname, member);
    this.#broadcastState();
  }

  /**
   * The host starts the match (design §10.1): their Start is their ready, and at least one other
   * seated player must be ready. Seated players who aren't sit it out and watch.
   */
  #start(member: Member): void {
    if (this.quickMatch) {
      this.#refuse(member, 'wrong_phase', 'Quick-match rooms start by themselves.');
      return;
    }
    if (member.id !== this.#hostId) {
      this.#refuse(member, 'not_host', 'Only the host starts.');
      return;
    }
    if (this.#phase !== 'lobby') {
      this.#refuse(member, 'wrong_phase', 'Not in the lobby.');
      return;
    }
    const players = this.#seated().filter(({ id, ready }) => ready || id === this.#hostId);
    if (players.length < 2) {
      this.#refuse(member, 'wrong_phase', 'Waiting for another player to be ready.');
      return;
    }
    this.#launch(players);
  }

  /** After results in a quick-match room: the next match starts once both players ask. */
  #rematch(member: Member): void {
    if (!this.quickMatch || this.#phase !== 'lobby' || !this.#lastMatch || member.seat === null) {
      this.#refuse(member, 'wrong_phase', 'Rematch comes after a quick-match result.');
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
    const { clock } = this.#options;
    const startAt = clock.now() + COUNTDOWN_MS;
    this.#match = new Match({
      matchId,
      mode: this.mode,
      seed,
      players,
      clock,
      startAt,
      epoch: this.epoch,
      log: this.#options.matchLog,
      logger: this.#options.logger,
      output: {
        toPlayer: (id, message) => this.#send(id, message),
        toOthers: (id, message) => {
          for (const other of this.#members.values()) if (other.id !== id) this.#to(other, message);
        },
        toRoom: (message) => this.#broadcast(message),
        ended: (result) => this.#ended(result),
      },
    });
    this.#setPhase('countdown');
    this.#options.logger.info({ roomCode: this.code, matchId }, 'match counting down');
    this.#countdown = { type: 'countdown', startAt, seed, matchId, players: this.#match.players };
    this.#broadcast(this.#countdown);
    this.#broadcastState();
    const match = this.#match;
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

  /**
   * The match has ended: places for the lobby, every ready reset, back to the lobby, and the
   * spectators waiting for seats in the free ones. Players still disconnected are held from now.
   */
  #ended(result: ServerMessageOf<'matchEnd'>): void {
    this.#options.logger.info(
      { roomCode: this.code, matchId: this.#match?.matchId },
      'match ended',
    );
    if (this.#countdown) this.#last = { countdown: this.#countdown, result };
    for (const { playerId, place } of result.placements) {
      const member = this.#members.get(playerId);
      if (member) member.lastPlace = place;
    }
    for (const member of this.#members.values()) {
      member.ready = false;
      if (member.deliver !== null) continue;
      member.missedEnd = true;
      if (!member.cancelHold) this.#hold(member);
    }
    this.#stopMatch();
    this.#setPhase('lobby');
    if (this.#opponentGone) {
      this.#breakUp();
      return;
    }
    this.#fillSeats();
    this.#broadcastState();
  }

  /**
   * A quick-match room's players are no longer a pair (design §9.4): everyone still in it gets
   * `opponentLeft` and is out of the room, back at the waiting screen, free to queue again.
   */
  #breakUp(): void {
    this.#brokenUp = true;
    this.#stopArrival();
    this.#stopHolds();
    for (const member of [...this.#members.values()]) {
      this.#members.delete(member.id);
      this.#to(member, { type: 'opponentLeft' });
    }
    this.#options.logger.info({ roomCode: this.code }, 'quick-match room broke up');
    this.#stopMatch();
    this.#options.emptied();
  }

  #stopMatch(): void {
    for (const stop of this.#stopTimers) stop();
    this.#stopTimers = [];
    this.#match?.stop();
    if (this.#match) this.#lastMatch = this.#match;
    this.#match = null;
    this.#countdown = null;
  }

  #setPhase(phase: RoomPhase): void {
    this.#phase = phase;
    this.#options.changed({ phase });
  }

  /**
   * Back in the lobby, the spectators waiting for a seat take the free ones, in the order they
   * came (design §10.1).
   */
  #fillSeats(): void {
    for (const member of this.#spectators()) {
      if (!member.waiting) continue;
      const seat = this.#freeSeat();
      if (seat === null) return;
      member.seat = seat;
      member.waiting = false;
    }
  }

  #seated(): Member[] {
    return [...this.#members.values()]
      .filter((member) => member.seat !== null)
      .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
  }

  /** In the order they came. */
  #spectators(): Member[] {
    return [...this.#members.values()].filter((member) => member.seat === null);
  }

  #freeSeat(): number | null {
    const taken = new Set(this.#seated().map(({ seat }) => seat));
    for (let seat = 0; seat < SEATS[this.mode]; seat++) if (!taken.has(seat)) return seat;
    return null;
  }

  /** `nickname`, or with `#2`, `#3`… if another member (than `self`) has it. */
  #uniqueNickname(nickname: string, self?: Member): string {
    const names = new Set(
      [...this.#members.values()].filter((other) => other !== self).map((other) => other.nickname),
    );
    if (!names.has(nickname)) return nickname;
    let suffix = 2;
    while (names.has(`${nickname}#${suffix}`)) suffix++;
    return `${nickname}#${suffix}`;
  }

  #state(): ServerMessageOf<'roomState'> {
    return {
      type: 'roomState',
      code: this.code,
      mode: this.mode,
      ...(this.#hostId !== undefined && { hostId: this.#hostId }),
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

  #broadcastState(): void {
    this.#broadcast(this.#state());
  }

  #broadcast(message: ServerMessage): void {
    for (const member of this.#members.values()) this.#to(member, message);
  }

  #send(sessionId: string, message: ServerMessage): void {
    const member = this.#members.get(sessionId);
    if (member) this.#to(member, message);
  }

  /** To a member's client, unless it's disconnected: a snapshot catches it up when it's back. */
  #to(member: Member, message: ServerMessage): void {
    member.deliver?.(member.id, message);
  }

  #refuse(member: Member, code: ErrorCode, text: string): void {
    this.#to(member, error(code, text));
  }
}

function error(code: ErrorCode, message: string): ServerMessageOf<'error'> {
  return { type: 'error', code, message };
}
