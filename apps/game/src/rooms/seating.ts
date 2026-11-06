/** A seated member's place: their seat, and whether they're ready to play (design §10.1). */
export interface Seat {
  readonly seat: number;
  ready: boolean;
}

/**
 * A spectator's place. One `waiting` joined a full room or mid-match, and takes a free seat at the
 * next lobby; stepping out with `spectate` isn't waiting.
 */
export interface Spectating {
  readonly seat: null;
  readonly waiting: boolean;
}

export type Place = Seat | Spectating;

/** Someone with a place in the room. */
export interface Placed {
  place: Place;
}

/**
 * The room's seats (design §10.1): who sits in which, and who watches. It reads the room's
 * members, in the order they came, and changes only their places.
 */
export class Seating<Member extends Placed> {
  readonly #seats: number;
  readonly #members: ReadonlyMap<string, Member>;

  constructor(seats: number, members: ReadonlyMap<string, Member>) {
    this.#seats = seats;
    this.#members = members;
  }

  /** Where someone arriving goes: the lowest free seat in the lobby, otherwise to wait for one. */
  arrival(lobby: boolean): Place {
    const seat = lobby ? this.#freeSeat() : null;
    return seat === null ? { seat: null, waiting: true } : { seat, ready: false };
  }

  /** The seated members, in seat order. */
  seated(): (Member & { place: Seat })[] {
    return [...this.#members.values()]
      .filter((member): member is Member & { place: Seat } => member.place.seat !== null)
      .sort((a, b) => a.place.seat - b.place.seat);
  }

  /** The spectators, in the order they came. */
  spectators(): Member[] {
    return [...this.#members.values()].filter(({ place }) => place.seat === null);
  }

  /** Seats a spectator in the lowest free seat. False if every seat is taken. */
  take(member: Member): boolean {
    if (member.place.seat !== null) return true;
    const seat = this.#freeSeat();
    if (seat === null) return false;
    member.place = { seat, ready: false };
    return true;
  }

  /** Steps a member out of their seat to watch, not waiting for another. */
  free(member: Member): void {
    member.place = { seat: null, waiting: false };
  }

  /** Back in the lobby: the spectators waiting for a seat take the free ones, in the order they came. */
  fillWaiting(): void {
    for (const member of this.spectators()) {
      if (member.place.seat !== null || !member.place.waiting) continue;
      const seat = this.#freeSeat();
      if (seat === null) return;
      member.place = { seat, ready: false };
    }
  }

  /** Every seated member not ready, as a match ends. */
  unready(): void {
    for (const { place } of this.seated()) place.ready = false;
  }

  #freeSeat(): number | null {
    const taken = new Set(this.seated().map(({ place }) => place.seat));
    for (let seat = 0; seat < this.#seats; seat++) if (!taken.has(seat)) return seat;
    return null;
  }
}
