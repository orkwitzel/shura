import {
  MAX_SPECTATORS,
  type RoomMode,
  type ServerData,
  type ServerEvent,
  type ServerMessage,
} from '@shura/protocol';
import { pino } from 'pino';
import { type Deliver, Room, type RoomSummary } from '../../src/rooms/room';
import { type FakeClock, fakeClock } from './fake-clock';

/** When the test room was made: a whole number of room ticks. */
export const ROOM_START = 1_800_000_000_000;

/** A message the room sent, who to, and through which link. */
export interface Sent {
  readonly to: string;
  readonly link: string;
  readonly message: ServerMessage;
}

export interface TestRoomOptions {
  readonly mode?: RoomMode;
  readonly hostId?: string;
  readonly maxSpectators?: number;
  /** Every match's seed. */
  readonly seed?: number;
}

/**
 * A room on a fake clock, driven directly as `RoomsService` drives it (design §10.1), with every
 * message it sends kept in order. Each session joins through a named link (a gateway's link to the
 * room, `main` unless the test says otherwise), so a test can come back through another one.
 */
export interface TestRoom {
  readonly room: Room;
  readonly clock: FakeClock;
  readonly sent: Sent[];
  /** What the room last reported for the registry. */
  readonly summary: () => RoomSummary | undefined;
  /** How many times the room said it was empty. */
  readonly emptied: () => number;
  /** `sessionId` joins, or comes back, through `link`, with its id as its nickname by default. */
  join(sessionId: string, options?: { nickname?: string; link?: string }): void;
  /** `sessionId`'s connection through `link` closed. */
  drop(sessionId: string, link?: string): void;
  /** Moves the fake clock on by `ms`, firing the timers due. */
  advance(ms: number): void;
  /** Every message sent to `sessionId`, oldest first, or only those of `event`. */
  to(sessionId: string, event?: ServerEvent): ServerMessage[];
  /** The texts of the exceptions sent to `sessionId`, oldest first. */
  errorsTo(sessionId: string): string[];
  /** The last `roomState` sent to anyone. */
  lastState(): ServerData<'roomState'> | undefined;
  /** The seated players' ids by seat, and the spectators' ids in order, from the last `roomState`. */
  seats(): { players: string[]; spectators: string[] };
}

export function testRoom({
  mode = '1v1',
  hostId,
  maxSpectators = MAX_SPECTATORS,
  seed = 7,
}: TestRoomOptions = {}): TestRoom {
  const clock = fakeClock(ROOM_START);
  const sent: Sent[] = [];
  const links = new Map<string, Deliver>();
  const linkOf = (name: string): Deliver => {
    let deliver = links.get(name);
    if (!deliver) {
      deliver = (to, message) => sent.push({ to, link: name, message });
      links.set(name, deliver);
    }
    return deliver;
  };
  let matches = 0;
  let summary: RoomSummary | undefined;
  let emptied = 0;
  const room = new Room({
    code: 'K7QX',
    epoch: 0,
    mode,
    kind: 'hosted',
    ...(hostId !== undefined && { hostId }),
    maxSpectators,
    clock,
    logger: pino({ level: 'silent' }),
    newMatch: () => ({ matchId: `match-${++matches}`, seed }),
    changed: (latest) => {
      summary = latest;
    },
    emptied: () => {
      emptied++;
    },
  });
  const states = () =>
    sent.flatMap(({ message }) => (message.event === 'roomState' ? [message.data] : []));
  return {
    room,
    clock,
    sent,
    summary: () => summary,
    emptied: () => emptied,
    join: (sessionId, { nickname = sessionId, link = 'main' } = {}) =>
      room.attach(sessionId, nickname, 'guest', linkOf(link)),
    drop: (sessionId, link = 'main') => room.detach(sessionId, linkOf(link)),
    advance: (ms) => clock.advanceTo(clock.now() + ms),
    to: (sessionId, event) =>
      sent.flatMap(({ to, message }) =>
        to === sessionId && (event === undefined || message.event === event) ? [message] : [],
      ),
    errorsTo: (sessionId) =>
      sent.flatMap(({ to, message }) =>
        to === sessionId && message.event === 'exception' ? [message.data.message] : [],
      ),
    lastState: () => states().at(-1),
    seats: () => {
      const state = states().at(-1);
      return {
        players: state?.players.map(({ id }) => id) ?? [],
        spectators: state?.spectators.map(({ id }) => id) ?? [],
      };
    },
  };
}
