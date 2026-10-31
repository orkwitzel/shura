import { ENGINE_VERSION, type PieceActionType } from '@shura/engine';
import {
  type ClientMessage,
  type ErrorCode,
  type PlayerKind,
  PROTOCOL_VERSION,
  type RoomMode,
  type ServerMessage,
  type ServerMessageOf,
  serverMessageSchema,
} from '@shura/protocol';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { TimerClock } from './clock';
import { ClockSync } from './clock-sync';
import { errorText } from './error-text';
import { DEFAULT_HANDLING, type Handling } from './handling';
import {
  type AutoShift,
  createInputEngine,
  type InputEngine,
  type InputSettings,
  type KeyEvent,
} from './input-engine';
import { OnlineMatch, type OnlineMatchState } from './online-match';
import type { Connect, OnlineSocket } from './online-socket';
import type { AppliedActionsListener, SessionEventListener } from './solo-session';
import type { Store } from './store';

/** Pings taken one after another as the session connects (design §8.4). */
const CONNECT_PINGS = 5;

/** How often the session pings once connected, in the lobby and during matches (design §8.4). */
export const PING_EVERY_MS = 2000;

/**
 * The waits between attempts to reconnect after the connection drops (design §10.2): the first
 * attempt is at once, then 250 ms, 500 ms and 1 s, then every 2 s (the last, repeated).
 */
export const RECONNECT_DELAYS_MS: readonly number[] = [250, 500, 1000, 2000];

/** Why a connection failed: the server's `error` code, or that it never opened. */
export type ConnectionFailure = ErrorCode | 'unreachable';

/**
 * The connection (design §13.1): opening, connected (the `hello` was welcomed), reconnecting after
 * it dropped (design §10.2: a match plays on locally meanwhile), failed (with why), or closed by
 * the player.
 */
export type OnlineConnection =
  | { readonly status: 'connecting' }
  | { readonly status: 'connected' }
  | { readonly status: 'reconnecting' }
  | { readonly status: 'failed'; readonly reason: ConnectionFailure; readonly message: string }
  | { readonly status: 'closed' };

/**
 * Where quick-match is (design §9.4): not asked for, waiting in the queue for a partner, or back
 * at the waiting screen because the quick-match opponent left. Once paired you're in the room,
 * which has no host.
 */
export type QuickMatchStatus = 'idle' | 'queued' | 'opponentLeft';

/** A room as the server last described it (`roomState`). */
export type OnlineRoom = Pick<
  ServerMessageOf<'roomState'>,
  'code' | 'mode' | 'hostId' | 'phase' | 'players' | 'spectators'
>;

export interface OnlineSessionState {
  readonly connection: OnlineConnection;
  /** Your session id, once welcomed. */
  readonly sessionId: string | null;
  /** Your nickname as the server normalized it, once welcomed. */
  readonly nickname: string | null;
  /** The latest ping's round trip, in ms (design §8.4). */
  readonly ping: number | null;
  /** The room you're in. */
  readonly room: OnlineRoom | null;
  /** The current match, or the last one until the next starts or you leave the room. */
  readonly match: OnlineMatchState | null;
  /** Quick-match, outside a room. */
  readonly quickMatch: QuickMatchStatus;
  /** The latest `error` the server sent that didn't end the connection. */
  readonly error: { readonly code: ErrorCode; readonly message: string } | null;
}

export interface OnlineSessionOptions {
  /** The gateway's WebSocket URL. */
  readonly url: string;
  readonly connect: Connect;
  readonly clock: TimerClock;
  /** As the player set it; the server normalizes it and has the last word (design §10.2). */
  readonly nickname: string;
  /** The app's own version, for the server's logs. */
  readonly clientVersion: string;
  /** `bot` from the bot tool (design §13.4). */
  readonly kind?: PlayerKind;
  /**
   * A session token from an earlier session, to come back as it (design §10.2): the web keeps it
   * in `sessionStorage` across a reload.
   */
  readonly sessionToken?: string;
  readonly handling?: Partial<Handling>;
  readonly autoShift?: AutoShift;
}

/**
 * Online play (design §13.1, Online session), for both UIs and the bot tool: one connection to the
 * gateway from creation until `close()`, a store of the connection, the room and the match, and
 * the match's own game, played with the same input engine as single-player.
 */
