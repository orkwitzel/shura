import {
  type ClientData,
  COUNTDOWN_MS,
  type ErrorBody,
  type PlayerKind,
  ROOM_TICK_MS,
  type RoomMode,
  type RoomPhase,
  SEAT_HOLD_MS,
  SEATS,
  type ServerData,
  type ServerMessage,
} from '@shura/protocol';
import type { Logger } from 'pino';
import type { Clock } from '../clock';
import { Match, type NewMatch, type VerifiedGame } from '../match';
import { REFUSALS } from './refusals';
import { type Placed, Seating } from './seating';

/**
 * How long a quick-match room waits for its second player (design §9.4). A player paired with
 * someone whose gateway never attached them goes back to the waiting screen after it.
 */
export const QUICK_MATCH_ARRIVAL_MS = 10_000;

/** Where a room's messages to one session go: the gateway link it attached through. */
export type Deliver = (sessionId: string, message: ServerMessage) => void;

/**
 * A member whose connection closed, their place held (design §10.2). `held` cancels the timer that
 * frees it: `null` while they're a player in the running match, whose hold starts once it ends.
 */
interface Away {
  held: (() => void) | null;
  /** They were away when the last match ended, so they haven't had its `matchEnd`. */
  missedEnd: boolean;
}

/**
 * A member's connection: the link they last attached through (a reconnect through another gateway
 * changes it), or away.
 */
type Link = { readonly deliver: Deliver } | Away;

/** A session in the room: seated or spectating (its `place`), connected or away (its `link`). */
interface Member extends Placed {
  readonly id: string;
  nickname: string;
  readonly kind: PlayerKind;
  lastPlace?: number;
  link: Link;
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
  /** The room's phase, host or counts may have changed: for the registry (design §9.5). */
  readonly changed: (summary: RoomSummary) => void;
  /** The room has emptied. Its service deletes it after `EMPTY_ROOM_MS` unless someone comes. */
  readonly emptied: () => void;
}

/**
 * A room on its game pod (design §10.1): its members, seated or spectating, in the order they
 * came, the host and ready, the countdown and the match. At the match's end the room goes straight
 * back to the lobby, readies reset and each player's place kept, and the spectators waiting for a
 * seat take the free ones: the results are a client screen over `matchEnd`.
 *
 * A member whose connection closes keeps their place (design §10.2): in the lobby, or as a
 * spectator, for `SEAT_HOLD_MS`; as a player in a match, until it ends and then for
 * `SEAT_HOLD_MS`. Coming back, or joining, mid-match brings the countdown, the outs so far and a
 * snapshot, so the client can show every game from there (§8.6).
 *
 * A quick-match room (`kind: 'quick'`, design §9.4) has no host and no lobby to ready in: its
 * first match starts as soon as both seats are taken, the next once both players `rematch`, and
 * when a player leaves (or their hold runs out) it breaks up, after the match if one is running:
 * everyone still in it gets `opponentLeft` and is out of it.
 */
