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
 * A 1v1 match played in lockstep, with the test harness in the server's part (design §8.5): after
 * both players have played a frame, it cancels each attack against the attacker's own garbage meter
 * and queues the remainder on the opponent, with a hole seed from the opponent's garbage RNG.
 */
export class VersusMatch {
  readonly engines: Engine[];
  /** Each player's garbage RNG, which deals the hole seeds of the garbage queued on them. */
  readonly holes: HoleSeedsState[];
  /** The id of the next attack queued. */
  nextId = 1;

  constructor(settings: Readonly<ModeSettings>, seed: number, players = 2) {
    if (players !== 2) throw new Error('the harness plays 1v1 only');
    this.engines = Array.from({ length: players }, (_, index) =>
      createEngine(settings, seed, index),
    );
    this.holes = Array.from({ length: players }, (_, index) => holeSeeds.create(seed, index));
  }

  /**
   * Plays frame `frame` for each player with `actions[player]`, all at that frame, then sends the
   * frame's attacks. Accepting garbage, each player's engine lands it as a client does, and this
   * returns the `garbageAccepted` actions each recorded; otherwise the actions say where it lands.
   */
  playFrame(
    frame: number,
    actions: readonly (readonly Action[])[],
    { acceptGarbage = false } = {},
  ): GarbageAcceptedAction[][] {
    const results = this.engines.map((engine, player) =>
      engine.step(frame, actions[player] ?? [], { acceptGarbage }),
    );
    results.forEach(({ attacks }, attacker) => {
      for (const { lines } of attacks) this.#send(attacker, lines);
    });
    return results.map(({ accepted }) => accepted);
  }

  /** Swaps every engine for one restored from its serialized state, as a reconnect would. */
  restore(): void {
    this.engines.forEach((engine, player) => {
      this.engines[player] = restoreEngine(engine.serialize());
    });
  }

  #send(attacker: number, lines: number): void {
    const remainder = (this.engines[attacker] as Engine).cancelGarbage(lines);
    if (remainder === 0) return;
    const target = 1 - attacker;
    const holeSeed = holeSeeds.next(this.holes[target] as HoleSeedsState);
    (this.engines[target] as Engine).queueGarbage({
      id: this.nextId++,
      lines: remainder,
      holeSeed,
    });
  }
}

/** The actions of `actions` at each frame from 1 to `lastFrame`, by frame. */
export function byFrame(actions: readonly Action[], lastFrame: number): Action[][] {
  const frames: Action[][] = Array.from({ length: lastFrame + 1 }, () => []);
  for (const action of actions) frames[action.frame]?.push(action);
  return frames;
}