export interface OnlineSession extends Store<OnlineSessionState> {
  /** Creates a room of `mode` and enters it as its host. Sent once connected. */
  createRoom(mode: RoomMode): void;
  /** Joins the room with `code` (as typed). Sent once connected. */
  joinRoom(code: string): void;
  leaveRoom(): void;
  /**
   * Leaves the match you're playing but not the room (the online menu's *Leave match*): you're out
   * with `left`, and watch the rest (design §10.1).
   */
  leaveMatch(): void;
  setReady(ready: boolean): void;
  /** Steps out of your seat to watch, in the lobby (design §10.1). */
  spectate(): void;
  /** Takes a free seat, in the lobby. */
  takeSeat(): void;
  /** Changes your nickname, in the lobby (design §10.2). */
  setNickname(nickname: string): void;
  /** The host's Start (design §10.1). */
  startMatch(): void;
  /** Asks for a 1v1 against the next player who asks (design §9.4). Sent once connected. */
  quickMatch(): void;
  /** Leaves the quick-match queue. */
  cancelQuickMatch(): void;
  /** In a quick-match room after results: the next match starts once both ask (design §9.4). */
  rematch(): void;
  /** A key event from the UI's adapter, for your game in the current match. */
  key(event: KeyEvent): void;
  /** An action that arrived at `time`, for your game in the current match. */
  act(type: PieceActionType, time: number): void;
  setInput(settings: Partial<InputSettings>): void;
  /** Adds a listener for your own engine's events (design §13.1). Returns its removal. */
  onEvents(listener: SessionEventListener): () => void;
  /** Adds a listener for the actions your game applies. Returns its removal. */
  onActions(listener: AppliedActionsListener): () => void;
  /** Leaves your room, then closes the connection, as the player leaves online play. */
  close(): void;
}

export function createOnlineSession(options: OnlineSessionOptions): OnlineSession {
  return new Session(options);
}

const INITIAL: OnlineSessionState = {
  connection: { status: 'connecting' },
  sessionId: null,
  nickname: null,
  ping: null,
  room: null,
  match: null,
  quickMatch: 'idle',
  error: null,
};

class Session implements OnlineSession {
  readonly #options: OnlineSessionOptions;
  readonly #store: StoreApi<OnlineSessionState>;
  #socket: OnlineSocket;
  /** Attempts to reconnect that failed since the connection dropped. */
  #reconnects = 0;
  #cancelReconnect: () => void = () => {};
  readonly #sync = new ClockSync();
  readonly #input: InputEngine;
  /** When each ping still waiting for its pong was sent, by id. */
  readonly #pings = new Map<number, number>();
  #nextPing = 0;
  #pingsLeft = CONNECT_PINGS;
  #cancelPing: () => void = () => {};
  /** Messages waiting for the `welcome`. */
  #outbox: ClientMessage[] = [];
  #sessionToken: string | null;
  #match: OnlineMatch | null = null;
  readonly #eventListeners = new Set<SessionEventListener>();
  readonly #actionListeners = new Set<AppliedActionsListener>();

