# packages/protocol

The zod schemas of every message and HTTP body, plus the constants, error codes and name checks the clients, the gateway and the game service share. Its behaviour is in `docs/design.md` §8.2–§8.3 (transport, versioning), §8.7 (messages and errors), §10.3 (room codes) and §11 (limits, nicknames). This file is about where code goes.

## Layout

```text
src/
├── index.ts              PROTOCOL_VERSION, and the package's whole API
├── constants.ts          clock, room and limit constants (LIMIT_DEFAULTS)
├── errors.ts             ERRORS: every error code with its text and HTTP status
├── messages/             what goes over a socket, as { event, data }
│   ├── envelope.ts       data(), noData() and envelopes(): a record of data schemas → a union on event
│   ├── fields.ts         field schemas several messages share (mode, kind, phase, out reason…)
│   ├── actions.ts        engine actions and frames inside input batches and relays
│   ├── client.ts         client → gateway (clientMessages)
│   ├── server.ts         gateway → client (serverMessages)
│   └── internal.ts       gateway ⇄ game pod, over the per-room link
├── http/                 the /api bodies and the version header names
├── match/                rules the server and the clients both work out: placeAmong (places by frame)
└── names/                what players type: nicknames (with the blocklist file) and room codes
scripts/record-shape.ts   re-records tests/support/protocol-shape.json
```

## Rules

- It imports only `@shura/engine` (its action and state types, and `ActionType`) and `zod`. `src/` typechecks with no Node or DOM types: the schemas run the same in browsers and Node.
- A message is one entry in its group's record (`clientMessages.hello`), built with `data({ … })` so unknown fields pass through. The services make DTOs from these entries (`createZodDto(clientMessages.hello)`); never define a message's shape anywhere else.
- A room-scoped message that also travels on the gateway ⇄ game link is listed in `internal.ts` with `scoped(…)`, which adds `{ roomCode, epoch, sessionId }`.
- A new error code goes in `ERRORS`, with its text and HTTP status.
- The versioning rules are in the root `AGENTS.md`, and they cover the link messages and the HTTP bodies too. `tests/shape.test.ts` holds them mechanically against the stored shape in `tests/support/protocol-shape.json`:
  - a compatible change (a new optional field or message) fails until you re-record with `pnpm --filter @shura/protocol record-shape`;
  - a breaking change fails until you bump `PROTOCOL_VERSION` in `src/index.ts`, then re-record;
  - a field whose meaning changes but whose schema doesn't passes, so that bump is yours to make.

## Tests

- `tests/` mirrors the folders of `src/`, plus `shape.test.ts`. Helpers go in `tests/support/`: `round-trip.ts` checks a group of messages against `examples.ts`, which has valid and malformed `data` for every message. A new message needs its examples there.
- `tests/` and `scripts/` typecheck under `tsconfig.test.json`.
