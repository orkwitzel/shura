# Shura

An online multiplayer falling-block puzzle game (guideline rules) with a web client and an Ink terminal client. A TypeScript pnpm + Turborepo monorepo.

## Sources of truth

- `docs/design.md`: how the system works. **Read the relevant section before changing behaviour, and update it in the same PR** whenever behaviour changes.
- `docs/adr/`: decisions that are expensive to reverse. Accepted ADRs are never edited. A reversal is a new ADR that supersedes the old one.
- `docs/glossary.md`: the project's terms. Use them in code, comments and docs.
- `CONTRIBUTING.md`: branch, PR and release rules. Follow them exactly.

## Determinism (packages/engine)

The server re-runs the engine to verify every match, and clients must match it bit for bit. Inside `packages/engine`:

- time is the frame counter only;
- randomness comes only from the seeded PRNGs in engine state;
- game rules use integer arithmetic only (fixed-point for gravity);
- `Math.random`, `Date.now`, `performance.now`, timers and floats in rule logic are never used.

If a change alters game outcomes, bump `ENGINE_VERSION` and re-record the expected hashes of the recorded matches in the same PR (until M1 closes, only the re-record: see `docs/design.md` §5.3). If the replay-hash suite fails, treat that as a real outcome change, never as a flaky test.

## Protocol (packages/protocol)

- Add fields as optional and add new message types freely.
- Renaming, removing or changing the meaning of a message or field is a breaking change: bump `PROTOCOL_VERSION`.

## Package boundaries

- `engine` imports nothing from the workspace.
- Packages never import apps.
- `gateway` and `game` talk only through `protocol` messages and the `packages/valkey` interfaces.
- Internal packages export TypeScript source with no build step.

## Commands

`pnpm dev` (Valkey + services + web), `pnpm cli` (the terminal client, in its own TTY), `pnpm check` (lint + typecheck + test, the same as CI). Run `pnpm check` before declaring work done.

## Agent skills

### Issue tracker

GitHub Issues on `orkwitzel/shura`, via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, each label named after its role. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `docs/glossary.md` plus `docs/adr/`. See `docs/agents/domain.md`.
