import {
  type ClientMessage,
  COUNTDOWN_MS,
  type ErrorCode,
  MAX_SPECTATORS,
  type PlayerKind,
  ROOM_TICK_MS,
  type RoomMode,
  type RoomPhase,
  SEATS,
  type ServerMessage,
  type ServerMessageOf,
} from '@shura/protocol';
import type { ServerClock } from './clock';
import type { Logger } from './logger';
import { Match, type VerifiedGame } from './match';

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

export interface RoomOptions {
  readonly code: string;
  readonly epoch: number;
  readonly mode: RoomMode;
  readonly hostId?: string;
  readonly clock: ServerClock;
  readonly logger: Logger;
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
 * Seams for later tickets:
 * - #64: `detach` holds the seat (30 s in the lobby, the 3 s window in a match) instead of
 *   leaving, `attach` of a known session restores it with a snapshot, and `spectate`/`takeSeat`
 *   move seats;
 * - #65: quick-match rooms (no host, `rematch`).
 */
export class Room {
  readonly code: string;
  readonly epoch: number;
  readonly mode: RoomMode;
  #hostId: string | undefined;
  #phase: RoomPhase = 'lobby';
  /** In the order they joined: the first is the longest there. */
  readonly #members = new Map<string, Member>();
  #match: Match | null = null;
  /** The last match, kept after it ends for the server/client hash check. */
  #lastMatch: Match | null = null;
  #stopTimers: (() => void)[] = [];
  readonly #options: RoomOptions;

  constructor(options: RoomOptions) {
    this.#options = options;
    this.code = options.code;
    this.epoch = options.epoch;
    this.mode = options.mode;
    this.#hostId = options.hostId;
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
    const seat = this.#phase === 'lobby' ? this.#freeSeat() : null;
    const spectators = [...this.#members.values()].filter((member) => member.seat === null);
    if (seat === null && spectators.length >= MAX_SPECTATORS) {
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
    };
    this.#members.set(sessionId, member);
    this.#options.logger.info({ roomCode: this.code, sessionId, seat }, 'joined room');
    this.#broadcastState();
  }

  /** The session's connection closed. Until #64 holds its seat, that's leaving. */
  detach(sessionId: string): void {
    this.leave(sessionId);
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
      case 'leaveRoom':
        this.leave(sessionId);
        return;
      case 'leaveMatch':
        this.#leaveMatch(member);
        return;
      case 'inputBatch':
        this.#match?.receive(sessionId, message);
        return;
      default:
        // spectate, takeSeat and setNickname come with #64; rematch with #65.
        member.deliver(sessionId, error('wrong_phase', "That isn't available yet."));
        return;
    }
  }

  /**
   * A member leaves: out of the match at their last verified frame if they were playing, and a new
   * host if they were the host, the longest-seated player (or member) left.
   */
  leave(sessionId: string): void {
    const member = this.#members.get(sessionId);
    if (!member) return;
    this.#members.delete(sessionId);
    this.#options.logger.info({ roomCode: this.code, sessionId }, 'left room');
    this.#match?.leave(sessionId);
    if (this.#hostId === sessionId) {
      const members = [...this.#members.values()];
      const next = members.find(({ seat }) => seat !== null) ?? members[0];
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
    this.#stopMatch();
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

  /**
   * The host starts the match (design §10.1): their Start is their ready, and at least one other
   * seated player must be ready. Seated players who aren't sit it out and watch.
   */
  #start(member: Member): void {
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
    this.#broadcast({ type: 'countdown', startAt, seed, matchId, players: this.#match.players });
    this.#broadcastState();
    const match = this.#match;
    this.#stopTimers.push(
      clock.after(COUNTDOWN_MS, () => {
        if (this.#match !== match || match.ended) return;
        this.#setPhase('playing');
        this.#broadcastState();
      }),
      clock.every(ROOM_TICK_MS, () => match.tick()),
    );
  }

  /** The match has ended: places for the lobby, every ready reset, and back to the lobby. */
  #ended({ placements }: ServerMessageOf<'matchEnd'>): void {
    this.#options.logger.info(
      { roomCode: this.code, matchId: this.#match?.matchId },
      'match ended',
    );
    for (const { playerId, place } of placements) {
      const member = this.#members.get(playerId);
      if (member) member.lastPlace = place;
    }
    for (const member of this.#members.values()) member.ready = false;
    this.#stopMatch();
    this.#setPhase('lobby');
    this.#broadcastState();
  }

  #stopMatch(): void {
    for (const stop of this.#stopTimers) stop();
    this.#stopTimers = [];
    this.#match?.stop();
    if (this.#match) this.#lastMatch = this.#match;
    this.#match = null;
  }

  #setPhase(phase: RoomPhase): void {
    this.#phase = phase;
    this.#options.changed({ phase });
  }

  #seated(): Member[] {
    return [...this.#members.values()]
      .filter((member) => member.seat !== null)
      .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
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

  #state(): ServerMessageOf<'roomState'> {
    const members = [...this.#members.values()];
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
      spectators: members
        .filter(({ seat }) => seat === null)
        .map(({ id, nickname, kind }) => ({ id, nickname, kind })),
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

  #to(member: Member, message: ServerMessage): void {
    member.deliver(member.id, message);
  }

  #refuse(member: Member, code: ErrorCode, text: string): void {
    this.#to(member, error(code, text));
  }
}

function error(code: ErrorCode, message: string): ServerMessageOf<'error'> {
  return { type: 'error', code, message };
}
