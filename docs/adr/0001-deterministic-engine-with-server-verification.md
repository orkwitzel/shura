---
status: accepted
---

# Deterministic engine, optimistic clients, server verification

Every player's board must respond to input instantly, and results must still be impossible to fake. Each client therefore simulates its own board immediately and streams its input to the server. The `game` service re-runs the same `packages/engine` code on that input and alone decides outcomes: clears, attacks, garbage, top-outs and placements. This only works if the engine is bit-exact deterministic: a fixed 60 fps frame clock, seeded PRNGs carried in state, integer math only, and no wall-clock reads. Those rules are what everything else depends on, and they're checked by the replay-hash suite.

## Considered options

- **Client-authoritative (clients report "I cleared 4 lines").** Simplest, but trivially cheatable, and replays would need separate work.
- **Fully server-simulated (clients only display).** Every action waits a full round trip. Unplayable at internet latency.
- **Rollback netcode.** Unnecessary, because boards only interact through garbage, which [ADR 0003](0003-garbage-as-acknowledged-input.md) handles without rollback.

## Consequences

- One engine codebase must run identically on Node and in browsers, which is the main reason for TypeScript everywhere ([ADR 0008](0008-typescript-everywhere.md)).
- Clients can still cheat through **time** (slow motion, stalling). This is closed by clock enforcement: a client's frames may run at most 1 s behind the server's expected frame and never ahead of it, with a lag-out after 3 s.
- Recovery and replays come almost free, because a match is fully described by its seed, settings and input log ([ADR 0007](0007-full-match-log-in-valkey.md)).
