/** How many ping samples the clock offset is chosen from: the last 30 (design §8.4). */
export const PING_SAMPLES = 30;

/** One ping and its pong, on the client's clock, with the server's time from the pong. */
export interface PingSample {
  readonly sentAt: number;
  readonly receivedAt: number;
  readonly serverTime: number;
}

/**
 * The server's clock as estimated from ping samples (design §8.4): each sample gives an offset of
 * `serverTime − (sentAt + receivedAt) / 2`, and the one with the shortest round trip of the last
 * 30 is the most accurate, so it's the one used.
 */
export class ClockSync {
  #samples: PingSample[] = [];

  add(sample: PingSample): void {
    this.#samples = [...this.#samples, sample].slice(-PING_SAMPLES);
  }

  /** Server time minus client time, from the best sample; `null` before the first. */
  get offset(): number | null {
    const best = this.#best();
    if (!best) return null;
    return best.serverTime - (best.sentAt + best.receivedAt) / 2;
  }

  /** The latest sample's round trip, in ms: the player's ping. `null` before the first. */
  get ping(): number | null {
    const latest = this.#samples.at(-1);
    return latest ? latest.receivedAt - latest.sentAt : null;
  }

  #best(): PingSample | undefined {
    let best: PingSample | undefined;
    for (const sample of this.#samples) {
      const trip = sample.receivedAt - sample.sentAt;
      if (!best || trip < best.receivedAt - best.sentAt) best = sample;
    }
    return best;
  }
}