export class Room {
  readonly code: string;
  readonly epoch: number;
  readonly mode: RoomMode;
  readonly kind: 'hosted' | 'quick';
  /** A hosted room's host: `undefined` in a quick-match room, and in a hosted one while empty. */
  #hostId: string | undefined;
  #phase: RoomPhase = 'lobby';
  /** In the order they joined: the first is the longest there. */
  readonly #members = new Map<string, Member>();
  readonly #seating: Seating<Member>;
  #match: Match | null = null;
  /** The current match's `countdown`, sent again to whoever joins or comes back during it. */
  #countdown: ServerMessage | null = null;
  /** The last match, kept after it ends for the server/client hash check. */
  #lastMatch: Match | null = null;
  /** The last match's countdown and result, for a member who comes back having missed its end. */
  #last: { readonly countdown: ServerMessage; readonly result: ServerMessage } | null = null;
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
    this.#seating = new Seating(SEATS[options.mode], this.#members);
    if (this.kind === 'quick') {
      this.#stopArrival = options.clock.after(QUICK_MATCH_ARRIVAL_MS, () => {
        if (!this.empty && this.#seating.seated().length < SEATS[this.mode]) this.#breakUp();
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
   * A session joins (design §10.1): a free seat in the lobby, otherwise a spectator waiting for
   * one, unless the spectators are full. A nickname already in the room gets `#2`, `#3`… A session
   * already here comes back to its place (design §10.2) through the link it came by.
   */
  attach(sessionId: string, nickname: string, kind: PlayerKind, deliver: Deliver): void {
    const known = this.#members.get(sessionId);
    if (known) {
      this.#comeBack(known, deliver);
      return;
    }
    if (this.#brokenUp) {
      deliver(sessionId, { event: 'opponentLeft', data: {} });
      return;
    }
    const place = this.#seating.arrival(this.#phase === 'lobby');
    if (place.seat === null && this.#seating.spectators().length >= this.#options.maxSpectators) {
      deliver(sessionId, exception(REFUSALS.full));
      return;
    }
    const member: Member = {
      id: sessionId,
      nickname: this.#uniqueNickname(nickname),
      kind,
      place,
      link: { deliver },
    };
    this.#members.set(sessionId, member);
    this.#options.logger.info({ sessionId, seat: place.seat }, 'joined room');
    // A hosted room that emptied lost its host: whoever joins it before it's deleted is the host.
    if (this.kind === 'hosted' && this.#hostId === undefined) this.#hostId = sessionId;
    this.#broadcastState();
    this.#catchUp(member);
    const seated = this.#seating.seated();
    if (this.kind === 'quick' && seated.length === SEATS[this.mode] && !this.#lastMatch) {
      this.#stopArrival();
      this.#launch(seated);
    }
  }

  /**
   * The session's connection, through the link `deliver` stands for, closed: its place is held
   * (design §10.2). A link it has since come back through another one from changes nothing.
   */
  detach(sessionId: string, deliver: Deliver): void {
    const member = this.#members.get(sessionId);
    if (!member || !('deliver' in member.link) || member.link.deliver !== deliver) return;
    const away: Away = { held: null, missedEnd: false };
    member.link = away;
    this.#options.logger.info({ sessionId }, 'disconnected from room');
    // A player's seat is held until the match ends; the hold starts then (`#ended`).
    if (!this.#match?.has(sessionId)) this.#hold(member, away);
  }

  /**
   * A member leaves: out of the match at their last verified frame if they were playing, and a new
   * host if they were the host, the one there longest of those still connected. A quick-match
   * room breaks up instead, once any match running has ended.
   */
  leave(sessionId: string): void {
    const member = this.#members.get(sessionId);
    if (!member) return;
    if ('held' in member.link) member.link.held?.();
    this.#members.delete(sessionId);
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
      this.#hostId = (members.find(({ link }) => 'deliver' in link) ?? members[0])?.id;
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
    if (member.place.seat === null) {
      this.#refuse(member, REFUSALS.notSeated);
      return;
    }
    member.place.ready = ready;
    this.#broadcastState();
  }

  /** Steps out of a seat to watch, in the lobby (design §10.1). They don't wait for another. */
  spectate(sessionId: string): void {
    const member = this.#seatMover(sessionId);
    if (!member) return;
    this.#seating.free(member);
    this.#broadcastState();
  }

  /** Takes the lowest free seat, in the lobby (design §10.1). */
  takeSeat(sessionId: string): void {
    const member = this.#seatMover(sessionId);
    if (!member) return;
    if (!this.#seating.take(member)) {
      this.#refuse(member, REFUSALS.noFreeSeat);
      return;
    }
    this.#broadcastState();
  }

  /**
   * A new nickname, in the lobby only (design §10.2), as the gateway normalised it, with `#2`…
   * if another member has it.
   */
  setNickname(sessionId: string, { nickname }: Pick<ClientData<'setNickname'>, 'nickname'>): void {
    const member = this.#lobbyMember(sessionId, REFUSALS.nicknameInLobby);
    if (!member) return;
    member.nickname = this.#uniqueNickname(nickname, member);
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
    const players = this.#seating
      .seated()
      .filter(({ id, place }) => place.ready || id === this.#hostId);
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
      member.place.seat === null
    ) {
      this.#refuse(member, REFUSALS.noRematch);
      return;
    }
    member.place.ready = true;
    this.#broadcastState();
    const seated = this.#seating.seated();
    if (seated.length === SEATS[this.mode] && seated.every(({ place }) => place.ready)) {
      this.#launch(seated);
    }
  }

  /** The countdown to a match between `players`, in seat order. */
  #launch(players: readonly Member[]): void {
    const { matchId, seed } = this.#options.newMatch();
    const { clock, logger } = this.#options;
    const startAt = clock.now() + COUNTDOWN_MS;
    const match = new Match({
      matchId,
      mode: this.mode,
      seed,
      players: players.map(({ id }) => id),
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
    this.#match = match;
    this.#last = null;
    this.#setPhase('countdown');
    logger.info({ matchId, players: players.length }, 'match counting down');
    this.#countdown = {
      event: 'countdown',
      data: { startAt, seed, matchId, players: match.players },
    };
    this.#broadcast(this.#countdown);
    this.#broadcastState();
    this.#stopTimers.push(
      clock.after(COUNTDOWN_MS, () => {
        if (this.#match !== match || match.ended) return;
        this.#setPhase('playing');
        this.#broadcastState();
      }),
      clock.every(ROOM_TICK_MS, () => match.tick()),
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
    this.#stopHolds();
  }

  /**
   * A member comes back (design §10.2): through `deliver` from now on, their hold cancelled, and
   * caught up on the match they missed part or the end of.
   */
  #comeBack(member: Member, deliver: Deliver): void {
    const { link } = member;
    member.link = { deliver };
    if ('held' in link) link.held?.();
    this.#options.logger.info({ sessionId: member.id }, 'came back to room');
    this.#broadcastState();
    if (this.#match) this.#catchUp(member);
    else if ('missedEnd' in link && link.missedEnd) this.#catchUpEnded(member);
  }

  /** Frees an away member's place once `SEAT_HOLD_MS` has passed without them back. */
  #hold(member: Member, away: Away): void {
    away.held?.();
    away.held = this.#options.clock.after(SEAT_HOLD_MS, () => {
      away.held = null;
      this.#options.logger.info({ sessionId: member.id }, 'seat hold ended');
      this.leave(member.id);
    });
  }

  /**
   * Brings someone joining or coming back mid-match up to date (design §8.6): the countdown to set
   * the match up, who is out already, every game at its last verified frame, and for a player
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

  /**
   * The match has ended: places for the lobby, every ready reset, back to the lobby, and the
   * spectators waiting for a seat in the free ones. Players still away are held from now.
   */
  #ended(result: ServerData<'matchEnd'>): void {
    this.#options.logger.info({ matchId: this.#match?.matchId }, 'match ended');
    if (this.#countdown) {
      this.#last = { countdown: this.#countdown, result: { event: 'matchEnd', data: result } };
    }
    for (const { playerId, place } of result.placements) {
      const member = this.#members.get(playerId);
      if (member) member.lastPlace = place;
    }
    this.#seating.unready();
    for (const member of this.#members.values()) {
      const { link } = member;
      if ('deliver' in link) continue;
      link.missedEnd = true;
      if (!link.held) this.#hold(member, link);
    }
    this.#stopMatch();
    this.#setPhase('lobby');
    if (this.#opponentGone) {
      this.#breakUp();
      return;
    }
    this.#seating.fillWaiting();
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
    this.#stopHolds();
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

  #stopHolds(): void {
    for (const { link } of this.#members.values()) {
      if (!('held' in link)) continue;
      link.held?.();
      link.held = null;
    }
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
  }

  /** The member, if they may move seats: in a hosted room's lobby (design §10.1). */
  #seatMover(sessionId: string): Member | undefined {
    const member = this.#members.get(sessionId);
    if (member && this.kind === 'quick') {
      this.#refuse(member, REFUSALS.seatsInLobby);
      return undefined;
    }
    return this.#lobbyMember(sessionId, REFUSALS.seatsInLobby);
  }

