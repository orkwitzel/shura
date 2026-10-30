# Shura design

Shura (Hebrew שורה, "row") is an online multiplayer falling-block puzzle game that follows the modern guideline rules. It has a web client and a terminal client.

This document is the source of truth for how the system works. It describes the system **as it is meant to be**, and it changes in the same pull request as any code that changes the behaviour it describes. Decisions that are expensive to reverse are recorded in [`adr/`](adr/), and terms are defined in [`glossary.md`](glossary.md). The interactive [architecture report](https://claude.ai/artifact/3EnAy6cCCW2VUC1ByKny2c) is a visual companion to the backend sections. Where they differ, this document wins.

Status: designed, no code yet (October 2026).

---

## 1. Scope

**In v1**

- Modes: Marathon, Sprint and Ultra (single-player, offline), plus 1v1 and FFA for up to 8 players (online).
- Modern guideline rules: SRS, 7-bag, hold, ghost, T-spins, back-to-back, combos and garbage. See §3.
- Anonymous online play: a nickname plus a session token. Rooms are joined by code, and there is a 1v1 quick-match queue.
- Clients: web (React + canvas) and CLI (Ink), both installed or loaded the same way for everyone.
- Backend: stateless `gateway` service, stateful `game` service, Valkey.
- Durability groundwork: a full input log per match written to Valkey (§9.6). Crash recovery that reads it comes in phase 2.

**Not in v1** (see §16 for the full list): accounts, a database, leaderboards and replays, Battle Royale, Co-op, classic (NES) rules, player-chosen FFA targeting, a standalone CLI binary, automated cluster deployment, crash failover.

---

## 2. Repository layout

A pnpm workspace monorepo run with Turborepo.

```
apps/
  web/          React + Vite client; boards drawn on <canvas>
  cli/          Ink terminal client; published to npm as `shura`
  gateway/      service: public WebSocket, room and quick-match HTTP API, forwarding to game pods
  game/         service: hosts rooms; verification engines, clock, garbage, relay, match log
packages/
  engine/       deterministic game rules (used by game, web, cli)
  protocol/     zod schemas: client⇄gateway and gateway⇄game messages, version constants, limits
  client-core/  shared client logic: connection, room store, game loop, input engine, settings, single-player
  valkey/       Registry, MatchQueue, SessionStore, PodHealth, MatchLog interfaces; Valkey and in-memory versions
  tsconfig/     shared TypeScript config
docs/           this file, adr/, glossary.md
deploy/         (later) Kubernetes manifests
```

Dependency rules:

- `engine` depends on nothing in the workspace.
- `protocol` may import `engine` types.
- Apps depend on packages. Packages never depend on apps.
- `gateway` and `game` communicate only through `protocol` messages and Valkey.
- Internal packages export **TypeScript source** (`"exports": { ".": "./src/index.ts" }`) and have no build step. See [ADR 0010](adr/0010-source-only-internal-packages.md).

---

## 3. Game rules

The engine implements these rules. Every value is a field in the **mode settings** (§4). Changing any value that affects outcomes bumps `engineVersion` (§8.3).

| Area | Rule |
|---|---|
| Board | 10 wide × 40 tall: 20 visible rows plus 20 hidden above. |
| Spawn | Pieces spawn in rows 21–22 and drop one row immediately if possible. |
| Randomizer | 7-bag, seeded. In versus, every player in a match gets the **same piece sequence** (one seed per match). |
| Rotation | SRS with the standard kick tables. The 180° rotation uses TETR.IO's SRS+ 180 kick table. |
| Hold | One hold slot, usable once per piece. |
| Preview | 5 next pieces. |
| Ghost | Shown by default (a client setting). |
| Lock delay | 30 frames (0.5 s). Moving or rotating resets it, up to 15 resets per piece. The reset counter clears when the piece reaches a new lowest row. |
| Gravity | Marathon: the guideline gravity curve by level. Sprint/Ultra: 1 row/s. Versus: starts at 1 row/s and speeds up slowly over the match. |
| Soft / hard drop | Soft drop multiplies gravity by the player's soft-drop factor (handling, §7.2). Hard drop places and locks the piece immediately. |
| Top-out | Block out (a new piece overlaps the stack when it spawns), lock out (a piece locks entirely above row 20), or garbage pushes the stack past row 40. |
| T-spin detection | 3-corner rule, full or mini. Only the T piece spins in v1. |
| Scoring (single-player) | Guideline points for clears, T-spins, back-to-back, combos, perfect clears, soft and hard drops. |
| Attack table | Single 0 · Double 1 · Triple 2 · Tetris 4 · T-spin mini 0 (single 1, by convention) · T-spin single 2 · T-spin double 4 · T-spin triple 6 · back-to-back +1 · perfect clear 10. Combo bonus by combo count: 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5… |
| Garbage cancellation | Lines you send cancel your incoming garbage first. Only the remainder is sent to an opponent. |
| Garbage entry | Incoming garbage lands at your next piece lock that clears no lines (§8.5), at most **8 lines per lock**. The rest stays queued. |
| Garbage holes | The hole stays in one column within an attack and moves to a random seeded column between attacks. Each player's garbage RNG is seeded separately. |
| Margin time | From 120 s into a versus match, the attack multiplier grows by ×0.25 every 30 s (1.25, 1.5, …). This ends stalemates and bounds match log size. |

**Not in v1:** initial rotation/hold while the next piece is entering, all-spin detection (spins by pieces other than T), Tetris-99-style badges and targeting.

---

## 4. Modes

| Mode | Players | Where it runs | Ends when | Notes |
|---|---|---|---|---|
| Marathon | 1 | client, offline | top-out (or level cap) | Guideline gravity curve, levels every 10 lines |
| Sprint | 1 | client, offline | 40 lines cleared | Timed. Personal best stored locally |
| Ultra | 1 | client, offline | 2 minutes elapsed | Score. Personal best stored locally |
| 1v1 | 2 | online, server-verified | one player tops out | Quick-match or room code |
| FFA | 3–8 | online, server-verified | one player remains | Room code only. Garbage goes to a random living opponent, chosen by the match RNG |

A mode is a **preset**: a mode settings object (the rule values from §3) plus a small amount of mode-specific logic (end conditions, gravity curve, targeting). Players can't change individual rules. The rotation system and randomizer sit behind interfaces so a classic mode can be added later without restructuring the engine.

FFA targeting lives in one server function (`chooseTarget`). Player-chosen targeting (Tetris 99 style) would add one new action and a different function, with no other protocol change.

---

## 5. Engine

`packages/engine` is a pure, deterministic library. The client runs it optimistically, the server re-runs it to verify, and opponents' boards are simulated with it.

### 5.1 Determinism rules

These are what make server verification and replay work. They're enforced by tests and review:

- Fixed tick: the engine advances in **frames** at 60 fps of game time. It never reads wall-clock time.
- No `Math.random`. All randomness comes from seeded PRNGs carried in engine state (match seed → bag RNG, plus a per-player garbage RNG).
- No `Date.now`, `performance.now` or timers inside the engine.
- Integer arithmetic only for game rules. Gravity is expressed as fixed-point sub-row counters, not floats.
- No dependence on object key order, `Map` iteration order of external input, or locale.
- The same inputs and seed always produce the same state, bit for bit, on Node and in browsers.

### 5.2 Shape

- `createEngine(modeSettings, seed, playerIndex) → Engine`
- `engine.step(frame, actions[])` advances to `frame`, applying the actions that occurred at each frame.
- `engine.state` is read-only: board, active piece, hold, queue, garbage meter, stats, and whether the player has topped out.
- `engine.serialize() → EngineState` and `Engine.restore(state)` produce and consume plain data. They're used for join and reconnect snapshots (§8.6) and in tests.
- `engine.hash()` is a stable hash of the full state, used by the replay-hash tests and for debugging.
- Pure helpers, exported and unit-tested: SRS kick lookup, T-spin detection, the attack calculator, garbage cancellation.

### 5.3 Replay-hash test suite

`packages/engine` keeps a set of **recorded matches** (seed, mode, the per-player action log) along with the expected final `hash()` of each. CI replays all of them:

- If a hash changes and `engineVersion` did not change, CI fails.
- Changing game outcomes therefore requires bumping `engineVersion` and re-recording the expected hashes in the same PR.
- The same suite checks determinism: it replays in Node and asserts identical results across runs.

---

## 6. Modes run locally vs. online

- **Single-player** modes run entirely inside `client-core`, so they work offline and never contact the server.
- **Online** modes run the same engine optimistically in the client, while the `game` service re-simulates every player authoritatively (§8).

---

## 7. Input and controls

### 7.1 Actions

The engine and the server only see **atomic actions**, each tagged with a frame number. See [ADR 0002](adr/0002-atomic-actions-in-the-input-stream.md).

`moveLeft`, `moveRight`, `rotateCW`, `rotateCCW`, `rotate180`, `hold`, `hardDrop`, `softDropOn`, `softDropOff`, `garbageAccepted{id}`

Auto-repeat (DAS/ARR) and soft-drop speed are turned into these actions on the client. The server never knows how a player's keys are tuned. The trade-off is accepted: the server can't tell a human from a script sending perfect moves.

### 7.2 Handling (client settings)

| Setting | Default | Range |
|---|---|---|
| DAS (delay before auto-repeat) | 167 ms (10 frames) | 0–333 ms |
| ARR (auto-repeat interval) | 33 ms (2 frames) | 0 (instant) – 83 ms |
| Soft-drop factor | ×20 | ×5 – instant |

### 7.3 Input engine and adapters

`client-core` contains the **input engine**, a state machine for DAS, ARR and soft drop that runs on the game frame clock. It consumes key signals and emits actions. Each UI feeds it through an adapter:

- **Web adapter:** `keydown` / `keyup`, with browser key repeat ignored.
- **CLI precise adapter:** Ink 8 with the Kitty keyboard protocol (`kittyKeyboard: { mode: 'auto', flags: ['disambiguateEscapeCodes', 'reportEventTypes'] }`). This gives real press, repeat and release events. It's used when `key.eventType` is present.
- **CLI basic adapter:** for terminals without release events (GNOME Terminal/VTE, Konsole, anything inside tmux). The first press moves once, and the OS key-repeat stream then drives repeated movement. A release is assumed after about 2× the repeat interval with no events (longer before the first repeat, about 500 ms). Precise DAS/ARR settings don't apply in this mode.
- The CLI chooses an adapter automatically from the first key event and shows it in the status line (`input: precise` / `input: basic`). `--input precise|basic` overrides the choice.

Terminals known to report key releases (as of Oct 2026): kitty, foot ≥ 1.10.3, Alacritty ≥ 0.13, Ghostty, iTerm2, Windows Terminal ≥ 1.25, and WezTerm with `enable_kitty_keyboard = true`.

### 7.4 Default key bindings

| Action | Web | CLI |
|---|---|---|
| Move left / right | ← / → | ← / → |
| Soft drop | ↓ | ↓ |
| Hard drop | Space | Space |
| Rotate CW | ↑, X | ↑, X |
| Rotate CCW | Z, Ctrl | Z |
| Rotate 180° | A | A |
| Hold | C, Shift | C |
| Pause / menu (single-player) | Esc, P | Esc, P |
| Restart (Sprint/Ultra) | R | R |

Terminals can't report Ctrl or Shift on their own, so the CLI defaults leave them out. Binding a key that's already in use swaps the two actions.

---

## 8. Netcode

See [ADR 0001](adr/0001-deterministic-engine-with-server-verification.md) and [ADR 0003](adr/0003-garbage-as-acknowledged-input.md).

### 8.1 Model

- Each client simulates **its own board** immediately (optimistically), with zero input latency.
- The client sends **input batches**: the actions with their frame numbers, about every 3 frames (~20 batches/s). Each batch carries a **sequence number**.
- The `game` service re-runs every player's engine on the received batches. The server alone decides outcomes: line clears, attacks sent, garbage, top-outs and placements. Clients never claim outcomes.
- The server **acknowledges** each batch by sequence number once it has been verified and appended to the match log (§9.6). Clients keep unacknowledged batches and resend them after reconnecting.
- Verified batches are **relayed** to the other players in the room, combined per tick into one message per recipient.

### 8.2 Transport

- Raw WebSocket (`ws` on the server; the native `WebSocket` in browsers and in Node for the CLI) carrying JSON text messages.
- Every message is validated with a zod schema from `packages/protocol` on receipt. Unknown fields are tolerated (`passthrough`), so adding fields stays backward compatible.
- `permessage-deflate` is off. `bufferutil` is installed on the server.

### 8.3 Versioning

See [ADR 0006](adr/0006-strict-version-handshake.md).

- `protocolVersion` (an integer) changes only on **breaking** message changes, such as a renamed or removed message or a field whose meaning changes. New optional fields and new message types that old clients can ignore don't change it.
- `engineVersion` (an integer) changes only when **game outcomes** change. The replay-hash test (§5.3) decides this mechanically.
- Clients open with `hello{ protocolVersion, engineVersion, clientVersion, sessionToken? }`. The gateway rejects any mismatch with an explicit error that includes what to do. The CLI shows `npm i -g shura@latest`, and the web reloads.
- Game pods publish their `engineVersion` in their heartbeat. Rooms are placed only on pods with a matching version, so during a rolling deploy, running rooms finish on old pods and new rooms go to new pods.
- Single-player works offline whatever the version.

### 8.4 Clock enforcement

The one thing a client controls is time (slow motion, stalling). The rule is:

- At match start the server sends `startAt` (server time) and the countdown. Expected frame = `(now − startAt) × 60`, minus a latency allowance.
- A client's batch frames may run **at most 1 s behind** the expected frame and **never ahead** of it.
- Behind the window for more than **3 s** means the player has **lagged out** and counts as topped out.
- A batch ahead of the expected frame is rejected, and the player is removed from the match.
- This rule also detects silent disconnects during a match. No separate in-match heartbeat is needed.
- These constants live in `packages/protocol`.

### 8.5 Garbage delivery

Garbage is the only interaction between boards, and it has to reach the victim's board deterministically even though every client runs ahead of the server:

1. The attacker's verified clear produces an attack. The server cancels it against the attacker's own incoming queue, then picks a target (1v1: the opponent; FFA: `chooseTarget`, random by the match RNG).
2. The server sends the target `garbageQueued{ id, lines, holeSeed }`. The client adds it to its garbage meter.
3. The client's engine applies queued garbage at its next piece lock that clears no lines (at most 8 lines per lock), and records `garbageAccepted{ id }` in its own action stream at that frame.
4. The server's replay applies the garbage at exactly that frame, so client and server stay identical without any rollback.
5. **Timeout:** if a client hasn't accepted garbage within `GARBAGE_ACK_TIMEOUT` (initially 10 s of game time after the frame at which it was queued), the server treats the player as lagged out. The server never inserts garbage itself, because that would break determinism.

### 8.6 Opponent boards and snapshots

- Each client runs **one engine per opponent**, fed with the verified, relayed input batches. Opponent boards therefore show exactly what the server computed, about one network delay behind real time.
- **Snapshots** (each player's `engine.serialize()` at a frame) are sent only when a client **joins or reconnects** mid-match. The client restores from them and keeps applying relayed batches from that frame onward.
- There is no desync detection, checksumming or rollback in v1. Relayed inputs are already verified, so drift could only come from an engine bug, which the replay-hash tests are meant to catch.
- Spectators use exactly this path.

### 8.7 Messages (initial list)

The authoritative definitions are the zod schemas in `packages/protocol`. This list is the starting set.

**Client → gateway:** `hello`, `setNickname`, `createRoom{mode}`, `joinRoom{code}`, `leaveRoom`, `quickMatch`, `cancelQuickMatch`, `ready`, `startMatch` (host only), `inputBatch{seq, frames:[{frame, actions}]}`, `ping`

**Gateway → client:** `welcome{sessionToken, serverTime}`, `error{code, message}`, `roomState{code, mode, hostId, players, phase}`, `quickMatchQueued`, `countdown{startAt, seed, matchId}`, `snapshot{frame, players:[EngineState]}`, `batchAck{seq}`, `relay{playerId, frames}`, `garbageQueued{id, lines, holeSeed}`, `playerOut{playerId, reason, placement}`, `matchEnd{placements, stats}`, `pong{serverTime}`

**Gateway ⇄ game (internal):** the room-scoped messages above, wrapped with `{roomCode, epoch, sessionId}`, plus `createRoom`, `attach`, `detach`, `drain`.

---

## 9. Backend

See [ADR 0004](adr/0004-gateway-and-game-services-with-valkey.md) and [ADR 0005](adr/0005-gateway-forwards-to-game-pods.md).

### 9.1 Services

```
            ┌──────── Gateway API (one public origin, TLS) ────────┐
            │  /        → shura-web   (static Vite build)           │
            │  /api,/ws → gateway     (stateless, N pods)           │
            └───────────────────────────────────────────────────────┘
gateway ──(internal WS, per room)──▶ game pod that owns the room (stateful, M pods)
gateway, game ──▶ Valkey (registry, queue, sessions, pod health, match logs)
```

- **gateway** (stateless, scales freely):
  - terminates player WebSockets and handles the room and quick-match API;
  - looks up `room → pod` and forwards each room's traffic to the game pod that owns it, reusing one internal connection per room;
  - enforces the abuse limits (§11) and serves `/livez`, `/readyz` and `/metrics` on an internal port.

  If a gateway pod dies, its players reconnect to any other gateway with their session token.
- **game** (stateful):
  - hosts many rooms in memory; each room lives on **exactly one** game pod for its whole life;
  - per room: the verification engines, clock enforcement, garbage, relay, results and log appends;
  - writes a heartbeat to Valkey every 2 s (TTL 5 s) with its pod IP, port, room count and `engineVersion`.
- **shura-web**: a static server (nginx or Caddy) holding the Vite build. Hashed assets are cached long, and `index.html` is never cached.

Players are never "on" a game pod; rooms are. Two players matched through different gateways end up in the same room, so on the same game pod.

### 9.2 Room placement

New rooms go to the **least-loaded live game pod with a matching `engineVersion`**, using room counts from the heartbeats. The gateway records `room → {pod address, epoch}` in Valkey. Game pods register their own pod IP, so they need no StatefulSet or per-pod DNS.

### 9.3 Ownership epoch

Every room assignment carries an **epoch** number, incremented whenever the room changes owner. Game pods tag their log appends with it. In v1 the epoch is only recorded. In phase 2, appends with a stale epoch are rejected (fencing, §9.7).

### 9.4 Quick-match

- The queue is a Valkey list or sorted set shared by all gateways.
- On `quickMatch`, the gateway atomically pops a waiting partner with a Lua script. If none is waiting, it enqueues the player.
- When a pair forms, the pairing gateway creates the room (§9.2), and a Valkey pub/sub message tells the waiting player's gateway to attach them.
- Quick-match rooms have no host and start automatically. 1v1 only.
- Each session can have one queue entry. Leaving and rejoining quickly triggers a short cooldown.

### 9.5 Valkey usage

Accessed only through `packages/valkey` interfaces, using `iovalkey`. Initial key layout:

| Key | Type | Content | TTL |
|---|---|---|---|
| `room:{code}` | hash | pod address, epoch, mode, phase, settings, host | deleted with the room |
| `qm:1v1` | list / zset | waiting session ids | n/a |
| `session:{token}` | hash | session id, nickname, current room | ~30 min sliding |
| `pod:{id}` | hash | address, room count, engineVersion, draining | 5 s, refreshed every 2 s |
| `log:{matchId}` | stream | seed + settings entry, then one entry per room every 100 ms of verified batches (tagged with epoch) | deleted at match end |
| `rl:*` | counters | rate-limit buckets per IP / session | short |

In production Valkey runs with a replica and failover (Sentinel or a managed service; deferred), with AOF `everysec`.

### 9.6 Match log

See [ADR 0007](adr/0007-full-match-log-in-valkey.md).

- At match start, `game` writes the seed, mode settings and player list as the first entry of `log:{matchId}`.
- Every 100 ms it appends one entry per room containing all players' newly verified batches. That's about 10 appends/s per room, pipelined.
- A batch is acknowledged to its client only after the append containing it succeeds.
- The log is **complete**: no checkpoints and no trimming. Approximate sizes: a 3-minute 1v1 ≈ 0.7 MB, a 3-minute 8-player FFA ≈ 2.9 MB, 1,000 concurrent rooms ≈ 0.5–1 GB at peak. Margin time keeps matches bounded.
- At match end the log is deleted. Once accounts and a database exist, it's copied to the database first, for replays, disputes and cheat review.

### 9.7 Shutdown and failure (v1 vs phase 2)

**v1:**
- On SIGTERM, a game pod fails `/readyz`, marks itself `draining` in its heartbeat (so it gets no new rooms), and **finishes its running matches** before exiting. `terminationGracePeriodSeconds` is about 600.
- A game pod crash loses its in-progress matches. Players get a "match aborted" result and return to the room lobby. Lobby state survives because it's stored in Valkey.

**Phase 2 (designed now, built after v1):**
- Gateways detect a dead pod (expired heartbeat) and atomically claim its rooms, incrementing each room's epoch.
- The new owner replays the seed and log with the engine up to the last recorded frame. The room is in a `recovering` state while this happens, and the lag-out clock is paused.
- Clients reconnect (session token), receive a snapshot and resend their unacknowledged batches.
- **Fencing:** log appends go through a Lua script that rejects stale epochs, and a pod that can't renew its heartbeat stops its own rooms.
- Deploys hand rooms off through the same path instead of waiting for matches to finish.
- A Valkey failover can drop up to ~1 s of appends. If that coincides with a pod crash, the match is declared a no-contest.

---

## 10. Rooms and matches

### 10.1 Lifecycle

```
lobby ──(host starts, ≥ 2 ready)──▶ countdown (3 s) ──▶ playing ──(one left)──▶ results ──▶ lobby
```

- The **host** (whoever created the room) picks the mode (1v1, or FFA for up to 8) and starts the match. If the host leaves, the player who has been there longest becomes host. Quick-match rooms have no host and start automatically.
- An empty room is deleted after 60 s.
- **Rematch:** after results, the room returns to the lobby with the same players, and everyone readies up again.
- **Results:** placements plus simple server-computed stats (lines sent, pieces per second).

### 10.2 Identity and reconnects

- On `hello` the server issues a random **session token**. The web client keeps it in `sessionStorage`, and the CLI in memory.
- Reconnecting with the token restores the same seat and nickname.
- Disconnected **in the lobby:** the seat is held for 30 s.
- Disconnected **during a match:** the 3 s lag-out rule applies (§8.4). A player who returns before the match ends **spectates** the rest of it and plays in the next round.
- **Late joiners** spectate until the next round.

### 10.3 Room codes

4 characters from a 31-character alphabet with ambiguous characters removed (`0/O`, `1/I/L`). That's about 920k codes. Codes are shown as text and as a link (`/r/K7QX`). Private rooms can optionally use 6-character codes.

---

## 11. Abuse protection

All limits are enforced in the gateway (the only public entry point) and set through its environment config.

| Threat | Protection |
|---|---|
| Oversized / malformed messages | `maxPayload` 16 KB. Every message is validated with zod. 3 invalid messages → disconnect |
| Message floods | Token bucket per connection: 60 msg/s, burst 120 |
| Connection floods | Per IP: 10 concurrent connections, 30 new per minute. Counted in Valkey, so the limits hold across gateway pods |
| Room spam | 3 rooms created per minute per IP. 1 hosted room per session |
| Room-code guessing | 10 failed joins per minute per IP |
| Nicknames | 1–16 characters: Unicode letters (Hebrew included), digits, `_`, `-`, spaces. NFC-normalized, control and zero-width characters stripped, plus an extendable blocklist file. Duplicates in a room get `#2` |
| Quick-match | One queue entry per session, with a cooldown on rapid requeueing |
| Cheating | Server re-simulation (§8.1), clock enforcement (§8.4), version handshake (§8.3) |

Client IPs come from `X-Forwarded-For`, trusted only from the cluster's own load balancer. Network-level DDoS protection is left to the hosting provider or a CDN/WAF.

---

## 12. Observability

- **Health:** `/livez` (process alive) and `/readyz` (Valkey connected, not draining) on an internal port.
- **Logs:** pino JSON to stdout, with `service`, `pod`, and where relevant `roomCode`, `matchId` and `sessionId`. `pino-pretty` in dev. Inputs and nicknames are never logged at info level.
- **Metrics:** Prometheus format via `prom-client` on `/metrics`.
  - **gateway:** connections, messages/s, rate-limit rejections, quick-match queue length and wait time, forwarding errors.
  - **game:** rooms hosted, active matches, batches/s, verification time per batch, clock violations, lag-outs, log-append latency, garbage-ack timeouts.
  - **both:** event-loop delay, memory, GC.
- **Tracing:** none in v1.

---

## 13. Clients

### 13.1 client-core

UI-free TypeScript shared by web and CLI:

- the connection (with reconnect and session token);
- the room/match store;
- the 60 fps game loop and engine instances (your own board plus one per opponent);
- input batching, unacknowledged-batch resend and garbage handling;
- the input engine (§7.3);
- settings (zod schema with a `version` field, migrated on load);
- single-player sessions and local personal bests.

It exposes a subscribable store (`getState()`, `subscribe()`). Both UIs connect to it with a `useSyncExternalStore` hook.

### 13.2 Web

- React + Vite, plain CSS (no component library).
- Each board is a `<canvas>` redrawn on `requestAnimationFrame` directly from client-core state, outside React's render cycle. React renders menus, lobby, settings and results.
- Settings and personal bests are stored in `localStorage`.
- Simple sound effects with an on/off setting, plus a board skin option.
- UI text is in English. Nicknames in any script, Hebrew included, display correctly.
- In dev, Vite forwards `/api` and `/ws` to the gateway, so the browser sees one origin.

### 13.3 CLI

- **Your board:** 10×20 cells, each 2 characters wide (`██`), with hold on the left and the 5-piece preview on the right.
- **Opponent boards:** half-block characters (`▀`/`▄` with foreground/background colors), so each takes 10×10 characters plus a name and garbage meter. Up to 7 fit beside your board on a ~120×30 terminal. Smaller terminals show opponents as a list (name, stack height, alive or out).
- **Minimum size:** 80×24. Below that the CLI shows "please enlarge the terminal".
- **Color:** 24-bit when supported, otherwise the 16 ANSI colors. `--no-color` / `NO_COLOR` draws cells as glyphs instead.
- **Rendering:** Ink renders at about 30 fps, while the game logic stays at 60 fps in client-core. Each board is turned into one pre-colored string per row and drawn as a single `<Text>` per row, never one component per cell.
- **Silent:** no sound.

**Distribution:** the npm package `shura`, a single bundled file with no runtime dependencies, requiring Node ≥ 26. Run with `npx shura` or `npm i -g shura`. There's no standalone binary for now (§16).

**Commands:**

```
shura                         interactive menu (Play online, Single player, Settings, Quit)
shura quick                   join the 1v1 quick-match queue
shura create [--mode ffa]     create a room; prints code and link
shura join <CODE>             join a room
shura solo sprint|marathon|ultra
shura --version | --help
global flags: --server <url>  --name <nickname>  --input precise|basic  --no-color
```

**Config:** `~/.config/shura/config.json` (XDG; `%APPDATA%\shura` on Windows) holds the nickname, bindings, handling, server URL and personal bests. Server precedence: `--server` > `SHURA_SERVER` > config file > production default compiled into the build.

**Update check:** at most once a day, a non-blocking request to the npm registry. If a newer version exists, a one-line notice appears in the menu. `SHURA_NO_UPDATE_CHECK=1` disables it.

---

## 14. Tooling and development

| Concern | Choice |
|---|---|
| Package manager | pnpm workspaces, version pinned via the `packageManager` field + corepack (installed from npm, since Node 25+ doesn't bundle it). Versions shared by several packages live in the `catalog:` in `pnpm-workspace.yaml`. Install scripts run only for packages listed under `allowBuilds` |
| Task runner | Turborepo (task graph and caching, with the cache shared to CI through the Actions cache) |
| Language / runtime | TypeScript (strict), ESM only, Node 26 LTS |
| Internal packages | Source-only, no build step. `typecheck` = `tsc --noEmit` per package, cached by Turbo |
| App builds | `gateway`, `game`, `cli`: esbuild → one unminified JS file + source map, run with `--enable-source-maps`. `web`: Vite |
| Docker images | `node:26-slim` + the bundle (+ source map). Native optional dependencies such as `bufferutil` are left out of the bundle and installed in the image |
| Tests | Vitest everywhere, with one workspace config and a project per package. Ink components via `ink-testing-library`, web via Testing Library. Playwright end-to-end tests come later |
| Lint / format | Biome (`biome.json` at the root) for code, JSON, YAML and CSS. Markdown is excluded, because Biome's Markdown formatter rewrites YAML frontmatter |
| Git hooks | lefthook: Biome on staged files before commit. Before push: reject pushes to `main` and branch names that don't match the convention. The allowed types and scopes live in `scripts/conventions.sh`, which both the hook and CI read |
| Service config | Environment variables validated at startup by a zod schema in each service. `.env.example` is committed |

**Dev workflow:**

```
pnpm dev        docker compose up -d valkey  →  turbo dev:
                gateway :8080 (tsx watch) · game :8081 (tsx watch) · web :5173 (Vite, forwards /api and /ws)
pnpm cli        Ink client in its own terminal (needs a real TTY); defaults to ws://localhost:8080
pnpm dev:game2  second game instance on :8082 to test multi-pod behaviour
pnpm check      Biome + typecheck + test across the repo (the same command CI runs)
```

Integration tests run `gateway` and `game` in one process against the in-memory `valkey` versions, so they don't need Docker.

---

## 15. Repository conventions, CI/CD and releases

The full rules for contributors are in [`CONTRIBUTING.md`](../CONTRIBUTING.md). Summary:

- **Branches:** `<type>/<scope>-<short-description>`. CI checks them against the pattern below. Bot branches (`changeset-release/main`, `dependabot/*`) are exempt.

  ```
  ^(feat|fix|refactor|perf|test|docs|chore|ci|build)/(engine|protocol|client-core|valkey|gateway|game|web|cli|repo|deploy)-[a-z0-9]+(-[a-z0-9]+)*$
  ```
- **PR titles:** Conventional Commits, `type(scope): imperative summary`, lowercase, ≤ 72 characters, with `!` for breaking changes. Checked by `amannn/action-semantic-pull-request`.
- **PR descriptions:** the required template (Summary, Why, Changes, Testing, Versioning checklist, Screenshots). A CI check fails if any section is empty.
- **Merging:** squash only, so the PR title becomes the commit on `main`.
- **`main` ruleset, with no bypass for anyone:**
  - every change goes through a PR;
  - required checks: `check`, `branch-name`, `pr-title`, `pr-body`, image builds;
  - linear history, no force pushes, no deletion;
  - review conversations resolved before merging;
  - required approvals 0 while the project is solo, 1 once someone else joins.
- **CI** (GitHub Actions):
  - **every PR:** `pnpm install` (cached), `pnpm check`, Docker image builds (not pushed);
  - **on merge to `main`:** push `shura-gateway`, `shura-game` and `shura-web` to `ghcr.io`, tagged with the commit SHA.
- **Releases:** Changesets. User-facing PRs include a changeset. The "Version packages" PR bumps versions, writes changelogs, publishes `shura` to npm with provenance, and tags images with the version.
- **Supply chain:** Dependabot, `pnpm audit` in CI, pinned action versions.
- **License:** AGPL-3.0-only. See [ADR 0011](adr/0011-agpl-license.md).

---

## 16. Deferred and future work

| Item | When / trigger |
|---|---|
| Crash failover, fencing, replay recovery, deploy handoff | Phase 2, after v1 (§9.7) |
| Kubernetes manifests (`deploy/`) and deploy automation (e.g. Argo CD) | When a cluster exists |
| Where Valkey runs (managed vs in-cluster with Sentinel) | Deploy time. The code is the same either way |
| Domain name | Before M6 (the CLI compiles in the default server URL) |
| Standalone CLI binary (Node SEA, CI matrix, GitHub Releases) | When there's demand |
| Accounts, database, leaderboards, replays, log archive, ratings | Future. The match log is already complete for this |
| Player-chosen FFA targeting | Future. One new action plus a new `chooseTarget` |
| Classic (NES) rules mode | Future. Rotation and randomizer are pluggable |
| Battle Royale, Co-op | Future. Co-op breaks the one-player-one-board assumption |
| FFA quick-match | Future |
| UI localisation | Future. English only for now |
| OpenTelemetry tracing | When needed |
| Playwright end-to-end tests | Once the UI stabilises |

---

## 17. Roadmap (v1)

| # | Milestone | Done when |
|---|---|---|
| M0 | Repo skeleton: tooling, empty packages and apps, CI, `main` ruleset, lefthook, docs, Docker Compose with Valkey | `pnpm check` passes in CI, and a non-conforming branch or PR is rejected |
| M1 | Engine: rules from §3, `serialize`/`restore`/`hash`, replay-hash suite | The rules are tested, and recorded matches replay to their expected hashes |
| M2 | CLI single-player: client-core loop + input engine, both adapters, Ink board rendering, the three modes, config file | Sprint is playable offline via `pnpm cli` |
| M3 | Web single-player: canvas board rendering, settings, the three modes | The same game in the browser |
| M4 | Multiplayer core: protocol + handshake, gateway, game, match log, session tokens, reconnect, spectating, limits | A 1v1 and an FFA between web and CLI on a laptop, with every match verified by the server |
| M5 | Multi-pod and operations: heartbeats and placement, `dev:game2`, health/metrics/logs, the three images, first capacity benchmark | Two game pods share rooms correctly, and the images run under Compose |
| M6 | Release: Changesets, npm publish, README, self-hosting notes | `npx shura` works for anyone |

---

## 18. Capacity notes (estimates, to be benchmarked in M5)

| Load | 1v1 room | 8-player FFA |
|---|---|---|
| Input batches in | 40/s | 160/s |
| Relay messages out (combined per tick) | 40/s | 160/s |
| Verification engines | 2 | 8 |
| Valkey appends | 10/s | 10/s |
| Match log after 3 min | ≈ 0.7 MB | ≈ 2.9 MB |

The target is a few hundred rooms per game pod. Scale game pods on room count and gateways on CPU.
