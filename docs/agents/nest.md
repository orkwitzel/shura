# NestJS conventions (gateway and game)

Rules shared by `apps/gateway` and `apps/game`. Each service's own `AGENTS.md` gives its `src/` tree and feature list. Why Nest, and why these rules: [ADR 0014](../adr/0014-server-services-on-nestjs.md). How the services behave: `docs/design.md` §8–§12.

"Gateway" alone means the gateway service. Nest's `@WebSocketGateway` classes are **WS gateway classes**.

## Modules

- One folder per **feature module**, named after its capability (`rooms/`, `quick-match/`). It holds `<name>.module.ts` and, as needed, `<name>.controller.ts`, `<name>.service.ts` (or several services named after what they do), `<name>.dto.ts`, guards and decorators.
- A feature exports what others may use from its `index.ts`: the module and its exported providers. Other features import only that `index.ts` (`../rooms`), never a file inside the folder. Biome's `noRestrictedImports` enforces it, so a feature's own files stay flat in its folder.
- Import injected classes as values, never with `import type`: Nest reads constructor types from decorator metadata. Biome's `useImportType` is off in the services for that reason.
- `app.module.ts` imports the feature modules and the add-ons. `configure-app.ts` has `configureApp(app)`, which sets the logger, the WS adapter and shutdown hooks. `main.ts` only creates the app, calls `configureApp` and listens; `tests/support/boot.ts` calls `configureApp` too, so tests run the app as it ships.
- Generate files with `nest g` (schematics set in `nest-cli.json`: a folder per module, no `.spec` files, since tests go in `tests/`), so they land in this shape.
- The services build with `nest build` (SWC, options in `.swcrc`, ES modules) and use TypeScript 6 (the `nest` catalog in `pnpm-workspace.yaml`): the Nest CLI needs TypeScript's compiler API, which TypeScript 7.0 doesn't ship.

## WebSockets

- Each socket endpoint has **one** WS gateway class. Every `@SubscribeMessage` handler in it is one statement that hands the message to a feature service. An architecture test enforces it. Nest gives each WS gateway class its own per-client queue, so a second class on the same socket would break message order.
- The app uses `WsAdapter` with `maxConcurrentMessages: 1`: a socket's messages are handled one at a time, in order. Handlers may be `async`.
- Every WS gateway class carries `@WsProtocol()` from the service's `errors/`. Nest's global pipes and filters don't reach WS gateway classes, and its own WS filter never sends on a raw `ws` socket, so the decorator brings the validation pipe and `WsExceptionFilter`, which sends `exception{ code, message }` (an exception without an `ERRORS` code goes out as `internal_error`, and is logged).
- Messages are `{ event, data }` both ways. `event` is the message name from `@shura/protocol`.
- Connection-level checks (connection limits) go in `handleConnection`, since guards don't run there. Per-message checks are guards.
- **Outbound connections are providers, inbound ones are WS gateway classes.** A connection the service opens itself (the gateway's room links to game pods) is a plain `ws` client owned by a provider, which validates what it receives with the protocol schemas and closes its sockets in `onModuleDestroy`.

## HTTP

- REST routes are controllers under `/api`. Health and metrics (`/livez`, `/readyz`, `/metrics`) are controllers too; they aren't routed publicly (design §9.1).
- Every `/api` request passes the global `VersionGuard` (`Shura-Protocol` and `Shura-Engine` headers, design §8.3).

## Validation and errors

- Every message and request body is a zod schema in `@shura/protocol`, made a DTO with `createZodDto`. The validation pipe (global for HTTP, through `@WsProtocol()` on sockets) rejects invalid input with `invalid_message`. Never define a message's shape in a service.
- Throw `WsException({ code, message })` on sockets and `HttpException({ code, message }, status)` over HTTP. The one exception shared by both is the validation pipe's `InvalidMessageException` (an `HttpException`): `WsExceptionFilter` sends any exception carrying an `ERRORS` body, and anything else as `internal_error`. Every `code` is a key of `ERRORS` in `@shura/protocol`, which also gives its default text and HTTP status. Add new codes there.
- Rate limits use `@RateLimit('<key>')` with `RateLimitGuard`, on controllers and WS handlers alike, backed by `RateLimiter` from `@shura/valkey` (design §11).

## Providers

- Process-wide services are providers. Per-room and per-match objects (a room, a match, its clock) are plain classes that providers create.
- The clock, the Valkey stores and the logger are injected by token, so tests replace them with `overrideProvider`.
- Config comes from `ConfigService`, validated at startup by the service's zod schema. Defaults are safe for production: `NODE_ENV` defaults to `production`, and only the `dev` script sets `development` (pretty logs through `pino-pretty`, a dev dependency). The logger is `nestjs-pino`'s `PinoLogger`, with `roomCode`, `matchId` and `sessionId` added through `assign`.

## Tests

- Tests live in `tests/`, mirroring `src/`, with helpers in `tests/support/` (`CONTRIBUTING.md`).
- Vitest compiles with `unplugin-swc` (decorator metadata), from the service's `.swcrc`.
- Unit-test a service by constructing it, or through `Test.createTestingModule` when it needs the container.
- Integration tests build both apps with `Test.createTestingModule`, override the clock, stores and logger (in-memory Valkey), `app.listen(0)`, and talk to them over real sockets and `fetch`. `faultySocket()` in `tests/support/` holds, releases and drops messages to test reconnects and lag-outs. No test-only code in `src/`.
