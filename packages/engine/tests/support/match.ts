import {
  type Action,
  ActionType,
  createEngine,
  type Engine,
  type GarbageAcceptedAction,
  type GarbageReceivedAction,
  type HoleSeedsState,
  holeSeeds,
  type ModeSettings,
  restoreEngine,
} from '../../src/index';

/** What each player's game took and recorded in a frame, by player. */
export interface FramePlayed {
  /** The `garbageReceived` actions the harness gave each player at the frame. */
  received: GarbageReceivedAction[][];
  /** Accepting garbage, the `garbageAccepted` actions each player's engine recorded. */
  accepted: GarbageAcceptedAction[][];
}

/**
 * A match played in lockstep, one engine per player, with the test harness in the server's part
 * (design §8.5): the garbage each player sends, which their engine has already cancelled against
 * their own garbage meter, reaches the opponent as a `garbageReceived` action at the next frame,
 * as the opponent's client would record it, with a hole seed from the opponent's garbage RNG. A
 * single-player mode sends no garbage, so a match of one player is just that player's game.
 */
export class Match {
  readonly engines: Engine[];
  /** Each player's garbage RNG, which deals the hole seeds of the garbage sent to them. */
  readonly holes: HoleSeedsState[];
  /** The id of the next attack sent. */
  nextId = 1;
  /** The garbage each player receives at the next frame, by player. */
  #incoming: GarbageReceivedAction[][];

  constructor(settings: ModeSettings, seed: number, players: number) {
    this.engines = Array.from({ length: players }, (_, index) =>
      createEngine(settings, seed, index),
    );
    this.holes = Array.from({ length: players }, (_, index) => holeSeeds.create(seed, index));
    this.#incoming = this.engines.map(() => []);
  }

  /**
   * Plays frame `frame`, the frame after the last one played, for each player: the garbage they
   * receive there, then `actions[player]`, all at that frame. Then it sends the garbage each sent
   * on to their opponent, to receive at the next frame. Accepting garbage, each player's engine
   * lands it as a client does, and records where; otherwise the actions say where it lands.
   */
  playFrame(
    frame: number,
    actions: readonly (readonly Action[])[],
    { acceptGarbage = false } = {},
  ): FramePlayed {
    const received = this.#incoming;
    this.#incoming = this.engines.map(() => []);
    const results = this.engines.map((engine, player) =>
      engine.step(frame, [...(received[player] ?? []), ...(actions[player] ?? [])], {
        acceptGarbage,
      }),
    );
    results.forEach(({ sent }, attacker) => {
      for (const { lines } of sent) this.#send(this.#opponentOf(attacker), frame + 1, lines);
    });
    return { received, accepted: results.map(({ accepted }) => accepted) };
  }

  /** Swaps every engine for one restored from its serialized state, as a reconnect would. */
  restore(): void {
    this.engines.forEach((engine, player) => {
      this.engines[player] = restoreEngine(engine.serialize());
    });
  }

  /** The other player of a 1v1. Who gets the garbage in FFA is up to the server, not the engine. */
  #opponentOf(attacker: number): number {
    if (this.engines.length !== 2) throw new Error('the harness only sends garbage in a 1v1');
    return 1 - attacker;
  }

  /** Sends `lines` of garbage to `target`, who receives it at `frame`. */
  #send(target: number, frame: number, lines: number): void {
    const holeSeed = holeSeeds.next(this.holes[target] as HoleSeedsState);
    const id = this.nextId++;
    this.#incoming[target]?.push({ frame, type: ActionType.GarbageReceived, id, lines, holeSeed });
  }
}

/** The actions of `actions` at each frame from 1 to `lastFrame`, by frame. */
export function byFrame(actions: readonly Action[], lastFrame: number): Action[][] {
  const frames: Action[][] = Array.from({ length: lastFrame + 1 }, () => []);
  for (const action of actions) frames[action.frame]?.push(action);
  return frames;
}
