/**
 * What client-core keeps between runs: the settings, which people may edit by hand, and the
 * records, which only the client writes (design §13.1, Storage).
 */
export type StoredKind = 'settings' | 'records';

/**
 * Where settings and records live: two files in the CLI (design §13.3), two `localStorage` keys on
 * the web. Each holds one JSON text. Every method may throw (a file it can't read or write); the
 * stores turn that into a message.
 */
export interface Storage {
  /** The stored text, or `null` if there is none yet. */
  read(kind: StoredKind): string | null;
  /** Replaces the stored text all at once: a failed write leaves the old text as it was. */
  write(kind: StoredKind, text: string): void;
  /**
   * Moves the stored text aside, where a person can still find it, so a fresh one can start.
   * Returns where it went, for the message.
   */
  setAside(kind: StoredKind): string;
  /** Where `kind` is kept, as a person would look for it: a file name or a key. */
  describe(kind: StoredKind): string;
}
