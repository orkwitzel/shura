import { ENGINE_VERSION, type PieceActionType } from '@shura/engine';
import {
  type ClientData,
  type ClientEvent,
  LAG_OUT_MS,
  type PlayerKind,
  PROTOCOL_VERSION,
  type RoomMode,
  type ServerData,
  type ServerMessage,
  serverMessageSchema,
} from '@shura/protocol';
import { createNanoEvents } from 'nanoevents';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { DEFAULT_HANDLING, type Handling } from '../input/handling';
import {
  type AutoShift,
  createInputEngine,
  type InputEngine,
  type InputSettings,
  type KeyEvent,
} from '../input/input-engine';
import type { TimerClock } from '../shared/clock';
import type { Store } from '../shared/store';
import type { AppliedActionsListener, SessionEventListener } from '../solo/solo-session';
import { type Api, createApi, type Fetch, socketUrl } from './api';
import { ClockSync } from './clock-sync';
import { isOnlineError, UNREACHABLE_TEXT } from './online-error';
import { OnlineMatch, type OnlineMatchState } from './online-match';
import type { Connect, OnlineSocket } from './online-socket';

/** Pings taken one after another as the session connects (design §8.4). */
export const CONNECT_PINGS = 5;

/** How often the session pings once connected, in the lobby and during matches (design §8.4). */
export const PING_EVERY_MS = 2000;

/**
 * The wait between attempts to reconnect while the drop is inside the lag-out window (design
 * §10.2): the first attempt is at once, then one every 250 ms until 3 s after the drop, so a player
 * whose network is back within the window is back before the server lags them out.
 */
export const RECONNECT_QUICK_MS = 250;

/** The waits between attempts once the window has passed: 1 s, then every 2 s (the last, repeated). */
export const RECONNECT_BACKOFF_MS: readonly number[] = [1000, 2000];

/** Why a connection can fail for good: trying again can't help. */
const FINAL_FAILURES: ReadonlySet<string> = new Set(['version_mismatch', 'nickname_invalid']);

/**
 * Why a connection failed: the server's error `code` (from `POST /api/sessions` or an `exception`
 * before the `welcome`, such as `version_mismatch`), or `unreachable`.
 */
export type ConnectionFailure = string;

/**
 * The connection (design §13.1): opening (the session's `POST`, then the socket and its `hello`),
 * connected (the `hello` was welcomed), reconnecting after it dropped (design §10.2), failed (with
 * why), or closed by the player.
 */
export type OnlineConnection =
  | { readonly status: 'connecting' }
  | { readonly status: 'connected' }
  | { readonly status: 'reconnecting' }
  | { readonly status: 'failed'; readonly reason: ConnectionFailure; readonly message: string }
  | { readonly status: 'closed' };

/**
 * A garbage routing (design §8.5): the server sent an attack of `lines` from `from` to `to`. Only
 * its target's game takes it in; every client draws it (the attack streak, design §13.2).
 */
export type GarbageRouting = Pick<
  ServerData<'garbageQueued'>,
  'id' | 'from' | 'to' | 'lines' | 'holeSeed'
>;

/** Hears each garbage routing of the current match. */
export type RoutingListener = (routing: GarbageRouting) => void;

/**
 * Quick-match (design §9.4), while you're in no room: not asking, waiting in the queue for a
 * partner, or back from a quick-match room whose other player left, free to queue again.
 */
export type QuickMatchStatus = 'idle' | 'queued' | 'opponentLeft';

/** A room as the server last described it (`roomState`). */
export type OnlineRoom = Pick<
  ServerData<'roomState'>,
  'code' | 'mode' | 'hostId' | 'phase' | 'players' | 'spectators'
> & {
  /** A quick-match room (design §9.4), with no host, rather than a hosted one. */
  readonly quickMatch: boolean;
};