  /** The member, if the room is in its lobby; otherwise they're refused with `refusal`. */
  #lobbyMember(sessionId: string, refusal: ErrorBody): Member | undefined {
    const member = this.#members.get(sessionId);
    if (!member) return undefined;
    if (this.#phase !== 'lobby') {
      this.#refuse(member, refusal);
      return undefined;
    }
    return member;
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

  #state(): ServerData<'roomState'> {
    return {
      code: this.code,
      mode: this.mode,
      ...(this.#hostId !== undefined && { hostId: this.#hostId }),
      ...(this.kind === 'quick' && { quickMatch: true as const }),
      phase: this.#phase,
      players: this.#seating.seated().map(({ id, nickname, kind, place, lastPlace }) => ({
        id,
        nickname,
        kind,
        seat: place.seat,
        ready: place.ready,
        ...(lastPlace !== undefined && { lastPlace }),
      })),
      // In the order they came (design §10.1), which is the order they take free seats in.
      spectators: this.#seating
        .spectators()
        .map(({ id, nickname, kind }) => ({ id, nickname, kind })),
    };
  }

  /** Tells the registry where the room is (design §9.5). */
  #report(): void {
    this.#options.changed({
      phase: this.#phase,
      hostId: this.#hostId ?? null,
      seated: this.#seating.seated().length,
      spectators: this.#seating.spectators().length,
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

  /** To a member's client, unless they're away: a snapshot catches them up when they're back. */
  #to({ id, link }: Member, message: ServerMessage): void {
    if ('deliver' in link) link.deliver(id, message);
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
