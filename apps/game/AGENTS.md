# apps/game

The game service: hosts rooms in memory and runs their matches (verification engines, clock enforcement, garbage, relay, results, the match log). Its behaviour is in `docs/design.md` §8–§10. It's a NestJS app: read [`docs/agents/nest.md`](../../docs/agents/nest.md) first. This file is about where code goes.

## Layout

```text
src/
├── main.ts              creates the app, sets WsAdapter (maxConcurrentMessages: 1), listens
├── app.module.ts        imports the add-ons and the feature modules
├── config/              the zod schema of the environment, given to @nestjs/config
├── room-link.gateway.ts RoomLinkGateway: the one WS gateway class for the gateway's room links
├── rooms/               the rooms this pod hosts: createRoom, attach, detach, lobby state
├── match/               a running match: verification engines, clock, garbage, relay, placements
├── match-log/           appends to log:{matchId} every 100 ms, acknowledges batches after
├── heartbeat/           the pod's heartbeat and draining
├── health/              /livez, /readyz (terminus), later /metrics
└── valkey/              provides the @shura/valkey stores by token (Valkey or in-memory)
```

## Rules

- `RoomLinkGateway` routes; it holds no logic. Every message on a room link carries `{ roomCode, epoch, sessionId }` (design §8.7).
- A room, a match and its clock are plain classes that the `rooms` and `match` providers create. They take the injected clock and never read time or randomness themselves (the engine's rules in `AGENTS.md` apply to the match's game logic too).
- `tests/` mirrors `src/`. Tests that run the game service with a gateway and clients live in `apps/gateway/tests/integration/`.
