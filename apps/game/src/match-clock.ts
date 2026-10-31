import { CLOCK_LEAD_TOLERANCE, LAG_OUT_MS } from '@shura/protocol';
import type { ServerClock } from './clock';

/** Game time runs at 60 frames a second (design §5.1). */
const FRAMES_PER_SECOND = 60;

/** How far behind the expected frame a player may fall before they lag out: 3 s (design §8.4). */
export const LAG_OUT_FRAMES = (LAG_OUT_MS * FRAMES_PER_SECOND) / 1000;

/**
 * A match's clock rule (design §8.4): the expected frame on the server's clock, how far ahead of it
 * a batch may run, and when a player who has fallen behind it lags out.
 */
export class MatchClock {
  readonly #clock: ServerClock;
  /** Server time at the start of frame 0. */
  readonly #startAt: number;
  readonly #timers = new Set<() => void>();

  constructor(clock: ServerClock, startAt: number) {
    this.#clock = clock;
    this.#startAt = startAt;
  }

  /** `(now − startAt) × 60 / 1000`, the frame a client on time has reached. */
  expectedFrame(): number {
    return Math.floor(((this.#clock.now() - this.#startAt) * FRAMES_PER_SECOND) / 1000);
  }

  /** Whether a batch that runs to `frame` is further ahead than `CLOCK_LEAD_TOLERANCE`. */
  tooFarAhead(frame: number): boolean {
    return frame - this.expectedFrame() > CLOCK_LEAD_TOLERANCE;
  }

  /** Whether a player verified up to `frame` is more than 3 s behind. */
  laggedOut(frame: number): boolean {
    return this.expectedFrame() - frame > LAG_OUT_FRAMES;
  }

  /**
   * Watches a player's verified frame, as `frame()` reads it (`null` once they're out), and calls
   * `lagOut` with it the moment they fall more than 3 s behind. One timer per player at a time, due
   * when the frame it was set for would lag out: if they've moved on by then, it's set again.
   */
  watch(frame: () => number | null, lagOut: (frame: number) => void): void {
    const arm = () => {
      const at = frame();
      if (at === null) return;
      const due = this.#startAt + Math.ceil(((at + LAG_OUT_FRAMES + 1) * 1000) / FRAMES_PER_SECOND);
      const cancel = this.#clock.after(Math.max(0, due - this.#clock.now()), () => {
        this.#timers.delete(cancel);
        const now = frame();
        if (now === null) return;
        if (this.laggedOut(now)) lagOut(now);
        else arm();
      });
      this.#timers.add(cancel);
    };
    arm();
  }

  /** Stops every watch, as the match ends. */
  stop(): void {
    for (const cancel of this.#timers) cancel();
    this.#timers.clear();
  }
}
