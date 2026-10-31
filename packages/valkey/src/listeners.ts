import type { MatchedNotice } from './match-queue';

type Listener = (notice: MatchedNotice) => void;

/** One process's `onMatched` listeners, by session id. */
export class MatchedListeners {
  readonly #listeners = new Map<string, Set<Listener>>();

  add(sessionId: string, listener: Listener): () => void {
    // Each registration is its own entry, so the same function can be added twice and removed once.
    const entry: Listener = (notice) => listener(notice);
    const set = this.#listeners.get(sessionId) ?? new Set();
    set.add(entry);
    this.#listeners.set(sessionId, set);
    return () => {
      set.delete(entry);
      if (set.size === 0) this.#listeners.delete(sessionId);
    };
  }

  dispatch(notice: MatchedNotice): void {
    for (const listener of [...(this.#listeners.get(notice.sessionId) ?? [])]) listener(notice);
  }
}
