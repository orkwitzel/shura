# apps/gateway

The gateway service: the public WebSocket, the `/api` routes and forwarding room traffic to game pods. Its behaviour is in `docs/design.md` §8–§11. It's a NestJS app: read [`docs/agents/nest.md`](../../docs/agents/nest.md) first. This file is about where code goes.

## Layout

```text
src/
├── main.ts            creates the app, sets WsAdapter (maxConcurrentMessages: 1), listens
├── app.module.ts      imports the add-ons and the feature modules
├── config/            the zod schema of the environment, given to @nestjs/config
├── client.gateway.ts  ClientGateway: the one WS gateway class for /ws, every @SubscribeMessage
├── sessions/          POST /api/sessions, hello, setNickname, ping; SessionGuard; nicknames
├── rooms/             GET /api/rooms/:code, createRoom, joinRoom, leaveRoom, ready, startMatch,
│                      spectate, takeSeat; room placement
├── quick-match/       quickMatch, cancelQuickMatch, rematch; pairing across gateways
├── play/              inputBatch and the play pushes, forwarded through room-links
├── room-links/        RoomLinksService: one outbound ws link per room to its game pod
├── limits/            @RateLimit, RateLimitGuard, connection limits, client IPs
├── versions/          VersionGuard for /api, the hello version check
├── health/            /livez, /readyz (terminus), later /metrics
└── valkey/            provides the @shura/valkey stores by token (Valkey or in-memory)
```

## Rules

- `ClientGateway` routes; it holds no logic. A new client message is a schema in `@shura/protocol`, a handler in `ClientGateway`, and a method on the feature service that owns it.
- A message that needs a session uses `SessionGuard`. Only `hello` and `ping` don't.
- Room-scoped messages go to the room's game pod through `RoomLinksService`, never straight from a feature to a socket of its own.
- `tests/` mirrors `src/`. Tests that run the gateway with a game service and clients go in `tests/integration/`, and helpers (`faultySocket()`, test clients) in `tests/support/`.
