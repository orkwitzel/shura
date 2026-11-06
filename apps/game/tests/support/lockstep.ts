import {
  type Action,
  ActionType,
  createEngine,
  type Engine,
  type GarbageReceivedAction,
  type PieceAction,
} from '@shura/engine';
import type {
  ClientData,
  FrameActions,
  RoomMode,
  ServerData,
  ServerEvent,
  ServerMessage,
  ServerMessageOf,
} from '@shura/protocol';
import { createMemoryStores, type MatchLog } from '@shura/valkey';
import { pino } from 'pino';
import { MATCH_SETTINGS, Match } from '../../src/match/match';
import { fakeClock } from './fake-clock';
import { RECORDED_PIECE_ACTIONS, RECORDED_SEED } from './recorded-1v1';
import { STARTED, settle, timeOf } from './test-match';

/** One player of a lockstep match, and how their client behaves. */
export interface SimPlayer {
  readonly id: string;
  /** The player's own actions, each played at its frame. */
  readonly actions: readonly PieceAction[];
  /**
   * The `garbageReceived` the client records for an attack aimed at it: the attack as sent by
   * default, a changed one to tamper with it, or `null` to never receive it.
   */
  readonly receive?: (attack: GarbageReceivedAction) => GarbageReceivedAction | null;
}

export interface LockstepOptions {
  readonly mode?: RoomMode;
  readonly seed?: number;
  readonly players: readonly SimPlayer[];
  /** The match log. A fresh in-memory one by default. */
  readonly log?: MatchLog;
  /** Appends to the match log every this many frames: 6 (100 ms) by default. */
  readonly appendEvery?: number;
}

/** A message the match sent, and to whom: a player, everyone but a player, or the room. */
export interface Sent {
  readonly to: { player: string } | { allBut: string } | 'room';
  readonly message: ServerMessage;
}

/** A player's client, as the online session plays it: its own engine, accepting garbage. */
class SimClient {
  readonly player: SimPlayer;
  readonly engine: Engine;
  /** Its action log, as sent. */
  readonly log: Action[] = [];
  /** `garbageReceived` actions for its next frame. */
  inbox: GarbageReceivedAction[] = [];
  #seq = 0;
  readonly #actions = new Map<number, PieceAction[]>();

  constructor(player: SimPlayer, mode: RoomMode, seed: number, index: number) {
    this.player = player;
    this.engine = createEngine(MATCH_SETTINGS[mode], seed, index);
    for (const action of player.actions) {
      this.#actions.set(action.frame, [...(this.#actions.get(action.frame) ?? []), action]);
    }
  }

  get over(): boolean {
    return this.engine.state.toppedOut || this.engine.state.finished;
  }

  /** `garbageQueued` for this client. */
  garbageQueued({ id, lines, holeSeed }: ServerData<'garbageQueued'>): void {
    const attack: GarbageReceivedAction = {
      frame: 0,
      type: ActionType.GarbageReceived,
      id,
      lines,
      holeSeed,
    };
    const received = this.player.receive ? this.player.receive(attack) : attack;
    if (received) this.inbox.push(received);
  }

  /** Plays `frame` and returns its one-frame input batch. */
  play(frame: number): Pick<ClientData<'inputBatch'>, 'seq' | 'frames'> {
    const received = this.inbox.map((attack) => ({ ...attack, frame }));
    this.inbox = [];
    const moves = this.#actions.get(frame) ?? [];
    const { accepted } = this.engine.step(frame, [...received, ...moves], { acceptGarbage: true });
    const actions: Action[] = [...received, ...moves, ...accepted];
    this.log.push(...actions);
    return { seq: this.#seq++, frames: [{ frame, actions } as FrameActions] };
  }
}

/**
 * A server `Match` whose players' clients play in lockstep, one frame at a time, player by player
 * in index order, each sending a one-frame batch the moment its frame is the expected one. The
 * garbage the server queues while a frame is played reaches its target's client at the next
 * frame, as the engine's test harness delivers it, so the recorded 1v1 plays out exactly as
 * recorded.
 */
export function lockstepMatch({
  mode = '1v1',
  seed = RECORDED_SEED,
  players,
  log = createMemoryStores().matchLog,
  appendEvery = 6,
}: LockstepOptions) {
  const sent: Sent[] = [];
  /** Each attack, and its target's verified frame when it was sent. */
  const routed: { attack: ServerData<'garbageQueued'>; targetFrame: number }[] = [];
  const clients = players.map((player, index) => new SimClient(player, mode, seed, index));
  const declaredOut = new Set<string>();
  let frame = 0;
  // The server's clock, moved to each frame's time as it's played (for clock enforcement).
  const clock = fakeClock(STARTED);
  const match: Match = new Match({
    matchId: 'match-1',
    mode,
    seed,
    players: players.map(({ id }) => id),
    epoch: 1,
    log,
    logger: pino({ level: 'silent' }),
    output: {
      toPlayer: (player, message) => sent.push({ to: { player }, message }),
      toOthers: (allBut, message) => sent.push({ to: { allBut }, message }),
      toRoom: (message) => {
        sent.push({ to: 'room', message });
        if (message.event === 'playerOut') declaredOut.add(message.data.playerId);
        if (message.event === 'garbageQueued') {
          const { to } = message.data;
          const target = match.verifiedGames().find(({ playerId }) => playerId === to);
          routed.push({ attack: message.data, targetFrame: target?.frame ?? -1 });
        }
      },
      ended: () => {},
    },
  });

  /** The data of every message of `event` the match sent, to anyone. */
  const messages = <Event extends ServerEvent>(event: Event): ServerData<Event>[] =>
    sent.flatMap(({ message }) =>
      message.event === event
        ? [(message as ServerMessageOf<Event>).data as ServerData<Event>]
        : [],
    );

  return {
    match,
    clock,
    sent,
    routed,
    clients,
    messages,
    /** The `seq` of every `batchAck` sent to `playerId`, in order. */
    acks: (playerId: string) =>
      sent.flatMap(({ to, message }) =>
        typeof to === 'object' &&
        'player' in to &&
        to.player === playerId &&
        message.event === 'batchAck'
          ? [message.data.seq]
          : [],
      ),
    /** The frame played last. */
    get frame() {
      return frame;
    },
    /**
     * Plays every frame up to `last`: each client still playing, and not declared out, plays it
     * and sends its batch. The room ticks every 3 frames and the log appends every `appendEvery`.
     */
    async play(last: number): Promise<void> {
      while (frame < last && !match.ended) {
        frame++;
        clock.advanceTo(timeOf(frame));
        const from = routed.length;
        for (const client of clients) {
          if (client.over || declaredOut.has(client.player.id)) continue;
          match.receive(client.player.id, client.play(frame));
        }
        for (const { attack } of routed.slice(from)) {
          clients.find(({ player }) => player.id === attack.to)?.garbageQueued(attack);
        }
        if (frame % 3 === 0) match.tick();
        if (frame % appendEvery === 0) {
          match.appendLog();
          await settle();
        }
      }
      match.appendLog();
      await settle();
    },
  };
}

/** The recorded 1v1's two players, whose clients receive every attack as sent. */
export function recordedPlayers(): SimPlayer[] {
  return RECORDED_PIECE_ACTIONS.map((actions, index) => ({ id: `p${index}`, actions }));
}
