# apps/game

The game service: hosts rooms in memory and runs their matches (verification engines, clock enforcement, garbage, relay, results, the match log). Its behaviour is in `docs/design.md` §8–§10. It's a NestJS app: read [`docs/agents/nest.md`](../../docs/agents/nest.md) first. This file is about where code goes.

## Layout

```text
src/
├── main.ts              creates the app, calls configureApp, listens
├── configure-app.ts     configureApp(app): the pino logger, WsAdapter (maxConcurrentMessages: 1),
│                        shutdown hooks
├── app.module.ts        imports the add-ons and the feature modules
├── config/              the zod schema of the environment, given to @nestjs/config
├── clock/               the Clock (now() and timers) by its CLOCK token
├── errors/              the validation pipe (invalid_message), @WsProtocol(), WsExceptionFilter
├── room-link.gateway.ts RoomLinkGateway: the one WS gateway class for the room links, on /room-links
├── rooms/               the rooms this pod hosts: createRoom, attach, detach, lobby state
├── match/               a running match: verification engines, clock, garbage, relay, placements
├── match-log/           appends to log:{matchId} every 100 ms, acknowledges batches after
├── heartbeat/           the pod's heartbeat; starts draining through health's DrainingIndicator
├── health/              /livez, /readyz (terminus, with the draining check), later /metrics
└── valkey/              provides the @shura/valkey stores by token (Valkey or in-memory)
```

## Rules

- `RoomLinkGateway` carries `@WsProtocol()` (from `errors/`): Nest's global pipe and filters don't reach WS gateway classes, so it brings the validation pipe and the filter that sends `exception{ code, message }`.
- `RoomLinkGateway` routes; it holds no logic. Every message on a room link carries `{ roomCode, epoch, sessionId }` (design §8.7).
- A room, a match and its clock are plain classes that the `rooms` and `match` providers create. They take the injected clock and never read time or randomness themselves (the engine's rules in `AGENTS.md` apply to the match's game logic too).
- `tests/` mirrors `src/`. Tests that run the game service with a gateway and clients live in `apps/gateway/tests/integration/`.
- `tests/support/boot.ts` boots the app as `main.ts` does (`configureApp`) on a free port: `boot({ override })` replaces providers, `boot({ imports })` adds test-only modules beside `AppModule`. `tests/architecture.test.ts` holds the architecture checks.
