import { describe, expect, it } from 'vitest';
import { type Place, Seating } from '../../src/rooms/seating';

interface Someone {
  readonly id: string;
  place: Place;
}

/** Seating over `seats` seats, and a way to bring members in, in the order they came. */
function seatingOf(seats: number) {
  const members = new Map<string, Someone>();
  const seating = new Seating(seats, members);
  return {
    seating,
    arrive(id: string, lobby = true): Someone {
      const member = { id, place: seating.arrival(lobby) };
      members.set(id, member);
      return member;
    },
    leave(id: string) {
      members.delete(id);
    },
    seats: () => seating.seated().map(({ id, place }) => [id, place.seat]),
    watching: () => seating.spectators().map(({ id }) => id),
  };
}

describe('Seating', () => {
  it('seats arrivals in the lowest free seat, and the rest watch, waiting for one', () => {
    const test = seatingOf(2);
    for (const id of ['a', 'b', 'c']) test.arrive(id);
    expect(test.seats()).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect(test.watching()).toEqual(['c']);
    expect(test.arrive('d').place).toEqual({ seat: null, waiting: true });
  });

  it('seats no one who arrives after the lobby', () => {
    const test = seatingOf(2);
    expect(test.arrive('a', false).place).toEqual({ seat: null, waiting: true });
  });

  it('lists the seated by seat, whatever order they came in', () => {
    const test = seatingOf(3);
    for (const id of ['a', 'b', 'c']) test.arrive(id);
    test.leave('a');
    test.arrive('d');
    expect(test.seats()).toEqual([
      ['d', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('lets a spectator take a free seat, and a seated member keep theirs', () => {
    const test = seatingOf(2);
    const a = test.arrive('a');
    test.arrive('b');
    const c = test.arrive('c');
    expect(test.seating.take(c)).toBe(false);
    test.seating.free(a);
    expect(a.place).toEqual({ seat: null, waiting: false });
    expect(test.seating.take(c)).toBe(true);
    expect(c.place).toEqual({ seat: 0, ready: false });
    expect(test.seating.take(c)).toBe(true);
    expect(c.place).toEqual({ seat: 0, ready: false });
  });

  it('fills free seats with the spectators waiting for one, in the order they came', () => {
    const test = seatingOf(2);
    const a = test.arrive('a');
    test.arrive('b');
    test.arrive('c');
    test.arrive('d');
    test.seating.free(a);
    test.leave('b');
    test.arrive('e', false);
    test.seating.fillWaiting();
    expect(test.seats()).toEqual([
      ['c', 0],
      ['d', 1],
    ]);
    expect(test.watching()).toEqual(['a', 'e']);
  });

  it('readies no one once it unreadies everyone', () => {
    const test = seatingOf(2);
    const a = test.arrive('a');
    if (a.place.seat !== null) a.place.ready = true;
    test.seating.unready();
    expect(a.place).toEqual({ seat: 0, ready: false });
  });
});