  constructor(options: OnlineSessionOptions) {
    this.#options = options;
    this.#input = createInputEngine({
      handling: { ...DEFAULT_HANDLING, ...options.handling },
      ...(options.autoShift && { autoShift: options.autoShift }),
    });
    this.#sessionToken = options.sessionToken ?? null;
    this.#store = createStore<OnlineSessionState>()(() => INITIAL);
    this.#socket = this.#dial();
  }

  getState: OnlineSession['getState'] = () => this.#store.getState();
  getInitialState: OnlineSession['getInitialState'] = () => this.#store.getInitialState();
  subscribe: OnlineSession['subscribe'] = (listener) => this.#store.subscribe(listener);

  /** The session token the server issued, which the session reconnects with. */
  get sessionToken(): string | null {
    return this.#sessionToken;
  }

  createRoom = (mode: RoomMode): void => this.#send({ type: 'createRoom', mode });
  joinRoom = (code: string): void => this.#send({ type: 'joinRoom', code });
  setReady = (ready: boolean): void => this.#send({ type: 'ready', ready });
  startMatch = (): void => this.#send({ type: 'startMatch' });
  spectate = (): void => this.#send({ type: 'spectate' });
  takeSeat = (): void => this.#send({ type: 'takeSeat' });
  setNickname = (nickname: string): void => this.#send({ type: 'setNickname', nickname });
  quickMatch = (): void => this.#send({ type: 'quickMatch' });
  cancelQuickMatch = (): void => this.#send({ type: 'cancelQuickMatch' });
  rematch = (): void => this.#send({ type: 'rematch' });

  leaveRoom = (): void => {
    this.#send({ type: 'leaveRoom' });
    this.#endMatch();
    this.#set({ room: null, match: null });
  };

  leaveMatch = (): void => this.#send({ type: 'leaveMatch' });

  key = (event: KeyEvent): void => this.#match?.key(event);
  act = (type: PieceActionType, time: number): void => this.#match?.act(type, time);
  setInput = (settings: Partial<InputSettings>): void => this.#input.configure(settings);

  onEvents = (listener: SessionEventListener): (() => void) => {
    const call: SessionEventListener = (events) => listener(events);
    this.#eventListeners.add(call);
    return () => {
      this.#eventListeners.delete(call);
    };
  };

  onActions = (listener: AppliedActionsListener): (() => void) => {
    const call: AppliedActionsListener = (actions) => listener(actions);
    this.#actionListeners.add(call);
    return () => {
      this.#actionListeners.delete(call);
    };
  };

  close = (): void => {
    const { connection, room } = this.getState();
    if (connection.status === 'closed') return;
    // Closing on purpose is leaving: no seat is held for a session that won't be back.
    if (room && connection.status === 'connected') this.#write({ type: 'leaveRoom' });
    this.#endMatch();
    this.#cancelPing();
    this.#cancelReconnect();
    this.#set({ connection: { status: 'closed' } });
    this.#socket.close();
  };

  /** Opens a socket. What it hears counts only while it's the session's current one. */
  #dial(): OnlineSocket {
    const current = () => this.#socket === socket;
    const socket = this.#options.connect(this.#options.url, {
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
    const { nickname, clientVersion, kind } = this.#options;
    this.#write({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      engineVersion: ENGINE_VERSION,
      clientVersion,
      nickname,
      ...(this.#sessionToken !== null && { sessionToken: this.#sessionToken }),
      ...(kind && { kind }),
    });
  }

  /**
   * The socket closed, or never opened. A first connection that never opened has failed. One that
   * dropped is reconnected at once, then with backoff, while a match plays on locally (design
   * §10.2).
   */
  #closed(): void {
    const { status } = this.getState().connection;
    this.#cancelPing();
    if (status === 'connecting') {
      this.#endMatch();
      this.#fail('unreachable', "Can't reach the server.");
    } else if (status === 'connected') {
      this.#set({ connection: { status: 'reconnecting' } });
      this.#reconnects = 0;
      this.#socket = this.#dial();
    } else if (status === 'reconnecting') {
      const delays = RECONNECT_DELAYS_MS;
      const delay = delays[Math.min(this.#reconnects, delays.length - 1)] ?? 0;
      this.#reconnects++;
      this.#cancelReconnect = this.#options.clock.after(delay, () => {
        this.#cancelReconnect = () => {};
        if (this.getState().connection.status === 'reconnecting') this.#socket = this.#dial();
      });
    }
  }

  #message = (text: string): void => {
    let parsed: ReturnType<typeof serverMessageSchema.safeParse>;
    try {
      parsed = serverMessageSchema.safeParse(JSON.parse(text));
    } catch {
      return;
    }
    // A message this version doesn't know is one a newer server may send: it's ignored.
    if (parsed.success) this.#receive(parsed.data);
  };

  #receive(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.#welcome(message);
        return;
      case 'error':
        this.#error(message);
        return;
      case 'pong':
        this.#pong(message);
        return;
      case 'roomState': {
        const { type: _, ...room } = message;
        this.#set({ room, quickMatch: 'idle' });
        return;
      }
      case 'quickMatchQueued':
        this.#set({ quickMatch: 'queued' });
        return;
      case 'quickMatchCancelled':
        this.#set({ quickMatch: 'idle' });
        return;
      case 'opponentLeft':
        // The last match stays, for its results, until the next one starts.
        this.#set({ room: null, quickMatch: 'opponentLeft' });
        return;
      case 'countdown':
        this.#countdown(message);
        return;
      case 'batchAck':
        this.#match?.acknowledge(message.seq);
        return;
      case 'relay':
        this.#match?.relay(message);
        return;
      case 'garbageQueued':
        this.#match?.receiveGarbage(message);
        return;
      case 'playerOut':
        this.#match?.playerOut(message);
        return;
      case 'matchEnd':
        this.#match?.end(message);
        return;
      case 'snapshot':
        this.#match?.restore(message);
        return;
    }
  }

  /**
   * The `welcome`, first or after a reconnect. Back as the same session, the unacknowledged
   * batches go again, in order, before anything else (design §10.2). A different session means the
   * old one had expired, and its room and match with it.
   */
  #welcome(message: ServerMessageOf<'welcome'>): void {
    const { sessionId } = this.getState();
    this.#sessionToken = message.sessionToken;
    if (sessionId !== null && sessionId !== message.sessionId) {
      this.#endMatch();
      this.#set({ room: null, match: null });
    }
    this.#set({
      connection: { status: 'connected' },
      sessionId: message.sessionId,
      nickname: message.nickname,
    });
    this.#pingsLeft = CONNECT_PINGS;
    this.#pings.clear();
    this.#ping();
    for (const batch of this.#match?.unacknowledged ?? []) this.#write(batch);
    const outbox = this.#outbox;
    this.#outbox = [];
    for (const waiting of outbox) this.#write(waiting);
  }

  /**
   * An `error`. Before the `welcome`, the server closes the connection after it, so it's why the
   * connection failed (a version mismatch, an invalid nickname); after, it's for the UI to show.
   */
  #error({ code, message: serverMessage }: ServerMessageOf<'error'>): void {
    const message = errorText(code, serverMessage);
    const { status } = this.getState().connection;
    if (status === 'connecting' || status === 'reconnecting') {
      this.#endMatch();
      this.#fail(code, message);
      return;
    }
    // The room went away under you: its server did, or it was gone when you came back.
    if (code === 'room_not_found' && this.getState().room) {
      this.#endMatch();
      this.#set({ room: null, match: null });
    }
    this.#set({ error: { code, message } });
  }

  #fail(reason: ConnectionFailure, message: string): void {
    this.#set({ connection: { status: 'failed', reason, message } });
  }

  /** Sends a ping: one after another as it connects, then one every 2 s (design §8.4). */
  #ping = (): void => {
    const id = this.#nextPing++;
    this.#pings.set(id, this.#options.clock.now());
    this.#write({ type: 'ping', id });
    if (this.#pingsLeft <= 1) {
      this.#cancelPing = this.#options.clock.after(PING_EVERY_MS, this.#ping);
    }
  };

  #pong({ id, serverTime }: ServerMessageOf<'pong'>): void {
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
  #countdown(countdown: ServerMessageOf<'countdown'>): void {
    const { room, sessionId, match } = this.getState();
    if (!room || !sessionId) return;
    if (this.#match && match?.matchId === countdown.matchId) return;
    this.#endMatch();
    const { clock } = this.#options;
    this.#match = new OnlineMatch({
      clock,
      mode: room.mode,
      countdown,
      playerId: sessionId,
      start: countdown.startAt - (this.#sync.offset ?? 0),
      input: this.#input,
      // While reconnecting, batches wait in `unacknowledged`, and go once welcomed again.
      send: (batch) => {
        if (this.getState().connection.status === 'connected') this.#write(batch);
      },
      changed: () => this.#set({ match: this.#match?.snapshot() ?? null }),
      heard: (events, actions) => {
        if (events.length > 0) for (const listener of this.#eventListeners) listener(events);
        if (actions.length > 0) for (const listener of this.#actionListeners) listener(actions);
      },
    });
    this.#set({ match: this.#match.snapshot() });
  }

  #endMatch(): void {
    this.#match?.stop();
    this.#match = null;
  }

  /** Sends now if welcomed, or once welcomed. */
  #send(message: ClientMessage): void {
    if (this.getState().connection.status === 'connected') this.#write(message);
    else this.#outbox.push(message);
  }

  #write(message: ClientMessage): void {
    this.#socket.send(JSON.stringify(message));
  }

  #set(change: Partial<OnlineSessionState>): void {
    this.#store.setState(change);
  }
}
