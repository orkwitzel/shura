import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import Valkey from 'iovalkey';
import { afterEach, beforeEach, describe } from 'vitest';
import {
  createMemoryStores,
  createValkeyStores,
  type StoreOptions,
  type Stores,
  valkeyKeys,
} from '../../src/index';

/**
 * One backend the interface suites run against: the in-memory version always, and real Valkey
 * when `VALKEY_URL` is set (design §14).
 */
export interface Harness {
  /** The stores under test, as one gateway or game pod would hold them. */
  readonly stores: Stores;
  /**
   * Another process's stores on the same shared state: a second gateway or game pod. The memory
   * backend hands back the same stores, as in-process integration tests share one state.
   */
  peer(): Stores;
  /**
   * Moves time forward by `ms`. The memory backend's fake clock jumps. Against Valkey the stores'
   * clock moves too, and the call also waits `ms` for real, since Valkey expires keys on its own
   * clock: keep the times small.
   */
  advance(ms: number): Promise<void>;
  /** Removes everything the test wrote and closes every connection. */
  close(): Promise<void>;
}

/** TTLs and cooldowns short enough to wait out for real against Valkey. */
export const TEST_OPTIONS = {
  sessionTtlMs: 300,
  podTtlMs: 300,
  requeueCooldownMs: 300,
} satisfies StoreOptions;

interface Backend {
  name: string;
  open(options: StoreOptions): Harness;
}

const START = 1_000_000;

const memoryBackend: Backend = {
  name: 'memory',
  open(options) {
    let time = START;
    const stores = createMemoryStores({ ...options, now: () => time });
    return {
      stores,
      peer: () => stores,
      async advance(ms) {
        time += ms;
      },
      close: () => stores.close(),
    };
  },
};

function valkeyBackend(url: string): Backend {
  return {
    name: 'valkey',
    open(options) {
      let time = START;
      // A fresh prefix per test keeps tests apart on the one shared Valkey.
      const prefix = `test:${randomUUID()}:`;
      const connect = () => createValkeyStores(url, { ...options, prefix, now: () => time });
      const stores = connect();
      const all = [stores];
      return {
        stores,
        peer() {
          const peer = connect();
          all.push(peer);
          return peer;
        },
        async advance(ms) {
          time += ms;
          await sleep(ms);
        },
        async close() {
          await Promise.all(all.map((each) => each.close()));
          await removeAll(url, valkeyKeys(prefix).all);
        },
      };
    },
  };
}

/** Deletes every key matching `pattern`. */
async function removeAll(url: string, pattern: string): Promise<void> {
  const client = new Valkey(url);
  try {
    let cursor = '0';
    do {
      const [next, found] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
      if (found.length > 0) await client.del(...found);
      cursor = next;
    } while (cursor !== '0');
  } finally {
    await client.quit();
  }
}

const backends = [memoryBackend];
const url = process.env.VALKEY_URL;
if (url) backends.push(valkeyBackend(url));

/**
 * Runs an interface's suite once per backend. `harness()` gives the running test's backend, opened
 * fresh for every test with `options` ({@link TEST_OPTIONS} by default).
 */
export function describeStores(
  name: string,
  suite: (harness: () => Harness) => void,
  options: StoreOptions = TEST_OPTIONS,
): void {
  for (const backend of backends) {
    describe(`${name} (${backend.name})`, () => {
      let current: Harness | undefined;
      beforeEach(() => {
        current = backend.open(options);
      });
      afterEach(async () => {
        await current?.close();
        current = undefined;
      });
      suite(() => {
        if (!current) throw new Error('harness() is only available inside a test');
        return current;
      });
    });
  }
}
