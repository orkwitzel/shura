# packages/valkey

The shared state the gateway and the game service use: each store is an interface with an in-memory and a Valkey version. Its behaviour is in `docs/design.md` §9.5 (keys), §9.6 (match log) and §11 (rate limits). This file is about where code goes.

## Layout

One folder per store, holding its interface and both versions side by side: a change to a store changes all three, and the two versions must keep behaving the same.

```text
src/
├── index.ts             the package's whole API
├── stores.ts            Stores, createMemoryStores and createValkeyStores, with the default TTLs
├── shared/
│   ├── keys.ts          the key layout, under an optional prefix
│   ├── lua.ts           defining a store's Lua scripts as iovalkey commands, and reading their replies
│   └── expiring-map.ts  a map with TTLs, which the memory versions keep their keys in
├── registry/            Registry: rooms
├── match-queue/         MatchQueue: the quick-match queue and its pairing notices
│   └── listeners.ts     one process's `onMatched` listeners, for both versions
├── session-store/       SessionStore: sessions by token
├── pod-health/          PodHealth: game pods' heartbeats
├── match-log/           MatchLog: match logs
└── rate-limiter/        RateLimiter: token buckets and connection counts
    └── bucket.ts        the token-bucket arithmetic the memory limiter (and the gateway's message bucket) runs
```

Each store's folder holds `<store>.ts` (the interface), `memory-<store>.ts` and `valkey-<store>.ts`.

## Rules

- It imports `iovalkey` and nothing from the workspace. It stores what the services give it (room modes and phases as strings, match-log entries as JSON) and the services check what they read back. Apps reach Valkey only through this package.
- A new store adds its three files, is wired into `stores.ts`, and gets one test suite that both versions run.
- The two versions behave the same. Every Valkey change that reads and then writes runs as one Lua script, defined next to its store as an iovalkey command (`defineScripts`) and typed in a `declare module 'iovalkey'` block beside it. The memory version stays atomic by not awaiting between its read and its write. The rate limiter's Lua repeats `rate-limiter/bucket.ts`'s arithmetic: change both together.
- Time comes from the injected `now` (`StoreOptions`, `Date.now` by default): the memory versions expire on it, and the Valkey versions pass it to their scripts where they need a time. Valkey's own TTLs run on Valkey's clock.
- Every key and channel goes through `shared/keys.ts`, so a prefix keeps tests apart.

## Tests

- One file per store, in a folder named like its `src/` one, each written once with `describeStores` (`tests/support/backends.ts`): it runs against the memory version always and against real Valkey when `VALKEY_URL` is set, each test under a fresh prefix.
- `key-layout.test.ts` checks the keys themselves and runs only with `VALKEY_URL`.
- Locally: `docker compose up -d --wait valkey`, then `VALKEY_URL=redis://localhost:6379 pnpm check`. CI runs a Valkey service container, so both versions run on every PR.