export interface OnlineSessionState {
  readonly connection: OnlineConnection;
  /** Your session id, once the server has given it. */
  readonly sessionId: string | null;
  /**
   * The session token from `POST /api/sessions`, which the `hello` (and a reconnect) sends: the
   * web keeps it in `sessionStorage` for a reload (design §10.2).
   */
  readonly sessionToken: string | null;
  /** Your nickname as the server normalized it, and as your room last said it. */
  readonly nickname: string | null;
  /**
   * Every nickname seen by player id, yours included: merged from each `roomState`, so a player
   * who has left still has a name on their board and in the results.
   */
  readonly names: ReadonlyMap<string, string>;
  /** The latest ping's round trip, in ms (design §8.4). */
  readonly ping: number | null;
  /** The room you're in. */
  readonly room: OnlineRoom | null;
  /** The current match, or the last one until the next starts or you leave the room. */
  readonly match: OnlineMatchState | null;
  /** Quick-match, outside a room: a quick-match room's `roomState` puts it back to `idle`. */
  readonly quickMatch: QuickMatchStatus;
  /** The latest `exception` the server sent that didn't end the connection. */
  readonly error: { readonly code: string; readonly message: string } | null;
}

export interface OnlineSessionOptions {
  /** The server's HTTP origin: the API is under `/api` and the socket at `ws(s)://…/ws`. */
  readonly serverUrl: string;
  /** Opens the WebSocket: `webSocketConnect((url) => new WebSocket(url))`, or a test's. */
  readonly connect: Connect;
  /** The platform's `fetch`, for `POST /api/sessions`: the global one by default. */
  readonly fetch?: Fetch;
  readonly clock: TimerClock;
  /** As the player set it; the server normalizes it and has the last word (design §10.2). */
  readonly nickname: string;
  /** The app's own version, for the server's logs. */
  readonly clientVersion: string;
  /** `bot` from the bot tool (design §13.4). */
  readonly kind?: PlayerKind;
  /** A session token from an earlier session, to come back as it (design §10.2). */
  readonly sessionToken?: string;
  readonly handling?: Partial<Handling>;
  readonly autoShift?: AutoShift;
}

/**
 * Online play (design §13.1, Online session), for both UIs and the bot tool: a session created
 * over `POST /api/sessions`, one connection to the gateway from then until `close()`, a store of
 * the connection, the room and the match, and the match's own game, played with the same input
 * engine as single-player.
 */
export interface OnlineSession extends Store<OnlineSessionState> {
  /** Creates a room of `mode` and enters it as its host. Sent once connected. */
  createRoom(mode: RoomMode): void;
  /** Joins the room with `code` (as typed). Sent once connected. */
  joinRoom(code: string): void;
  leaveRoom(): void;
  setReady(ready: boolean): void;
  /** The host's Start (design §10.1). */
  startMatch(): void;
  /** Steps out of your seat to watch, in the lobby (design §10.1). */
  spectate(): void;
  /** Takes a free seat, in the lobby. */
  takeSeat(): void;
  /** Changes your nickname, in the lobby (design §10.2). The room's `roomState` says the result. */
  setNickname(nickname: string): void;
  /** Asks for a 1v1 against the next player who asks (design §9.4). Sent once connected. */
  quickMatch(): void;
  /** Leaves the quick-match queue. */
  cancelQuickMatch(): void;
  /** In a quick-match room after results: the next match starts once both ask (design §9.4). */
  rematch(): void;
  /** The time on the session's clock: what the UI stamps key events (`key`, `act`) with. */
  now(): number;
  /** A key event from the UI's adapter, for your game in the current match. */
  key(event: KeyEvent): void;
  /** An action that arrived at `time`, for your game in the current match. */
  act(type: PieceActionType, time: number): void;
  setInput(settings: Partial<InputSettings>): void;
  /** Adds a listener for your own engine's events (design §13.1). Returns its removal. */
  onEvents(listener: SessionEventListener): () => void;
  /** Adds a listener for the actions your game applies. Returns its removal. */
  onActions(listener: AppliedActionsListener): () => void;
  /**
   * Adds a listener for the current match's garbage routings, whoever they're aimed at (the attack
   * streak, design §13.2). Returns its removal.
   */
  onRoutings(listener: RoutingListener): () => void;
  /** Leaves your room, then closes the connection, as the player leaves online play. */
  close(): void;
}

