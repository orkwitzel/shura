/** A map whose entries expire on the given clock, as Valkey keys with a TTL do. */
export class ExpiringMap<V> {
  readonly #entries = new Map<string, { value: V; expiresAt: number }>();
  readonly #now: () => number;

  constructor(now: () => number) {
    this.#now = now;
  }

  get(key: string): V | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Stores `value` for `ttlMs` (forever when undefined). */
  set(key: string, value: V, ttlMs?: number): void {
    this.#entries.set(key, { value, expiresAt: this.#expiry(ttlMs) });
  }

  /** Restarts an entry's TTL. Returns false if there is no such entry. */
  expire(key: string, ttlMs: number): boolean {
    const value = this.get(key);
    if (value === undefined) return false;
    this.set(key, value, ttlMs);
    return true;
  }

  /** The time left before `key` expires, in ms: 0 if there is no such entry. */
  ttl(key: string): number {
    if (this.get(key) === undefined) return 0;
    const { expiresAt } = this.#entries.get(key) as { expiresAt: number };
    return expiresAt === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : expiresAt - this.#now();
  }

  delete(key: string): void {
    this.#entries.delete(key);
  }

  /** The keys of the entries that haven't expired. */
  keys(): string[] {
    return [...this.#entries.keys()].filter((key) => this.get(key) !== undefined);
  }

  #expiry(ttlMs: number | undefined): number {
    return ttlMs === undefined ? Number.POSITIVE_INFINITY : this.#now() + ttlMs;
  }
}
