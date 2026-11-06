# apps/gateway

The gateway service: the public WebSocket, the `/api` routes and forwarding room traffic to game pods. Its behaviour is in `docs/design.md` §8–§11. It's a NestJS app: read [`docs/agents/nest.md`](../../docs/agents/nest.md) first. This file is about where code goes.

## Layout

```text
src/
├── main.ts            creates the app, calls configureApp, listens
├── configure-app.ts   configureApp(app): the pino logger, WsAdapter (maxConcurrentMessages: 1),
│                      shutdown hooks
├── app.module.ts      imports the add-ons and the feature modules
├── config/            the zod schema of the environment, given to @nestjs/config
├── clock/             the Clock (now() and timers) by its CLOCK token
├── errors/            the validation pipe (invalid_message), @WsProtocol(), WsExceptionFilter
├── client.gateway.ts  ClientGateway: the one WS gateway class for /ws, every @SubscribeMessage
├── sessions/          POST /api/sessions, hello, setNickname, ping; SessionGuard; nicknames
├── rooms/             GET /api/rooms/:code, createRoom, joinRoom, leaveRoom, ready, startMatch,
│                      spectate, takeSeat; room placement
├── quick-match/       quickMatch, cancelQuickMatch, rematch; pairing across gateways
├── play/              inputBatch and the play pushes, forwarded through room-links
├── room-links/        RoomLinksService: one outbound ws link per room to its game pod
├── limits/            @RateLimit, RateLimitGuard, connection limits, client IPs
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
- The game service comes in through `@shura/game` (a dev dependency), from the source entries its `package.json` `exports` name: the one place an app imports another (design §14). Only tests import it.
- Per-connection state lives in `sessions/`' `ConnectionsService`, never on the socket. Anything that changes a connection (a message, its close, a room link's delivery, a pub/sub notice) runs in `connections.inTurn(socket, …)`; register work for a closing connection with `connections.onClose`.
- `tests/support/boot.ts` boots the app as `main.ts` does (`configureApp`) on a free port: `boot({ override })` replaces providers, `boot({ imports })` adds test-only modules beside `AppModule`. `tests/architecture.test.ts` holds the architecture checks.
