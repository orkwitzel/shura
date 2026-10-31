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

/** Why a connection failed: the server's `error` code, or that it closed or never opened. */
export type ConnectionFailure = ErrorCode | 'unreachable' | 'lost';

/**
 * The connection (design §13.1): opening, connected (the `hello` was welcomed), failed (with why),
 * or closed by the player. #64 adds reconnecting.
 */
export type OnlineConnection =
  | { readonly status: 'connecting' }
  | { readonly status: 'connected' }
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
  /** Closes the connection, as the player leaves online play. */
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

/**
 * Seams for later tickets:
 * - #64: reconnecting with backoff on `lost`, `hello` with the session token, resending
 *   `match.unacknowledged`, and `snapshot`;
 * - #62: `garbageQueued` reaches `OnlineMatch.receiveGarbage`.
 */
class Session implements OnlineSession {
  readonly #options: OnlineSessionOptions;
  readonly #store: StoreApi<OnlineSessionState>;
  readonly #socket: OnlineSocket;
  readonly #sync = new ClockSync();
  readonly #input: InputEngine;
  /** When each ping still waiting for its pong was sent, by id. */
  readonly #pings = new Map<number, number>();
  #nextPing = 0;
  #pingsLeft = CONNECT_PINGS;
  #cancelPing: () => void = () => {};
  /** Messages waiting for the `welcome`. */
  #outbox: ClientMessage[] = [];
  #sessionToken: string | null = null;
  #match: OnlineMatch | null = null;
  readonly #eventListeners = new Set<SessionEventListener>();
  readonly #actionListeners = new Set<AppliedActionsListener>();

  constructor(options: OnlineSessionOptions) {
    this.#options = options;
    this.#input = createInputEngine({
      handling: { ...DEFAULT_HANDLING, ...options.handling },
      ...(options.autoShift && { autoShift: options.autoShift }),
    });
    this.#store = createStore<OnlineSessionState>()(() => INITIAL);
    this.#socket = options.connect(options.url, {
      open: this.#open,
      message: this.#message,
      close: this.#closed,
    });
  }

  getState: OnlineSession['getState'] = () => this.#store.getState();
  getInitialState: OnlineSession['getInitialState'] = () => this.#store.getInitialState();
  subscribe: OnlineSession['subscribe'] = (listener) => this.#store.subscribe(listener);

  /** The session token the server issued, which #64 reconnects with. */
  get sessionToken(): string | null {
    return this.#sessionToken;
  }

  createRoom = (mode: RoomMode): void => this.#send({ type: 'createRoom', mode });
  joinRoom = (code: string): void => this.#send({ type: 'joinRoom', code });
  setReady = (ready: boolean): void => this.#send({ type: 'ready', ready });
  startMatch = (): void => this.#send({ type: 'startMatch' });
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
    if (this.getState().connection.status === 'closed') return;
    this.#endMatch();
    this.#cancelPing();
    this.#set({ connection: { status: 'closed' } });
    this.#socket.close();
  };

  #open = (): void => {
    const { nickname, clientVersion, kind } = this.#options;
    this.#write({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      engineVersion: ENGINE_VERSION,
      clientVersion,
      nickname,
      ...(kind && { kind }),
    });
  };

  #closed = (): void => {
    const { connection } = this.getState();
    this.#cancelPing();
    this.#endMatch();
    if (connection.status === 'connecting') {
      this.#fail('unreachable', "Can't reach the server.");
    } else if (connection.status === 'connected') {
      this.#fail('lost', 'The connection to the server was lost.');
    }
  };

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
      default:
        // snapshot (#64).
        return;
    }
  }

  #welcome(message: ServerMessageOf<'welcome'>): void {
    this.#sessionToken = message.sessionToken;
    this.#set({
      connection: { status: 'connected' },
      sessionId: message.sessionId,
      nickname: message.nickname,
    });
    this.#ping();
    const outbox = this.#outbox;
    this.#outbox = [];
    for (const waiting of outbox) this.#write(waiting);
  }

  /**
   * An `error`. Before the `welcome`, the server closes the connection after it, so it's why the
   * connection failed (a version mismatch, an invalid nickname); after, it's for the UI to show.
   */
  #error({ code, message }: ServerMessageOf<'error'>): void {
    if (this.getState().connection.status === 'connecting') {
      this.#fail(code, message);
      return;
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

  /** A match starts: its loop from `startAt − offset` on this session's clock (design §8.4). */
  #countdown(countdown: ServerMessageOf<'countdown'>): void {
    const { room, sessionId } = this.getState();
    if (!room || !sessionId) return;
    this.#endMatch();
    const { clock } = this.#options;
    this.#match = new OnlineMatch({
      clock,
      mode: room.mode,
      countdown,
      playerId: sessionId,
      start: countdown.startAt - (this.#sync.offset ?? 0),
      input: this.#input,
      send: (batch) => this.#write(batch),
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
