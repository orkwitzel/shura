# @shura/bot

> [!WARNING]
> **Testing tool only. Not part of the product.** It exists so one person on one laptop can fill a room, and so load tests can run hundreds of players. It is never deployed and has no Docker image. See [design §13.4](../../docs/design.md#134-bot-testing-tool-only).

A small service that runs headless **bots** (see the [glossary](../../docs/glossary.md)). Each bot is a client like any other: client-core's online session on the gateway's public WebSocket, with no special trust. It plays like a person. It thinks before each piece, and its keys go through the real input engine with human handling, so pieces slide and turn step by step. Now and then it fumbles.

## Use

```sh
pnpm dev                          # gateway, game and web (in one terminal)
pnpm dev:bot                      # the bot tool on :8090 (in another)
pnpm bot join K7QX --count 1      # one bot joins room K7QX and readies up
pnpm bot quick --count 2          # two bots quick-match
pnpm bot leave K7QX               # removes K7QX's bots
pnpm bot list
```

`--profile` picks a bot profile (only `casual`, about a piece a second). `--pps` sets a different pace for load tests. The HTTP API behind it:

| Request | Does |
|---|---|
| `POST /bots { room, count?, profile?, pps? }` | adds `count` bots (default 1) to the room |
| `POST /bots { quickMatch: true, count?, profile?, pps? }` | adds bots that quick-match |
| `DELETE /bots?room=K7QX` | removes the room's bots |
| `GET /bots` | lists the bots |

## Config

| Variable | Default | |
|---|---|---|
| `BOT_PORT` | `8090` | the HTTP API's port |
| `GATEWAY_URL` | `ws://localhost:8080` | the gateway the bots connect to |
| `BOT_SEED` | random | seeds every bot's choices, to replay a run |
| `LOG_LEVEL` | `info` | pino's level |

`pnpm bot` talks to `BOT_URL` (default `http://localhost:8090`).

## Code

- `src/brain.ts`: `choosePlacement`, a pure function from a game, a profile and a seeded random source to a placement.
- `src/pilot.ts`: steers each piece to its placement with key events.
- `src/bot.ts`: one bot's lobby life on its online session.
- `src/bot-pool.ts`, `src/server.ts` and `src/main.ts`: the service. `src/command.ts` and `src/cli.ts`: `pnpm bot`.

Tests are in `tests/`. The in-process match test, with three bots and a scripted client in an FFA, is in `apps/gateway/tests/integration/bots.test.ts`.
