import Valkey from 'iovalkey';
import type { MatchLog } from './match-log/match-log';
import { createMemoryMatchLog } from './match-log/memory-match-log';
import { createValkeyMatchLog } from './match-log/valkey-match-log';
import type { MatchQueue } from './match-queue/match-queue';
import { createMemoryMatchQueue } from './match-queue/memory-match-queue';
import { createValkeyMatchQueue } from './match-queue/valkey-match-queue';
import { createMemoryPodHealth } from './pod-health/memory-pod-health';
import type { PodHealth } from './pod-health/pod-health';
import { createValkeyPodHealth } from './pod-health/valkey-pod-health';
import { createMemoryRateLimiter } from './rate-limiter/memory-rate-limiter';
import type { RateLimiter } from './rate-limiter/rate-limiter';
import { createValkeyRateLimiter } from './rate-limiter/valkey-rate-limiter';
import { createMemoryRegistry } from './registry/memory-registry';
import type { Registry } from './registry/registry';
import { createValkeyRegistry } from './registry/valkey-registry';
import { createMemorySessionStore } from './session-store/memory-session-store';
import type { SessionStore } from './session-store/session-store';
import { createValkeySessionStore } from './session-store/valkey-session-store';
import { valkeyKeys } from './shared/keys';

/** Times the stores keep things for. Every one has a default from design §9.5 and §11. */
export interface StoreOptions {
  /** The clock, in milliseconds. `Date.now` by default; tests pass a fake one. */
  now?: () => number;
  /** How long a session lives after it was last used. 30 minutes by default. */
  sessionTtlMs?: number;
  /** How long a heartbeat counts after it was written. 5 s by default. */
  podTtlMs?: number;
  /** How long a session that left the quick-match queue waits to rejoin it. 3 s by default. */
  requeueCooldownMs?: number;
}

export interface ValkeyStoreOptions extends StoreOptions {
  /** Prepended to every key and channel. Empty by default; tests use a fresh one each. */
  prefix?: string;
}

const DEFAULTS = {
  now: Date.now,
  sessionTtlMs: 30 * 60_000,
  podTtlMs: 5_000,
  requeueCooldownMs: 3_000,
} satisfies Required<StoreOptions>;

/** Every shared-state interface `gateway` and `game` use, on one backing store. */
export interface Stores {
  readonly registry: Registry;
  readonly matchQueue: MatchQueue;
  readonly sessions: SessionStore;
  readonly podHealth: PodHealth;
  readonly matchLog: MatchLog;
  readonly rateLimiter: RateLimiter;
  /** Closes the connections. The memory version has none. */
  close(): Promise<void>;
}

/** Stores in this process's memory: for tests, and gateway and game run in one process. */
export function createMemoryStores(options: StoreOptions = {}): Stores {
  const { now, sessionTtlMs, podTtlMs, requeueCooldownMs } = { ...DEFAULTS, ...options };
  return {
    registry: createMemoryRegistry(),
    matchQueue: createMemoryMatchQueue(now, requeueCooldownMs),
    sessions: createMemorySessionStore(now, sessionTtlMs),
    podHealth: createMemoryPodHealth(now, podTtlMs),
    matchLog: createMemoryMatchLog(),
    rateLimiter: createMemoryRateLimiter(now),
    async close() {},
  };
}

/** Stores in the Valkey at `url` (`redis://host:port`), through `iovalkey`. */
export function createValkeyStores(url: string, options: ValkeyStoreOptions = {}): Stores {
  const client = new Valkey(url, { enableAutoPipelining: true });
  const keys = valkeyKeys(options.prefix);
  const { now, sessionTtlMs, podTtlMs, requeueCooldownMs } = { ...DEFAULTS, ...options };
  const matchQueue = createValkeyMatchQueue(client, keys, requeueCooldownMs);
  let closed = false;
  return {
    registry: createValkeyRegistry(client, keys),
    matchQueue,
    sessions: createValkeySessionStore(client, keys, sessionTtlMs),
    podHealth: createValkeyPodHealth(client, keys, podTtlMs, now),
    matchLog: createValkeyMatchLog(client, keys),
    rateLimiter: createValkeyRateLimiter(client, keys, now),
    async close() {
      if (closed) return;
      closed = true;
      await Promise.all([matchQueue.close(), client.quit()]);
    },
  };
}
