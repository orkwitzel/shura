# apps/bot

Testing tool only: headless bot players that join rooms through the gateway. Never deployed, and no Dockerfile. Its behaviour is in `docs/design.md` §13.4, and how to run it in `README.md`. This file is about where code goes.

## Layout

```text
src/
├── main.ts            the service: config, the real clock, pino, the pool, the HTTP server, and
│                      shutting down (close-with-grace)
├── index.ts           what apps/gateway's integration tests import; nothing in src/ uses it
├── brain/
│   ├── brain.ts       choosePlacement: a pure function from a game, a profile and a Random to a placement
│   ├── profile.ts     BotProfile and BOT_PROFILES (only `casual`)
│   └── random.ts      the bot's own seeded Random
├── bot/
│   ├── bot.ts         one bot's life in a room or a quick-match on client-core's online session
│   └── pilot.ts       plays one game: thinks, asks the brain, presses keys through the input engine
├── service/
│   ├── bot-pool.ts    the bots alive, their names and seeds
│   └── server.ts      the HTTP API on Hono: POST, DELETE and GET /bots, /livez
├── command/
│   ├── cli.ts         `pnpm bot …`, which runs command.ts
│   └── command.ts     parses `pnpm bot` arguments with Commander and calls the HTTP API
└── platform/
    ├── clock.ts       botClock, the real TimerClock
    ├── config.ts      the environment, checked by zod
    └── logger.ts      the pino logger
```

## Rules

- A bot is a client like any other: it plays only through `@shura/client-core`'s `OnlineSession` on the gateway's public WebSocket. It imports `client-core`, `engine` and `protocol`, never `valkey`, `game` or `gateway`.
- Every choice a bot makes comes from `brain/random.ts`, seeded from `BOT_SEED`, so a run replays. `main.ts` is the one place that calls `Math.random`, for the default seed. The engine's PRNGs belong to the game: the bot never draws from them.
- `brain/brain.ts` stays pure: no clock, no session, no I/O.
- The pool, each bot and each pilot take their clock as an option, and the pool its logger, gateway URL, `Connect` and `fetch`. Only `main.ts` wires the real ones.
- `package.json` `exports` the source `src/index.ts`: only the gateway's tests import the bot, through Vitest. The service itself is bundled by esbuild (`build`), never by tsdown.
- A new export for the gateway's integration tests goes in `index.ts`.

## Tests

- `tests/` mirrors `src/`'s folders, a file per module, with helpers in `tests/support/` (`games.ts` builds a game from a drawn stack, `practice.ts` plays a pilot alone frame by frame).
- Tests of bots in a real match, over an in-process gateway and game, live in `apps/gateway/tests/integration/bots.test.ts`.
- `vitest.config.ts` gives every test 30 s, since they simulate whole games.
