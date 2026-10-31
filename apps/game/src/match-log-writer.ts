import type { ClientMessageOf } from '@shura/protocol';
import type { MatchLog, MatchLogStart } from '@shura/valkey';
import type { Logger } from './logger';

/** How often a room appends to its match log (design §9.6): every 100 ms. */
export const MATCH_LOG_APPEND_MS = 100;

/** A verified input batch, as the match log keeps it: only the frames the server verified. */
export interface LoggedBatch {
  readonly playerId: string;
  readonly seq: number;
  readonly frames: ClientMessageOf<'inputBatch'>['frames'];
}

/** A garbage routing (design §9.6): one `garbageQueued`, and the target's verified frame then. */
export interface GarbageRouting {
  readonly from: string;
  readonly to: string;
  readonly id: number;
  readonly lines: number;
  readonly holeSeed: number;
  /** The target's verified frame when it was sent, which its timeout counts from. */
  readonly frame: number;
}

export interface MatchLogWriterOptions {
  readonly matchId: string;
  /** The room's ownership epoch, which tags each append (design §9.3). */
  readonly epoch: number;
  readonly log: MatchLog;
  /** The first entry: the seed, the mode settings and the players. */
  readonly start: MatchLogStart;
  readonly logger: Logger;
  /** Every batch of `playerId`'s up to `seq` is in the log: acknowledge it to their client. */
  readonly logged: (playerId: string, seq: number) => void;
}

/** Which of a player's batches are in the log. */
interface Logged {
  /** Every batch up to this `seq` is. */
  through: number;
  /** Batches after `through` that are, waiting for the ones before them. */
  readonly beyond: Set<number>;
}

/**
 * Writes a match's log (design §9.6, ADR 0007): the first entry at once, then, at each `append`,
 * one entry of the batches verified and the garbage routed since the last one, without waiting for
 * the appends before it.
 *
 * A batch is acknowledged only once the append holding it has succeeded, and only once every batch
 * before it has too, since a client takes `batchAck{ seq }` as acknowledging every batch up to
 * `seq`. An append that fails goes again with the next one, so the log can hold a batch after a
 * later one: a replay orders each player's batches by `seq`.
 */
export class MatchLogWriter {
  readonly #options: MatchLogWriterOptions;
  #batches: LoggedBatch[] = [];
  #routings: GarbageRouting[] = [];
  readonly #logged = new Map<string, Logged>();
  /** The start entry being written, or written; `null` after it failed, to try again. */
  #started: Promise<void> | null = null;
  readonly #writing = new Set<Promise<void>>();
  #finished = false;

  constructor(options: MatchLogWriterOptions) {
    this.#options = options;
    this.#start().catch(() => {});
  }

  /** A batch the server has verified, for the next append. */
  batch(batch: LoggedBatch): void {
    this.#batches.push(batch);
  }

  /** A garbage routing, for the next append. */
  routing(routing: GarbageRouting): void {
    this.#routings.push(routing);
  }

  /** Whether `playerId`'s batch `seq` is in the log, and so may be acknowledged. */
  isLogged(playerId: string, seq: number): boolean {
    return seq <= (this.#logged.get(playerId)?.through ?? -1);
  }

  /** Appends what has been verified and routed since the last append, if anything has. */
  append(): void {
    if (this.#finished || (this.#batches.length === 0 && this.#routings.length === 0)) return;
    const batches = this.#batches;
    const routings = this.#routings;
    this.#batches = [];
    this.#routings = [];
    const { matchId, epoch, log, logger } = this.#options;
    const writing = this.#start()
      .then(() => log.append(matchId, { epoch, batches, routings }))
      .then((appended) => {
        if (!appended) throw new Error('the match has no log');
        for (const { playerId, seq } of batches) this.#markLogged(playerId, seq);
      })
      .catch((error: unknown) => {
        logger.error({ err: error, matchId }, 'match log append failed');
        if (this.#finished) return;
        // Again with the next append, so nothing is acknowledged without it.
        this.#batches = [...batches, ...this.#batches];
        this.#routings = [...routings, ...this.#routings];
      })
      .finally(() => this.#writing.delete(writing));
    this.#writing.add(writing);
  }

  /**
   * The match has ended: appends what is left, waits for every append, and deletes the log
   * (design §9.6).
   */
  async finish(): Promise<void> {
    this.append();
    this.#finished = true;
    await Promise.allSettled([...this.#writing]);
    const { matchId, log, logger } = this.#options;
    try {
      await log.delete(matchId);
    } catch (error) {
      logger.error({ err: error, matchId }, 'match log delete failed');
    }
  }

  /** Writes the start entry, unless it has been written or is being written. */
  #start(): Promise<void> {
    if (this.#started) return this.#started;
    const { matchId, log, start, logger } = this.#options;
    // `false` means the log is there already: an earlier try got through.
    const started = log.start(matchId, start).then(() => {});
    this.#started = started;
    started.catch((error: unknown) => {
      logger.error({ err: error, matchId }, 'match log start failed');
      if (this.#started === started) this.#started = null;
    });
    return started;
  }

  #markLogged(playerId: string, seq: number): void {
    const logged = this.#logged.get(playerId) ?? { through: -1, beyond: new Set<number>() };
    this.#logged.set(playerId, logged);
    if (seq <= logged.through) return;
    logged.beyond.add(seq);
    const before = logged.through;
    while (logged.beyond.delete(logged.through + 1)) logged.through++;
    if (logged.through > before) this.#options.logged(playerId, logged.through);
  }
}