export function createOnlineSession(options: OnlineSessionOptions): OnlineSession {
  return new Session(options);
}

/** A message to the gateway, as it goes on the socket. */
type Outgoing = { [Event in ClientEvent]: { event: Event; data: ClientData<Event> } }[ClientEvent];

const INITIAL: OnlineSessionState = {
  connection: { status: 'connecting' },
  sessionId: null,
  sessionToken: null,
  nickname: null,
  names: new Map(),
  ping: null,
  room: null,
  match: null,
  quickMatch: 'idle',
  error: null,
};

class Session implements OnlineSession {
  readonly #options: OnlineSessionOptions;
  readonly #api: Api;
  readonly #store: StoreApi<OnlineSessionState>;
  #socket: OnlineSocket | null = null;
  /** When the connection dropped, on the session's clock. */
  #droppedAt = 0;
  /** Attempts to reconnect that failed after the lag-out window had passed. */
  #slowRetries = 0;
  #cancelRetry: () => void = () => {};
  readonly #sync = new ClockSync();
  readonly #input: InputEngine;
  /** When each ping still waiting for its pong was sent, by id. */
  readonly #pings = new Map<number, number>();
  #nextPing = 0;
  #pingsLeft = CONNECT_PINGS;
  #cancelPing: () => void = () => {};
  /** Messages waiting for the `welcome`. */
  #outbox: Outgoing[] = [];
  #match: OnlineMatch | null = null;
  /**
   * The room you just left. The server says nothing back to `leaveRoom`, so a `roomState` of it
   * already on its way is stale, until you ask to enter a room again.
   */
  #left: string | null = null;
  readonly #listeners = createNanoEvents<{
    events: SessionEventListener;
    actions: AppliedActionsListener;
    routings: RoutingListener;
  }>();

  constructor(options: OnlineSessionOptions) {
    this.#options = options;
    this.#api = createApi({
      serverUrl: options.serverUrl,
      ...(options.fetch && { fetch: options.fetch }),
    });
    this.#input = createInputEngine({
      handling: { ...DEFAULT_HANDLING, ...options.handling },
      ...(options.autoShift && { autoShift: options.autoShift }),
    });
    this.#store = createStore<OnlineSessionState>()(() => ({
      ...INITIAL,
      sessionToken: options.sessionToken ?? null,
    }));
    void this.#start();
  }

  getState: OnlineSession['getState'] = () => this.#store.getState();
  getInitialState: OnlineSession['getInitialState'] = () => this.#store.getInitialState();
  subscribe: OnlineSession['subscribe'] = (listener) => this.#store.subscribe(listener);

  createRoom = (mode: RoomMode): void => this.#enter({ event: 'createRoom', data: { mode } });
  joinRoom = (code: string): void => this.#enter({ event: 'joinRoom', data: { code } });
  setReady = (ready: boolean): void => this.#send({ event: 'ready', data: { ready } });
  startMatch = (): void => this.#send({ event: 'startMatch', data: {} });
  spectate = (): void => this.#send({ event: 'spectate', data: {} });
  takeSeat = (): void => this.#send({ event: 'takeSeat', data: {} });
  setNickname = (nickname: string): void =>
    this.#send({ event: 'setNickname', data: { nickname } });
  quickMatch = (): void => this.#enter({ event: 'quickMatch', data: {} });
  cancelQuickMatch = (): void => this.#send({ event: 'cancelQuickMatch', data: {} });
  rematch = (): void => this.#send({ event: 'rematch', data: {} });

  leaveRoom = (): void => {
    this.#left = this.getState().room?.code ?? null;
    this.#send({ event: 'leaveRoom', data: {} });
    this.#dropRoom();
  };

  now = (): number => this.#options.clock.now();
  key = (event: KeyEvent): void => this.#match?.key(event);
  act = (type: PieceActionType, time: number): void => this.#match?.act(type, time);
  setInput = (settings: Partial<InputSettings>): void => this.#input.configure(settings);

  // Each is wrapped, so adding the same function twice calls it twice and removing it removes one.
  onEvents = (listener: SessionEventListener): (() => void) =>
    this.#listeners.on('events', (events) => listener(events));
  onActions = (listener: AppliedActionsListener): (() => void) =>
    this.#listeners.on('actions', (actions) => listener(actions));
  onRoutings = (listener: RoutingListener): (() => void) =>
    this.#listeners.on('routings', (routing) => listener(routing));

  close = (): void => {
    const { connection, room } = this.getState();
    if (connection.status === 'closed') return;
    // Closing on purpose is leaving: no seat is held for a session that won't be back.
    if (room && connection.status === 'connected') this.#write({ event: 'leaveRoom', data: {} });
    this.#endMatch();
    this.#cancelPing();
    this.#cancelRetry();
    this.#set({ connection: { status: 'closed' } });
    this.#socket?.close();
  };

  /**
   * Creates the session, or resumes the one its token names (`POST /api/sessions`, design §10.2),
   * then opens the socket. Connecting, a refusal (`version_mismatch`, `nickname_invalid`) or a
   * server that can't be reached fails the connection. Reconnecting, only a refusal does: anything
   * else is tried again (`#retry`). Back as another session (the old one expired), the room and
   * match you were in are gone.
   */
  async #start(): Promise<void> {
    const { nickname } = this.#options;
    const { sessionToken, sessionId } = this.getState();
    const trying = () => {
      const { status } = this.getState().connection;
      return status === 'connecting' || status === 'reconnecting';
    };
    try {
      const session = await this.#api.createSession({
        nickname,
        ...(sessionToken !== null && { sessionToken }),
      });
      if (!trying()) return;
      if (sessionId !== null && session.sessionId !== sessionId) this.#dropRoom();
      this.#set({
        sessionId: session.sessionId,
        sessionToken: session.sessionToken,
        nickname: session.nickname,
        names: new Map(this.getState().names).set(session.sessionId, session.nickname),
      });
    } catch (error) {
      if (!trying()) return;
      const code = isOnlineError(error) ? error.code : 'unreachable';
      const message = isOnlineError(error) ? error.message : UNREACHABLE_TEXT;
      if (this.getState().connection.status === 'reconnecting' && !FINAL_FAILURES.has(code)) {
        this.#retry();
        return;
      }
      this.#endMatch();
      this.#fail(code, message);
      return;
    }
    this.#socket = this.#dial();
  }

  /**
   * The next attempt to reconnect (design §10.2): every 250 ms until 3 s after the drop, the lag-out
   * window, so a player whose network is back inside it plays on; then after 1 s, then every 2 s.
   */
  #retry(): void {
    const { clock } = this.#options;
    let delay = RECONNECT_QUICK_MS;
    if (clock.now() - this.#droppedAt + RECONNECT_QUICK_MS > LAG_OUT_MS) {
      const backoff = RECONNECT_BACKOFF_MS;
      delay = backoff[Math.min(this.#slowRetries, backoff.length - 1)] ?? 0;
      this.#slowRetries++;
    }
    this.#cancelRetry = clock.after(delay, () => {
      this.#cancelRetry = () => {};
      if (this.getState().connection.status === 'reconnecting') void this.#start();
    });
  }

  /** Opens a socket. What it hears counts only while it's the session's current one. */
  #dial(): OnlineSocket {
    const current = () => this.#socket === socket;
    const socket = this.#options.connect(socketUrl(this.#options.serverUrl), {
      open: () => {
        if (current()) this.#open();
      },
      message: (text) => {
        if (current()) this.#message(text);
      },
      close: () => {
        if (current()) this.#closed();
      },
    });
    return socket;
  }

  #open(): void {
    const { clientVersion, kind } = this.#options;
    const { sessionToken } = this.getState();
    this.#write({
      event: 'hello',
      data: {
        protocolVersion: PROTOCOL_VERSION,
        engineVersion: ENGINE_VERSION,
        clientVersion,
        sessionToken: sessionToken ?? '',
        ...(kind && { kind }),
      },
    });
  }

  /**
   * The socket closed, or never opened. A first connection that never got its `welcome` has failed:
   * the server can't be reached, or it refused the `hello` and already said why. One that dropped
   * is resumed at once, then retried (`#retry`), while a match plays on locally and keeps its
   * batches (design §10.2).
   */
  #closed(): void {
    const { status } = this.getState().connection;
    this.#cancelPing();
    this.#socket = null;
    if (status === 'connecting') {
      this.#endMatch();
      this.#fail('unreachable', UNREACHABLE_TEXT);
    } else if (status === 'connected') {
      this.#set({ connection: { status: 'reconnecting' } });
      this.#droppedAt = this.#options.clock.now();
      this.#slowRetries = 0;
      void this.#start();
    } else if (status === 'reconnecting') {
      this.#retry();
    }
  }

  #message(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    const message = serverMessageSchema.safeParse(parsed);
    // A message this version doesn't know is one a newer server may send: it's ignored.
    if (message.success) this.#receive(message.data);
  }

  #receive(message: ServerMessage): void {
    switch (message.event) {
      case 'welcome':
        this.#welcome(message.data);
        return;
      case 'exception':
        this.#exception(message.data);
        return;
      case 'pong':
        this.#pong(message.data);
        return;
      case 'roomState': {
        const { quickMatch = false, ...room } = message.data;
        if (room.code === this.#left) return;
        this.#left = null;
        this.#roomState({ ...room, quickMatch });
        return;
      }
      case 'quickMatchQueued':
        this.#set({ quickMatch: 'queued' });
        return;
      case 'quickMatchCancelled':
        this.#set({ quickMatch: 'idle' });
        return;
      case 'opponentLeft':
        // The pod already took you out. The last match stays, for its results, until the next.
        this.#set({ room: null, quickMatch: 'opponentLeft' });
        return;
      case 'countdown':
        this.#countdown(message.data);
        return;
      case 'batchAck':
        this.#match?.acknowledge(message.data.seq);
        return;
      case 'relay':
        this.#match?.relay(message.data);
        return;
      case 'garbageQueued': {
        // An attack sent again after a reconnect, already in your game, is no new routing.
        if (!this.#match?.receiveGarbage(message.data)) return;
        const { id, from, to, lines, holeSeed } = message.data;
        this.#listeners.emit('routings', { id, from, to, lines, holeSeed });
        return;
      }
      case 'playerOut':
        this.#match?.playerOut(message.data);
        return;
      case 'matchEnd':
        this.#match?.end(message.data);
        return;
      case 'snapshot':
        this.#match?.restore(message.data);
        return;
      default:
        return;
    }
  }

  /**
   * The `welcome`, first or after a reconnect: connected. The match's batches not yet
   * acknowledged go again first, in order (design §10.2), then the pings start, and the messages
   * waiting go, in order.
   */
  #welcome({ sessionId }: ServerData<'welcome'>): void {
    this.#set({ connection: { status: 'connected' }, sessionId });
    for (const batch of this.#match?.unacknowledged ?? []) {
      this.#write({ event: 'inputBatch', data: batch as ClientData<'inputBatch'> });
    }
    this.#pingsLeft = CONNECT_PINGS;
    this.#pings.clear();
    this.#ping();
    const outbox = this.#outbox;
    this.#outbox = [];
    for (const waiting of outbox) this.#write(waiting);
  }

  /**
   * An `exception`. Before the first `welcome` it's why the connection failed (a version mismatch,
   * an expired session); before a reconnect's, only a new version fails it, and anything else is
   * tried again once the server closes the socket. After, it's for the UI to show.
   */
  #exception({ code, message }: ServerData<'exception'>): void {
    const { status } = this.getState().connection;
    if (status === 'connecting' || (status === 'reconnecting' && FINAL_FAILURES.has(code))) {
      this.#endMatch();
      this.#fail(code, message);
      return;
    }
    if (status === 'reconnecting') return;
    // The room went away under you: its server did, or it was gone when you came back.
    if (code === 'room_not_found' && this.getState().room) this.#dropRoom();
    this.#set({ error: { code, message } });
  }

  #fail(reason: ConnectionFailure, message: string): void {
    this.#set({ connection: { status: 'failed', reason, message } });
  }

  /** Sends a ping: one after another as it connects, then one every 2 s (design §8.4). */
  #ping = (): void => {
    const id = this.#nextPing++;
    this.#pings.set(id, this.#options.clock.now());
    this.#write({ event: 'ping', data: { id } });
    if (this.#pingsLeft <= 1) {
      this.#cancelPing = this.#options.clock.after(PING_EVERY_MS, this.#ping);
    }
  };

  #pong({ id, serverTime }: ServerData<'pong'>): void {
    const sentAt = this.#pings.get(id);
    if (sentAt === undefined) return;
    this.#pings.delete(id);
    this.#sync.add({ sentAt, receivedAt: this.#options.clock.now(), serverTime });
    this.#set({ ping: this.#sync.ping });
    if (this.#pingsLeft > 1) {
      this.#pingsLeft--;
      this.#ping();
    } else {
      this.#pingsLeft = 0;
    }
  }

  /**
   * A match starts: its loop from `startAt − offset` on this session's clock (design §8.4). The
   * room sends the countdown again to whoever (re)joins mid-match, and the match you're in goes on.
   */
  #countdown(countdown: ServerData<'countdown'>): void {
    const { room, sessionId } = this.getState();
    if (!room || !sessionId) return;
    if (this.#match?.matchId === countdown.matchId) return;
    this.#endMatch();
    const { clock } = this.#options;
    this.#match = new OnlineMatch({
      clock,
      mode: room.mode,
      countdown,
      playerId: sessionId,
      start: countdown.startAt - (this.#sync.offset ?? 0),
      input: this.#input,
      send: (batch) => {
        if (this.getState().connection.status === 'connected') {
          this.#write({ event: 'inputBatch', data: batch as ClientData<'inputBatch'> });
        }
      },
      changed: () => this.#set({ match: this.#match?.snapshot() ?? null }),
      heard: (events, actions) => {
        if (events.length > 0) this.#listeners.emit('events', events);
        if (actions.length > 0) this.#listeners.emit('actions', actions);
      },
    });
    this.#set({ match: this.#match.snapshot() });
  }

  #endMatch(): void {
    this.#match?.stop();
    this.#match = null;
  }

  /** You're out of your room, and its match is over for you. */
  #dropRoom(): void {
    this.#endMatch();
    this.#set({ room: null, match: null });
  }

  /**
   * A `roomState` of your room: the room, every name in it (merged, so a leaver keeps theirs), and
   * your own nickname as the room has it (with its `#2`, design §11).
   */
  #roomState(room: OnlineRoom): void {
    const { sessionId, nickname, names } = this.getState();
    const members = [...room.players, ...room.spectators];
    const merged = new Map(names);
    for (const member of members) merged.set(member.id, member.nickname);
    const yours = members.find(({ id }) => id === sessionId)?.nickname ?? nickname;
    this.#set({ room, names: merged, nickname: yours, quickMatch: 'idle' });
  }

  /** Asks to enter a room: a `roomState` of the one you last left counts again. */
  #enter(message: Outgoing): void {
    this.#left = null;
    this.#send(message);
  }

  /** Sends now if welcomed, or once welcomed. */
  #send(message: Outgoing): void {
    if (this.getState().connection.status === 'connected') this.#write(message);
    else this.#outbox.push(message);
  }

  #write(message: Outgoing): void {
    this.#socket?.send(JSON.stringify(message));
  }

  #set(change: Partial<OnlineSessionState>): void {
    this.#store.setState(change);
  }
}
