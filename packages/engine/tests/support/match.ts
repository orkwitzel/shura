import {
  type Action,
  createEngine,
  type Engine,
  type GarbageAcceptedAction,
  type HoleSeedsState,
  holeSeeds,
  type ModeSettings,
  restoreEngine,
} from '../../src/index';

/**
 * A match played in lockstep, one engine per player, with the test harness in the server's part
 * (design §8.5): after every player has played a frame, it queues the garbage each one sent, which
 * their engine has already cancelled against their own garbage meter, on the opponent, with a hole
 * seed from the opponent's garbage RNG. A single-player mode sends no garbage, so a match of one
 * player is just that player's game.
 */
export class Match {
  readonly engines: Engine[];
  /** Each player's garbage RNG, which deals the hole seeds of the garbage queued on them. */
  readonly holes: HoleSeedsState[];
  /** The id of the next attack queued. */
  nextId = 1;

  constructor(settings: ModeSettings, seed: number, players: number) {
    this.engines = Array.from({ length: players }, (_, index) =>
      createEngine(settings, seed, index),
    );
    this.holes = Array.from({ length: players }, (_, index) => holeSeeds.create(seed, index));
  }

  /**
   * Plays frame `frame` for each player with `actions[player]`, all at that frame, then queues the
   * garbage each sent on their opponent. Accepting garbage, each player's engine lands it as a
   * client does, and this returns the `garbageAccepted` actions each recorded; otherwise the
   * actions say where it lands.
   */
  playFrame(
    frame: number,
    actions: readonly (readonly Action[])[],
    { acceptGarbage = false } = {},
  ): GarbageAcceptedAction[][] {
    const results = this.engines.map((engine, player) =>
      engine.step(frame, actions[player] ?? [], { acceptGarbage }),
    );
    results.forEach(({ sent }, attacker) => {
      for (const { lines } of sent) this.#queue(this.#opponentOf(attacker), lines);
    });
    return results.map(({ accepted }) => accepted);
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

  #queue(target: number, lines: number): void {
    const holeSeed = holeSeeds.next(this.holes[target] as HoleSeedsState);
    (this.engines[target] as Engine).queueGarbage({ id: this.nextId++, lines, holeSeed });
  }
}

/** The actions of `actions` at each frame from 1 to `lastFrame`, by frame. */
export function byFrame(actions: readonly Action[], lastFrame: number): Action[][] {
  const frames: Action[][] = Array.from({ length: lastFrame + 1 }, () => []);
  for (const action of actions) frames[action.frame]?.push(action);
  return frames;
}
