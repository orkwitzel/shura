import Valkey from 'iovalkey';
import { valkeyKeys } from './keys';
import { createMemoryRegistry } from './memory/registry';
import type { Registry } from './registry';
import { createValkeyRegistry } from './valkey/registry';

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

/** Every shared-state interface `gateway` and `game` use, on one backing store. */
export interface Stores {
  readonly registry: Registry;
  /** Closes the connections. The memory version has none. */
  close(): Promise<void>;
}

/** Stores in this process's memory: for tests, and gateway and game run in one process. */
export function createMemoryStores(_options: StoreOptions = {}): Stores {
  return {
    registry: createMemoryRegistry(),
    async close() {},
  };
}

/** Stores in the Valkey at `url` (`redis://host:port`), through `iovalkey`. */
export function createValkeyStores(url: string, options: ValkeyStoreOptions = {}): Stores {
  const client = new Valkey(url, { enableAutoPipelining: true });
  const keys = valkeyKeys(options.prefix);
  let closed = false;
  return {
    registry: createValkeyRegistry(client, keys),
    async close() {
      if (closed) return;
      closed = true;
      await client.quit();
    },
  };
}
