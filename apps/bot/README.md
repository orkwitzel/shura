# @shura/bot

> [!WARNING]
> **Testing tool only. Not part of the product.** It exists so one person on one laptop can fill a room, and so load tests can run hundreds of players. It is never deployed and has no Docker image. See [design §13.4](../../docs/design.md#134-bot-testing-tool-only).

A small service that runs headless **bots** (see the [glossary](../../docs/glossary.md)). Each bot is a client like any other: client-core's online session on the gateway's public WebSocket, with no special trust. It plays like a person. It thinks before each piece, and its keys go through the real input engine with human handling, so pieces slide and turn step by step. Now and then it fumbles.

## Use

```sh
pnpm dev                          # gateway, game and web (in one terminal)
pnpm dev:bot                      # the bot tool on :8090 (in another)
pnpm bot join K7QX --count 1      # one bot joins room K7QX and readies up
pnpm bot leave K7QX               # removes K7QX's bots
pnpm bot list
```

`--profile` picks a bot profile (only `casual`, about a piece a second). `--pps` sets a different pace for load tests. The HTTP API behind it:

| Request | Does |
|---|---|
| `POST /bots { room, count?, profile?, pps? }` | adds `count` bots (default 1, at most 100) to the room |
| `DELETE /bots?room=K7QX` | removes the room's bots |
| `GET /bots` | lists the bots |
| `GET /livez` | answers 200 while the tool runs |

Bodies are JSON of at most 4 KiB. A refusal is JSON `{ error }`: 400 for a bad request, 404, 405, and 413 for a body too large. Quick-match bots (`{ quickMatch: true }`, `pnpm bot quick`) come with quick-match in the online session.

## Config

| Variable | Default | |
|---|---|---|
| `BOT_PORT` | `8090` | the HTTP API's port |
| `GATEWAY_URL` | `http://localhost:8080` | the gateway's HTTP origin, which the bots connect to (sessions under `/api`, the socket at `/ws`) |
| `BOT_SEED` | random | seeds every bot's choices, to replay a run |
| `LOG_LEVEL` | `info` | pino's level |
| `NODE_ENV` | `production` | `development` (set by `pnpm dev:bot`) pretty-prints the logs; anything else logs JSON |

`pnpm bot` talks to `BOT_URL` (default `http://localhost:8090`).

## Code

- `src/brain/brain.ts`: `choosePlacement`, a pure function from a game, a profile and a seeded random source to a placement.
- `src/bot/pilot.ts`: steers each piece to its placement with key events.
- `src/bot/bot.ts`: one bot's lobby life on its online session.
- `src/service/` (the pool and the HTTP API) and `src/main.ts`: the service. `src/command/`: `pnpm bot`.

Tests are in `tests/`. The in-process match test, a bot against a scripted client in a 1v1 through the real gateway and game service, is in `apps/gateway/tests/integration/bots.test.ts`.
