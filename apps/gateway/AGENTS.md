# apps/gateway

The gateway service: the public WebSocket, the `/api` routes and forwarding room traffic to game pods. Its behaviour is in `docs/design.md` §8–§11. It's a NestJS app: read [`docs/agents/nest.md`](../../docs/agents/nest.md) first. This file is about where code goes.

## Layout

```text
src/
├── main.ts            creates the app, calls configureApp, listens
├── configure-app.ts   configureApp(app): the pino logger, ClientWsAdapter (Nest's WsAdapter with
│                      maxConcurrentMessages: 1 and the socket limits), shutdown hooks
├── app.module.ts      imports the add-ons and the feature modules
├── config/            the zod schema of the environment, given to @nestjs/config; the LIMITS token
├── clock/             the Clock (now() and timers) by its CLOCK token
├── errors/            the validation pipe (invalid_message), @WsProtocol(), WsExceptionFilter
├── client.gateway.ts  ClientGateway: the one WS gateway class for /ws, every @SubscribeMessage
├── sessions/          POST /api/sessions, hello, setNickname, ping; SessionGuard; nicknames
├── rooms/             GET /api/rooms/:code, createRoom, joinRoom, leaveRoom, ready, startMatch,
│                      spectate, takeSeat; room placement
├── quick-match/       quickMatch, cancelQuickMatch, rematch; pairing across gateways
├── play/              inputBatch and the play pushes, forwarded through room-links
├── room-links/        RoomLinksService: one outbound ws link per room to its game pod
├── limits/            @RateLimit, RateLimitGuard, connection limits, client IPs, ClientWsAdapter
├── versions/          VersionGuard for /api, the hello version check
├── health/            /livez, /readyz (terminus, with the draining check), later /metrics
└── valkey/            provides the @shura/valkey stores by token (Valkey or in-memory)
```

## Rules

- `ClientGateway` carries `@WsProtocol()` (from `errors/`): Nest's global pipe and filters don't reach WS gateway classes, so it brings the validation pipe and the filter that sends `exception{ code, message }`.
- `ClientGateway` routes; it holds no logic. A new client message is a schema in `@shura/protocol`, a handler in `ClientGateway`, and a method on the feature service that owns it.
- A message that needs a session uses `SessionGuard`. Only `hello` and `ping` don't.
- Room-scoped messages go to the room's game pod through `RoomLinksService`, never straight from a feature to a socket of its own.
- `tests/` mirrors `src/`. Tests that run the gateway with a game service and clients go in `tests/integration/`, and helpers (`faultySocket()`, test clients) in `tests/support/`.
- Integration tests build on `tests/support/online-world.ts` (`onlineWorld()`: both apps, one fake clock from `fake-time.ts`, one in-memory `Stores`, a fixed match seed, and `client(nickname, { through, fetchThrough, clockThrough })`; `stallable-clock.ts` stalls a client's game loop) and `online-games.ts` (`openRoom`, `startMatch`, `expectVerified`…). Every test that plays a match to its end calls `expectVerified`. `raw-client.ts` is a bare socket for messages a real client never sends.
- The game service comes in through `@shura/game` and the bot tool through `@shura/bot` (dev dependencies, for `tests/integration/bots.test.ts`), from the source entries their `package.json` `exports` name: the one place an app imports another (design §14), besides the CLI's one test against the real server, which imports the gateway's own source entries the same way. Only tests import them.
- Limits come from the `LIMITS` token (`config/`, provided by `limits/`), never from `LIMIT_DEFAULTS` directly, so tests set them with `overrideProvider(LIMITS)` (`onlineWorld({ limits })`, which exempts loopback unless told otherwise). A per-IP limit on a route or a socket message is `@RateLimit('<key>')`, with its policy in `RATE_LIMITS`. The one without a decorator is `sessions`: `SessionsService` checks it only for a new session, since a resume isn't counted.
- Per-connection state lives in `sessions/`' `ConnectionsService`, never on the socket and never in a feature's own map: a feature's state for a connection is a field of `Connection` (`roomCode` and `roomMember` for `rooms/`, `stopWaiting` for `quick-match/`). `sessionOf(connection)` gives the session of a connection past `SessionGuard`. The one exception is `limits/`' `ConnectionLimitsService`, which keeps each socket's limits by socket: `sessions/` imports `limits/` (`IpLimitsService` for the sessions limit), so `limits/` can't import `sessions/`, and `ClientGateway` wires the two together. Anything that changes a connection (a message, its close, a room link's delivery, a pub/sub notice) runs in `connections.inTurn(socket, …)`; register work for a closing connection with `connections.onClose`.
- `tests/support/boot.ts` boots the app as `main.ts` does (`configureApp`) on a free port: `boot({ override })` replaces providers, `boot({ imports })` adds test-only modules beside `AppModule`. `tests/architecture.test.ts` holds the architecture checks.
