---
status: accepted
---

# The gateway and game services run on NestJS

The services were hand-written on Node and `ws`: every new message, limit or endpoint meant choosing where code goes and how it's wired. Agents write most of this code, so the services need a framework with fixed conventions for both transports, REST and WebSocket, with one way to do DI, config, validation, errors, guards and tests.

Both `gateway` and `game` are NestJS apps (Nest 11 on Express, `@nestjs/platform-ws`), for their whole process: lifecycle, config, DI, HTTP and WebSocket handlers, play traffic included. The shape:

- **Feature modules** hold controllers, services and DTOs. Each socket endpoint has **one** WS gateway class whose `@SubscribeMessage` handlers each hand the message to a feature service in one statement. Nest gives each WS gateway class its own per-client message queue, so splitting one socket's messages across several classes would lose their order.
- **Order.** `WsAdapter` runs with `maxConcurrentMessages: 1`, so a socket's messages are handled one at a time, in order, and handlers may be `async`. The engine and clock enforcement depend on a player's batches arriving in sequence (ADR 0002).
- **Wire format.** Nest's own `{ event, data }` envelope in both directions, the internal gateway ⇄ game link included. Nothing online had shipped, so `PROTOCOL_VERSION` stays 1.
- **Validation.** The zod schemas in `@shura/protocol` stay the one definition of every message, used by the clients and the server alike, through `nestjs-zod` (`createZodDto`, a global validation pipe, OpenAPI).
- **Errors.** Nest's own shape per transport, `WsException({ code, message })` and `HttpException({ code, message }, status)`, with every `code` in one `ERRORS` table in `@shura/protocol`.
- **Outbound connections are providers, inbound ones are gateways.** The gateway service's per-room links to game pods (ADR 0005) are plain `ws` clients owned by a provider, not Nest microservices.
- **Add-ons:** `@nestjs/config` (validated by zod), `nestjs-pino`, `@nestjs/terminus`, `@willsoto/nestjs-prometheus`.

The decorators need `emitDecoratorMetadata`, which esbuild and `tsx` don't emit, so the services build with the Nest CLI's SWC builder and the internal packages get a build step: see [ADR 0015](0015-internal-packages-built-with-tsdown.md).

## Considered options

- **AdonisJS:** the most complete conventions for HTTP, but no first-party WebSocket layer, so half the traffic would get no structure.
- **Encore.ts:** typed REST and streaming endpoints declared alike, but it wants to own the infrastructure (pub/sub, cache, secrets), which fits our Valkey design and per-room links poorly, and it's the most lock-in.
- **Feathers:** one service over REST and real-time, but its real-time transport is socket.io.
- **socket.io under Nest:** its long-polling fallback breaks the 6-frame clock lead (§8.4) and needs sticky sessions (ADR 0004), and its own reconnect and offline buffer conflict with ours (§10.2).
- **Keeping play traffic out of Nest's pipeline:** the usual advice for game servers, but it leaves two styles of server code, which is what the framework is meant to end.
- **Several WS gateway classes per socket:** the Nest default layout, but messages handled by different classes can finish out of order.
- **Fastify:** better native types and faster HTTP, which two light routes don't need, and every Nest example assumes Express.

## Consequences

- Agents follow [`docs/agents/nest.md`](../agents/nest.md) and the services' `AGENTS.md` files. Architecture checks fail `pnpm check` when a feature reaches into another's files or a WS handler does more than delegate.
- Integration tests boot the real apps with `Test.createTestingModule` and `app.listen(0)`, and talk to them over real sockets.
- Nest's message dispatch runs on the hot path; its cost is measured in the M5 capacity benchmark.
