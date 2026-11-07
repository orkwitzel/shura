import { CLOCK_LEAD_TOLERANCE, FRAMES_PER_SECOND, frameAt, LAG_OUT_MS } from '@shura/protocol';
import type { Clock } from '../clock';

/** How far behind the expected frame a player may fall before they lag out: 3 s (design §8.4). */
export const LAG_OUT_FRAMES = (LAG_OUT_MS * FRAMES_PER_SECOND) / 1000;

/**
 * A match's clock rule (design §8.4): the expected frame on the server's clock, how far ahead of it
 * a batch may run, and when a player who has fallen behind it lags out.
 */
export class MatchClock {
  readonly #clock: Clock;
  /** Server time at the start of frame 0: the countdown's `startAt`. */
  readonly #startAt: number;
  readonly #timers = new Set<() => void>();

  constructor(clock: Clock, startAt: number) {
    this.#clock = clock;
    this.#startAt = startAt;
  }

  /** The frame a client on time has reached: `frameAt(now − startAt)`, as the client works it out. */
  expectedFrame(): number {
    return frameAt(this.#clock.now() - this.#startAt);
  }

  /**
   * Whether a batch that runs to `frame` is further ahead than `CLOCK_LEAD_TOLERANCE`. A batch
   * during the countdown always is: the expected frame is still below 0.
   */
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

  /** Stops every watch, as the match ends or its room stops it. */
  stop(): void {
    for (const cancel of this.#timers) cancel();
    this.#timers.clear();
  }
}
