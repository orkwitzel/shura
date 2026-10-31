# Shura design

Shura (Hebrew שורה, "row") is an online multiplayer falling-block puzzle game that follows the modern guideline rules. It has a web client and a terminal client.

This document is the source of truth for how the system works. It describes the system **as it is meant to be**, and it changes in the same pull request as any code that changes the behaviour it describes. Decisions that are expensive to reverse are recorded in [`adr/`](adr/), and terms are defined in [`glossary.md`](glossary.md). The interactive [architecture report](https://claude.ai/artifact/3EnAy6cCCW2VUC1ByKny2c) is a visual companion to the backend sections. Where they differ, this document wins.

Status (October 2026): M0 skeleton, M1 engine and M2 CLI single-player done. M3 web single-player is built and awaits its manual real-browser checklist ([#51](https://github.com/orkwitzel/shura/issues/51), [checklist](web-browser-checklist.md)). M4 multiplayer is designed (§8–§13, the [match screens mockup](https://claude.ai/artifact/Pijgo3kT79ydG7hCRT31f2)) and next.

---

## 1. Scope

**In v1**

- Modes: Marathon, Sprint and Ultra (single-player, offline), plus 1v1 and FFA for up to 8 players (online).
- Modern guideline rules: SRS, 7-bag, hold, ghost, T-spins, back-to-back, combos and garbage. See §3.
- Anonymous online play: a nickname plus a session token. Rooms are joined by code, and there is a 1v1 quick-match queue.
- Clients: web (React + PixiJS, desktop browsers with a keyboard) and CLI (Ink), both installed or loaded the same way for everyone. They share themes, skins and settings through client-core (§13.1).
- Backend: stateless `gateway` service, stateful `game` service, Valkey.
- Durability groundwork: a full input log per match written to Valkey (§9.6). Crash recovery that reads it comes in phase 2.

**Not in v1** (see §16 for the full list): accounts, a database, leaderboards and replays, Battle Royale, Co-op, classic (NES) rules, player-chosen FFA targeting, touch controls, a standalone CLI binary, automated cluster deployment, crash failover.

---

## 2. Repository layout

A pnpm workspace monorepo run with Turborepo.

```
apps/
  web/          React + Vite single-page app; boards drawn with PixiJS
  cli/          Ink terminal client; published to npm as `shura`
  gateway/      service: public WebSocket, room and quick-match HTTP API, forwarding to game pods
  game/         service: hosts rooms; verification engines, clock, garbage, relay, match log
  bot/          testing tool only: headless bot players that join rooms through the gateway (never deployed, §13.4)
packages/
  engine/       deterministic game rules (used by game, web, cli)
  protocol/     zod schemas: client⇄gateway and gateway⇄game messages, version constants, limits, clock constants,
                nickname validation
  client-core/  shared client logic: connection, room store, game loop, input engine, settings, themes, single-player;
                Zustand stores, with shared React hooks under `@shura/client-core/react`
  valkey/       Registry, MatchQueue, SessionStore, PodHealth, MatchLog, RateLimiter interfaces; Valkey and in-memory
                versions
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
| Spawn | Pieces spawn flat side down in rows 21–22 and drop one row immediately if possible. I and O spawn in the middle columns (I in 4–7, O in 5–6), the rest in the left-middle columns 4–6. |
| Randomizer | 7-bag, seeded. In versus, every player in a match gets the **same piece sequence** (one seed per match). |
| Rotation | SRS: the guideline rotation states and the standard kick tables, one for J, L, S, T and Z and one for I. The 180° rotation uses TETR.IO's SRS+ 180 kick table, which has its own shorter list for I. O turns in place and never kicks. A rotation tries the turn in place, then each kick in order, and takes the first position that fits; if none fits, the piece doesn't turn. |
| Hold | One hold slot, usable once per piece and again after the next lock. Holding swaps the active piece with the held one, or with the next piece from the queue if the slot is empty. The piece that comes in spawns as a new piece. |
| Preview | 5 next pieces. |
| Ghost | Shown by default (a client setting). |
| Lock delay | 30 frames (0.5 s). A piece resting on the stack locks at the end of the 30th frame after the one it landed in. Each successful sideways move or rotation made on the stack restarts the 30 frames, up to 15 times per piece; moves in the air use none. When the piece reaches a new lowest row, its 30 frames and its 15 restarts start over. A piece on the stack builds up no gravity, so one that slides off a ledge starts falling from rest. |
| Gravity | Marathon: the guideline gravity curve by level, (0.8 − (level − 1) × 0.007)^(level − 1) seconds per row, from Tetris Worlds (as the Hard Drop wiki's [Tetris Worlds](https://harddrop.com/wiki/Tetris_Worlds) page and TetrisWiki's [Marathon](https://tetris.wiki/Marathon) page give it). Each level's gravity is stored as the nearest whole number of sub-rows per frame (§5.1): 1 row/s at level 1, 0.26 rows per frame at level 10 and 2.36 at level 15. Sprint/Ultra: 1 row/s. Versus (1v1 and FFA): follows time, not the level. It starts at 1 row/s and speeds up by 1 row/s every 30 s (1,800 frames), up to 20 rows/s (a third of a row per frame) from 9:30 on: frame `f` falls at min(1 + ⌊f / 1,800⌋, 20) rows/s, so 2 rows/s from 0:30, 5 at 2:00 and 11 at 5:00. Every step is a whole number of rows per second, so it is exact in sub-rows, and the steps fall on the same frames as margin time's. It stays gentle because margin time, not gravity, is what ends stalemates. |
| Levels | Play starts at level 1. In Marathon the level rises by one for every 10 lines cleared (the guideline's fixed goal), up to the level cap of 15. A clear scores at the level it was made at, and the next piece falls at the new level's gravity. Sprint, Ultra and the versus modes stay at level 1. |
| Soft / hard drop | Each `softDrop` action moves the piece down one row if it can. The input engine emits them at the rate the player's soft-drop factor sets (handling, §7.2), so the engine never sees the factor. Hard drop places and locks the piece immediately. |
| Top-out | Block out (a new piece overlaps the stack when it spawns), lock out (a piece locks entirely above row 20, checked before line clears), or garbage overflow (garbage pushes a filled cell past row 40). A garbage overflow tops the player out at the lock the garbage landed at, before the next piece spawns. |
| T-spin detection | 3-corner rule, full or mini. Only the T piece spins in v1. A T is a T-spin when it locks with its last successful move a turn (any later move, drop or fall cancels it) and at least three of the four cells diagonal to its centre filled, with cells outside the board counting as filled. It's a full T-spin if both corners on the side it points towards are filled, and a mini otherwise. A mini still counts as full if the last turn took the fifth and last kick of an SRS quarter turn, which moves the T 1 column and 2 rows. The 180° kicks that move it as far don't count, since the guideline has no 180° turn. A T-spin zero is one that clears no lines. |
| Scoring (single-player) | Guideline points, times the level unless noted. Line clears: single 100, double 300, triple 500, Tetris 800. T-spins: mini zero 100, mini single 200, mini double 400, zero 400, single 800, double 1200, triple 1600. Back-to-back: a difficult clear (a Tetris, or a T-spin or mini that clears lines) after another one scores half as much again (a Tetris 1200, a T-spin double 1800). A single, double or triple breaks the chain, and a lock that clears nothing, T-spin zeros included, doesn't, nor does it score the bonus. Combo: each lock that clears lines adds 50 × the combo counter, which is -1 after a lock that clears nothing and goes up by one with each lock that clears, so the second clear in a row adds 50. Perfect clear: a clear that empties the board adds 800, 1200, 1800 or 2000 for 1 to 4 lines, or 3200 for a back-to-back Tetris (a back-to-back T-spin gets its lines' usual bonus). Soft drop scores 1 and hard drop 2 per row, not times the level, and gravity scores nothing. |
| Attack table | Single 0 · Double 1 · Triple 2 · Tetris 4 · T-spin mini zero 0, mini single 0, mini double 1 · T-spin zero 0 · T-spin single 2 · T-spin double 4 · T-spin triple 6 · back-to-back +1 · perfect clear 10. Combo bonus by the combo counter after the clear (0 for the first clear in a row): 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, then 5 for combo 12 and every combo after it. A lock's attack adds them all up: the clear's lines, +1 if it's a back-to-back difficult clear (the same rule as scoring), the combo bonus, and +10 if it's a perfect clear. A lock that clears nothing sends nothing. The table is the same in every mode, so it is a constant (`calculateAttack`) like the scoring points, not a mode setting. |
| Garbage cancellation | Lines you send cancel your incoming garbage first, oldest attack first. Only the remainder is sent to an opponent. The engine cancels each attack against its own garbage meter at the lock that makes it, so a later lock in the same frame never lands garbage the attack already cancelled. An incoming attack is in the meter, and can be cancelled, from the frame at which the player's own client received it: its `garbageReceived` action (§8.5), not the moment the server sent it. |
| Garbage entry | Incoming garbage lands at your next piece lock that clears no lines (§8.5), at most **8 lines per lock**, oldest attack first. An attack the cap cuts short lands its first lines there and the rest at a later lock. The rest stays queued. Each attack lands as one block at the bottom of the board, pushing the stack up, so an attack that lands after another at the same lock ends up below it. |
| Garbage holes | The hole stays in one column within an attack and moves to a random seeded column between attacks: never the column of the attack that landed before it. Each attack's `holeSeed` picks its column when it starts landing, from one draw of the engine's PRNG seeded with it: any of the 10 columns for the first attack to land, and one of the other 9 after that (`holeColumn`). The engine state keeps the last attack that landed and its column, so the rest of an attack the cap cut short keeps its column. Each player's garbage RNG, which deals the hole seeds of the attacks queued on that player, is seeded separately, from the match seed and the player's index (`holeSeeds`). It is run by whoever queues garbage: the server, or the test harness. |
| Margin time | From 120 s (frame 7,200) into a versus match, the attack multiplier grows by ×0.25 every 30 s: ×1.25 from frame 7,200, ×1.5 from frame 9,000, and so on. It multiplies a lock's whole attack, at the frame of the lock and before cancellation. The multiplied attack counts in quarter-lines: the player's next lock sends the whole lines, and the fraction left over (0 to 3 quarter-lines, the **margin carry**, in engine state) adds to the next attack, so no lines are lost: four 1-line attacks at ×1.25 send 1, 1, 1 and 2. The carry is added before cancellation, which cancels whole lines. It can only be non-zero from frame 7,200, and since the multiplier never falls back, it carries for the rest of the match. A lock that sends nothing keeps it as it is. This ends stalemates and bounds match log size. |

**Not in v1:** initial rotation/hold while the next piece is entering, all-spin detection (spins by pieces other than T), Tetris-99-style badges and targeting.

---

## 4. Modes

| Mode | Players | Where it runs | Ends when | Notes |
|---|---|---|---|---|
| Marathon | 1 | client, offline | top-out, or the lock that clears level 15's last line (150 lines) | Guideline gravity curve, levels every 10 lines |
| Sprint | 1 | client, offline | top-out, or the lock that reaches 40 lines | Timed: the frame it finished on. Personal best stored locally |
| Ultra | 1 | client, offline | top-out, or the end of frame 7,200 (2 minutes) | Score. Personal best stored locally |
| 1v1 | 2 | online, server-verified | one player tops out | Quick-match or room code |
| FFA | 2–8 | online, server-verified | one player remains | Room code only. Garbage goes to a random opponent not yet declared out, chosen by the match RNG (§8.5). With 2 players it plays exactly as a 1v1 |

A mode is a **preset**: a mode settings object (the rule values from §3) plus a small amount of mode-specific logic (end conditions, gravity curve, targeting). Players can't change individual rules. `packages/engine` exports the presets as `MARATHON`, `SPRINT`, `ULTRA`, `ONE_VS_ONE` and `FFA`. Their `ModeSettings` hold the gravity curve (its speeds, by level, so the list's length is the level cap, or with an interval, by time: §3's versus curve speeds up every `interval` frames), the lines per level (or none, which keeps the level at 1, as in Sprint, Ultra and versus), an optional line goal (Marathon's is its level cap times 10 lines), an optional frame limit, the lock delay, its restarts, the preview size, and the garbage rules: none in single-player modes, which send and take no garbage, and in versus the garbage cap (8 lines a lock) and margin time's start frame and interval. 1v1 and FFA have the same settings: the engine only knows its own player's game, so the number of players, the end of the match and who gets the garbage are the server's. A game that meets its line goal or frame limit is **finished**: like a top-out, that stops it, with the frame left where it ended, so Sprint's time is the frame and Ultra's result is the score. A lock that finishes the game spawns no next piece, and leaves the piece that locked as the active piece, as a lock out does. The frame limit ends the game after that frame's actions and gravity. The rotation system and randomizer sit behind interfaces so a classic mode can be added later without restructuring the engine.

FFA targeting lives in one server function (`chooseTarget`). Player-chosen targeting (Tetris 99 style) would add one new action and a different function, with no other protocol change. The match RNG draws a target each time the server verifies an attack, in the order it verifies them, which depends on network timing: FFA targeting is random but can't be reproduced from the seed alone. The match log records each routing (§9.6), and that is what makes an FFA replayable.

---

## 5. Engine

`packages/engine` is a pure, deterministic library. The client runs it optimistically, the server re-runs it to verify, and opponents' boards are simulated with it.

### 5.1 Determinism rules

These are what make server verification and replay work. They're enforced by tests and review:

- Fixed tick: the engine advances in **frames** at 60 fps of game time. It never reads wall-clock time.
- No `Math.random`. All randomness comes from seeded PRNGs: the bag RNG carried in engine state (from the match seed), and each attack's `holeSeed`, which reaches the engine with the attack (in its `garbageReceived` action). The hole seeds come from a per-player garbage RNG (`holeSeeds`, from the match seed and the player's index), which the engine package provides and whoever queues garbage runs: the server, or a test harness.
- No `Date.now`, `performance.now` or timers inside the engine.
- Integer arithmetic only for game rules. Gravity is expressed as fixed-point sub-row counters, not floats. A row is 60 × 2¹⁶ = 3,932,160 sub-rows, so any whole number of rows per second is a whole number of sub-rows per frame (1 row/s is 65,536). Gravity curves are stored as whole sub-rows per frame at every level, so faster gravity stays exact too: 20G is 78,643,200.
- No dependence on object key order, `Map` iteration order of external input, or locale.
- The same inputs and seed always produce the same state, bit for bit, on Node and in browsers.

Two checks enforce these mechanically. The engine's `tsconfig.json` loads no Node or DOM types, so timers and `performance` don't typecheck. A test (`determinism.test.ts`) scans the engine source for `Math.random`, `Date`, `performance`, timers, float literals, float-valued `Math` functions and locale APIs. A pattern can't tell float division from integer division, so review checks every `/`.

### 5.2 Shape

- `createEngine(modeSettings, seed, playerIndex) → Engine`, with a preset or any other valid `ModeSettings` (every value a whole number in range, or it throws). The engine keeps a frozen copy of the settings, with its keys in sorted order, which every state it holds or serializes shares, since nothing changes them.
- `engine.step(frame, actions[], { acceptGarbage? }) → { sent, accepted, events }` advances to `frame`, applying the actions that occurred at each frame. Within a frame the engine applies that frame's actions in order, then gravity. Actions must be in frame order and fall after the current frame, or `step` throws and changes nothing. A frame's `garbageReceived{id, lines, holeSeed}` actions apply first, before its other actions: each adds an attack to the end of the garbage meter. Its `id` must not have been received before, `lines` must be at least 1 and `holeSeed` a 32-bit unsigned integer, or `step` throws; a single-player mode throws on any. The player's own client and the server both take them from the input, so the attack enters the meter at the same frame in both (§8.5). Once the game is over, by a top-out or because it finished (§4), `step` changes nothing and the frame stays where the game ended.
  - In a versus mode, each lock that clears lines makes an attack (`calculateAttack`), multiplies it for margin time with the margin carry (`applyMarginTime`), and cancels the whole lines against its own garbage meter there and then (`cancelGarbage`), before any later lock in the frame can land garbage. `sent` lists each lock that had lines left to send, with its frame and those lines, for the server to queue on a target. A single-player mode makes no attacks, so `sent` is always empty.
  - Garbage lands in one of two ways. With `acceptGarbage`, as the player's own client runs it, the engine lands garbage from its meter at every lock that clears nothing and returns the `garbageAccepted{id}` actions it took in `accepted`, one per attack it landed lines of, for the client to add to its action stream; it refuses `garbageAccepted` actions in its input. Without it, as the server and opponents' boards run it, garbage lands only where the input's `garbageAccepted` actions say. Those don't act where they stand among the frame's actions: they name, in order, the attacks that the frame's locks that clear nothing land, each up to the lock's 8-line cap, and they apply at that lock, before the next piece spawns, whether it was a hard drop or the end of the lock delay after the frame's actions. Each must name the oldest attack in the meter, and every one must have found a lock by the end of its frame (unless the game ended in it), or `step` throws and changes nothing. Both ways land the same garbage at the same frames, so a client's game and the server's replay of it stay identical.
  - `events` lists what happened during the step, in order, each with its frame, for clients to drive sound, effects and callouts (§13.1). The types are a discriminated union on `type` (`EngineEvent`), exported from the package root:
    - `lock`, with the lock's `LockClear` (lines, T-spin and perfect clear), the combo counter and back-to-back status after it, the locked piece (its kind and its four board cells), and the rows it cleared, bottom row first (each row's board index and its cells just before clearing, the locked piece's included). The engine has already removed cleared rows by the time a client sees the state, so these are what lets a client burst particles in the cleared cells' colours and brighten the cells that locked. A piece that locks out reports a `lock` that cleared nothing.
    - `hold`, when the piece goes into the hold slot (not a second hold of the same piece, which does nothing).
    - `turn`, and whether it kicked (took a kick other than the turn in place); `turnFailed` when no kick fits.
    - `hardDrop`, with the rows dropped, just before its `lock`.
    - `garbageLanded`, after the `lock` that cleared nothing, with the lines it landed from every attack.
    - `levelUp`, after the `lock` that raised the level, with the new level.
    - `topOut` or `finish`, once, at the end of the frame the game ended in, after everything else in it.

    Events are output only: they are never part of the engine state, `serialize` or `hash`, so adding or changing them never changes game outcomes. Stepping a span of frames in one call or in several gives the same events. A `step` that throws reports nothing, since it changes nothing. The server ignores them.
- There is no way to add garbage between frames. An attack reaches the meter only through a `garbageReceived` action, so a game's action log is the whole of its input: replaying it needs nothing beside it. (`queueGarbage`, which added an attack between frames, was removed in M4: the frame at which it ran wasn't recorded, so a server replaying the game couldn't know which locks it could cancel. See [ADR 0013](adr/0013-received-garbage-is-an-action.md).)
- `engine.state` is read-only: board (garbage cells are `G`), active piece, hold, queue, garbage meter (the attacks not yet landed, oldest first, each with the lines it has left), the margin carry (§3), the last attack that landed and its hole column (§3), stats (level, score, lines cleared, pieces placed, the combo counter and back-to-back status), the last turn (for T-spin detection), whether the player has topped out, and whether the game finished by the mode's end condition. There is always an active piece: after a block out it is the piece that couldn't spawn, left overlapping the stack where clients can show it, and after a lock out or a garbage overflow it is the piece that locked.
- `engine.serialize() → EngineState` and `restoreEngine(state) → Engine` produce and consume plain data. They're used for join and reconnect snapshots (§8.6) and in tests.
- `engine.hash()` is a stable hash of the full state, used by the replay-hash tests and for debugging.
- Pure helpers, exported and unit-tested: SRS kick lookup (`srs.kicks`, behind the `RotationSystem` interface which also gives each piece's cell offsets in each rotation state), T-spin detection (`detectTSpin`, from the board, the T and the last turn with its kick), the attack calculator (`calculateAttack`, from the combo counter and back-to-back status before the lock and what it cleared, and `applyMarginTime`, from the attack, the frame, margin time and the carry), garbage cancellation (`cancelGarbage`, over a garbage meter), the hole column of a hole seed after the last attack's column (`holeColumn`), and each player's garbage RNG (`holeSeeds`). Two more read `engine.state` for the client's input engine (§7.3) and change nothing: `canMove(state, cols, rows)`, whether the active piece fits inside the walls, above the floor and clear of the stack when moved by `cols` columns right and `rows` rows up (negative for left and down), checking only where it ends; and `currentGravity(state)`, the gravity the next frame builds up in sub-rows per frame, from the mode's gravity curve at the current level or, for a curve that follows time, at the next frame (so it rises a frame before each versus speed-up). A lock in that frame can still raise the level first.

### 5.3 Replay-hash test suite

`packages/engine` keeps a set of **recorded matches** (seed, mode, the per-player action log) along with the expected final `hash()` of each. CI replays all of them:

- If a hash changes and `engineVersion` did not change, CI fails.
- Changing game outcomes therefore requires bumping `engineVersion` and re-recording the expected hashes in the same PR.
- The same suite checks determinism: it replays each match twice in Node and asserts identical results.

Recorded matches are JSON files in `packages/engine/recorded-matches/`. Each names its mode (`"mode": "marathon"`, `"sprint"`, `"ultra"`, `"1v1"` or `"ffa"`), and the replay plays that preset as the engine exports it, so changing a preset shows up in the suite. A match that tests a rule rather than a mode can replace some of its preset's settings (`"settings": { "lineGoal": null }`: the rule matches play Sprint without its line goal, as the rule tests do). Most are one player's game. A 1v1 recorded match holds each player's action log, `garbageAccepted` included, and expected hash: its replay plays both games in lockstep, frame by frame, with the test harness in the server's part (§8.5): what each engine sends, already cancelled against its own garbage meter, is recorded in the opponent's log as a `garbageReceived` action at the next frame, with a hole seed from the opponent's garbage RNG. The suite also plays it with both engines accepting garbage themselves, as clients do, and checks that they record the same `garbageAccepted` actions and end on the same hashes. Each recorded match also records the `engineVersion` it was made with, and the suite fails if that differs from the current one. `pnpm --filter @shura/engine record` re-records the expected hash of every recorded match. The failure message explains when a bump is needed.

Until M1 closed nothing had shipped, so `engineVersion` stayed at 1 and a PR that changed outcomes only re-recorded the expected hashes. M1 has closed, so the bump rule above applies: M4's `garbageReceived` action (§8.5) is the first bump, to 2.

---

## 6. Modes run locally vs. online

- **Single-player** modes run entirely inside `client-core`, so they work offline and never contact the server.
- **Online** modes run the same engine optimistically in the client, while the `game` service re-simulates every player authoritatively (§8).

---

## 7. Input and controls

### 7.1 Actions

The engine and the server only see **atomic actions**, each tagged with a frame number. See [ADR 0002](adr/0002-atomic-actions-in-the-input-stream.md).

`moveLeft`, `moveRight`, `rotateCW`, `rotateCCW`, `rotate180`, `hold`, `softDrop`, `hardDrop`, `garbageReceived{id, lines, holeSeed}`, `garbageAccepted{id}`

The two garbage actions are the ones the player doesn't make. The client records `garbageReceived` at its next frame when the server's `garbageQueued` arrives, and it applies before that frame's other actions. The client's engine records `garbageAccepted` when garbage lands, and it applies at that frame's lock that clears nothing rather than where it stands among the frame's actions (§5.2, §8.5).

`softDrop` moves the active piece down one row. Auto-repeat (DAS/ARR) and soft-drop speed are turned into these actions on the client: while soft drop is held, the input engine emits `softDrop` at the rate the soft-drop factor sets, several per frame if needed. The server never knows how a player's keys are tuned. The trade-off is accepted: the server can't tell a human from a script sending perfect moves.

### 7.2 Handling (client settings)

| Setting | Default | Range |
|---|---|---|
| DAS (delay before auto-repeat) | 167 ms (10 frames) | 0–333 ms |
| ARR (auto-repeat interval) | 33 ms (2 frames) | 0 (instant) – 83 ms |
| Soft-drop factor | ×20 | ×5 – instant |

### 7.3 Input engine and adapters

`client-core` contains the **input engine**, a state machine for DAS, ARR and soft drop that runs on the game frame clock. It consumes key events (press, repeat and release of a bound key, stamped with the time they arrived, §13.1) and emits actions. A key event names the action its key is bound to, so adapters own the bindings, and it reaches the input engine at the first frame that starts after it arrived, as an action would (§13.1). Handling is counted in frames (§7.2's milliseconds, rounded).

The input engine reads the board through pure helpers that `packages/engine` exports (`canMove`, which says whether the active piece can move by a given number of columns and rows, and `currentGravity`, the gravity the next frame builds up in sub-rows per frame, §5.2), so it emits only actions that take effect:

- **ARR 0:** once DAS is charged, it emits as many moves as there are free columns to the wall, in one frame. While the key stays held it checks each frame and emits more only when the piece can move again: after a new piece spawns, after it falls past an overhang, or after a rotation.
- **Soft-drop factor:** the soft-drop speed is the factor times the current gravity, counted in sub-rows per frame with an integer accumulator, so ×20 at 1 row/s is one `softDrop` every 3 frames. "Instant" emits one `softDrop` for each row down to the stack.
- **Countdown:** the input engine runs through the countdown (§13.1), so a key held through it is already charged at Go and auto-shifts in the first frame played (frame 1, since Go's frame 0 is the state the game starts from). Turns, hold and hard drop pressed during the countdown are ignored, as is the first move of a direction pressed then.

How keys become actions:

- **Directions:** a press moves once and starts DAS. Once DAS is charged, the piece moves every ARR frames (or to the wall, at ARR 0). A move the piece can't make waits for the next frame, so a held direction carries over to the next piece. Releasing the key stops it.
- **Both directions held:** the last one pressed wins, with a fresh DAS. Releasing it hands back to the other direction, if that is still held, as if it had just been pressed: one move, then a fresh DAS. Releasing the one that isn't moving changes nothing. This lets a player tap the other way without letting go of a charged direction, and never leaves a held key doing nothing.
- **Turns, hold and hard drop:** one action per press, whatever the key repeat does. `canMove` can't tell where a turn, hold or hard drop leaves the piece, so the key events that arrived after one in the same frame wait for the next frame, and so do that frame's auto-repeated moves and soft drops: every move is checked against the board it applies to.
- **Soft drop:** the press drops a row at once, then rows follow at the soft-drop factor's rate. A row the piece can't drop (it is on the stack) is lost, not saved up.
- **Key repeat:** precise input and the web ignore repeat events. Basic input sets the input engine to auto-shift by key repeat instead of DAS and ARR: each repeat of the direction that is moving moves once more. Soft drop still follows the soft-drop factor, from the press to the release (real or inferred).

Composite actions such as "shift to the wall" or "drop to the stack" were considered and deferred (§16): with the board helpers, plain moves cost at most one action per column moved.

Each UI feeds the input engine through an adapter. An adapter is a pure function from timestamped raw input (DOM events, or terminal bytes) to key events, so each one is tested against recorded input:

- **Web adapter:** `keydown` / `keyup`, with browser key repeat ignored. A bound key's `keydown` is a press of its action and its `keyup` a release, both stamped with the clock's time when they arrive; an unbound key makes nothing.
- **CLI precise adapter:** Ink 8 with the Kitty keyboard protocol (`kittyKeyboard: { mode: 'auto', flags: ['disambiguateEscapeCodes', 'reportEventTypes', 'reportAllKeysAsEscapeCodes'] }`). This gives real press, repeat and release events. `reportAllKeysAsEscapeCodes` is needed because without it the protocol sends keys that type text (letters, Space) as plain text, with no repeat or release events, so a held X or Space would read as a stream of presses. The protocol leaves the event type out of an unmodified press of an arrow (`CSI D`), so a key without one counts as a press. It's used when `key.eventType` is present. Ink asks the terminal whether it speaks the protocol before its input hook turns on raw mode, so the CLI turns raw mode on first: otherwise the terminal's answer would be echoed onto the screen.
- **CLI basic adapter:** for terminals without release events (GNOME Terminal/VTE, Konsole, anything inside tmux). The first byte of a key is a press, which moves once. Each byte that follows while the key is held is a repeat, so the OS key-repeat stream drives repeated movement, except that a byte that comes sooner than the OS delay before the first repeat can't be a repeat: it is a quick second tap, read as a release and a new press, so hard drops tapped 80 ms apart are two hard drops. Once a key repeats, every byte is a repeat; a byte less than 60 ms after the last is one too, since nobody taps that fast. A release is assumed after 2× the repeat interval with no bytes for that key, or, before its first repeat, a little after the OS delay. The adapter learns both from the holds it sees, shared by all keys, since the OS settings are: the repeat interval is the mean of the last 8 gaps between repeats, and the delay the mean of the last 4 first repeats that a second repeat soon after confirmed (a slow double tap isn't one). Until a hold has shown the delay, a first repeat is believed from 150 ms after the press and a release is assumed 550 ms after it ("about 500 ms", with a margin over the common 500 ms OS delay); after, from the delay − 50 ms, and a release at the delay + 50 ms. A real release, if the terminal sends one, counts too. Precise DAS/ARR settings don't apply in this mode.
- The CLI chooses an adapter automatically from the first key events and shows it in the status line (`input: auto` until then, `input: precise` / `input: basic` after). The terminal doesn't change while the CLI runs, so every later game started from the menu keeps that choice instead of choosing again. An unmodified arrow press is the same `CSI D` with the protocol as without it, so the choice waits for a key that proves the encoding:
  - **precise** at the first key only the Kitty protocol sends: a repeat or release event, or a key that types text (a letter, Space, Enter, Esc, Tab, Backspace) sent as a protocol sequence;
  - **basic** at the first legacy key: a key that types text sent as its plain byte, or an arrow sent again with no release between (OS key repeat, where the protocol would send a repeat event, or a quick second tap, where it would send a release first). Basic is also chosen once a key that proved nothing has had no release or repeat for 1 s.

  Until it chooses, the CLI reads keys as the basic adapter does, which is safe either way: moves without DAS never slide a tapped piece to the wall. The one difference is that a release waits the full second, because a Kitty terminal's OS delay before the first repeat can be longer than 550 ms (660 ms in X11), and a held arrow must survive it.
- `--input precise|basic` overrides the choice. `--input basic` also leaves the Kitty protocol off, so a Kitty terminal sends what a terminal without it would.
- The CLI adapters' tests replay byte streams recorded from real terminals (Kitty-protocol press, repeat and release from kitty and Ghostty; legacy sequences with OS key repeat from GNOME Terminal and tmux), kept in `apps/cli/tests/support/captures/`. A hidden `--debug-input` flag shows the raw events, the chosen adapter and the actions emitted in a side panel: each raw key with the key events it made, and under it each frame's actions as the game applied them (`f12 moveRight×3`), so DAS and ARR repeats, ARR 0's runs to the wall and soft-drop rows show too. The session tells its listeners the actions each wake applied (`session.onActions`). It also writes them all to a capture file (`shura-input-<time>.jsonl` in the current directory). That is how the recordings are captured, and what to ask for in an input bug report. A capture is a JSON header line (terminal, protocol, gesture, key), then one JSON line per raw key (its bytes and time), inferred release, or frame's actions. Once its header is filled in, it's a fixture as it stands: the tests replay its raw keys.

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
| Menu | Esc, P | Esc, P |

Terminals can't report Ctrl or Shift on their own, so the CLI defaults leave them out. Binding a key that's already in use swaps the two actions.

A web key name is the key's `KeyboardEvent.code` (`ArrowLeft`, `KeyX`, `Space`): the physical key, so a keyboard layout such as Hebrew or AZERTY doesn't move the controls. The left and right Ctrl and Shift are separate keys, so the web defaults bind both (`ControlLeft` and `ControlRight` to Rotate CCW, `ShiftLeft` and `ShiftRight` to Hold).

During a game the menu is the only binding besides the game controls. Everything else lives inside the menu, which has its own fixed shortcuts: **Resume** (Esc, Enter), **Restart** (R), **Settings** (S) and **Quit to menu** (Q). Restart is therefore always two keys (Esc, then R) and asks for no confirmation. Changing settings mid-game is safe, because a game's log holds actions, not handling: the changes apply when the game resumes. Settings opens the settings screen in the game's place, and leaving it goes back to the menu, still paused. While it's open no key reaches the game, and every held key is let go as it opens, since releases made there would be missed: a key held into the settings has to be pressed again after them. New bindings take effect at once, with the input adapter already chosen (§7.3).

Online, the menu doesn't pause: the match goes on underneath it (§8.4). It has two entries, **Back to game** (Esc, Enter) and **Leave match** (Q), and no Restart or Settings. While it's open no key reaches the game, as in single-player. Leave match counts as leaving (out, with *left*, §10.1), and the player watches the rest of the match as a spectator; in a quick-match room it leaves the room.

---

## 8. Netcode

See [ADR 0001](adr/0001-deterministic-engine-with-server-verification.md) and [ADR 0003](adr/0003-garbage-as-acknowledged-input.md).

### 8.1 Model

- Each client simulates **its own board** immediately (optimistically), with zero input latency.
- The client sends **input batches**: the actions with their frame numbers, about every 3 frames (~20 batches/s). Each batch carries a **sequence number**.
- The `game` service re-runs every player's engine on the received batches. The server alone decides outcomes: line clears, attacks sent, garbage, top-outs and placements. Clients never claim outcomes.
- The server **acknowledges** each batch by sequence number once it has been verified and appended to the match log (§9.6). Clients keep unacknowledged batches and resend them after reconnecting.
- Verified batches are **relayed** to the other players and the spectators in the room, combined per room tick (50 ms, 20 Hz) into one message per recipient.

### 8.2 Transport

- Raw WebSocket (`ws` on the server; the native `WebSocket` in browsers and in Node for the CLI) carrying JSON text messages.
- Every message is validated with a zod schema from `packages/protocol` on receipt. Unknown fields are tolerated (`passthrough`), so adding fields stays backward compatible.
- `permessage-deflate` is off. `bufferutil` is installed on the server.

### 8.3 Versioning

See [ADR 0006](adr/0006-strict-version-handshake.md).

- `protocolVersion` (an integer) changes only on **breaking** message changes, such as a renamed or removed message or a field whose meaning changes. New optional fields and new message types that old clients can ignore don't change it.
- `engineVersion` (an integer) changes only when **game outcomes** change. The replay-hash test (§5.3) decides this mechanically.
- Clients open with `hello{ protocolVersion, engineVersion, clientVersion, nickname, sessionToken?, kind? }` (`kind: 'bot'` from the bot tool, §13.4). The gateway rejects any mismatch with an explicit error that includes what to do. The web says "A new version of Shura is out" and reloads when the player presses Enter. The CLI prints `npm i -g shura@latest` and exits with code 1.
- Accounts (§16) will add an optional `accountToken` to `hello`, which isn't a breaking change: sign-in itself happens over HTTP, and play stays on the WebSocket (§9.1).
- Game pods publish their `engineVersion` in their heartbeat. Rooms are placed only on pods with a matching version, so during a rolling deploy, running rooms finish on old pods and new rooms go to new pods.
- Single-player works offline whatever the version.

### 8.4 Clock enforcement

The one thing a client controls is time (slow motion, stalling). The rule is:

- **Clock offset.** The client estimates the server's clock from ping samples: it notes its time `t0`, sends `ping`, and the server's `pong{ id, serverTime }` arrives at `t1`, giving an offset of `serverTime − (t0 + t1) / 2`. The sample with the shortest round trip is the most accurate, so the client keeps that one. It takes 5 samples when it connects and one every 2 s after that, in the lobby, while queued and during matches, keeping the best of the last 30. The same samples give the player's ping, shown in the lobby and the HUD (§13.2).
- **Start.** At match start the server sends `countdown{ startAt, … }` (server time). The client sets its game loop's start to `startAt − offset` (§13.1), so frame 0 falls at the same moment on both clocks, as far as the offset is right.
- **Expected frame** = `(now − startAt) × 60 / 1000`, on the server's clock.
- A client's batch frames may run **at most 1 s behind** the expected frame, and **at most `CLOCK_LEAD_TOLERANCE` frames (6, 100 ms) ahead** of it. The tolerance absorbs the error in the client's offset estimate; on one machine a batch arrives with no delay at all, so without it a few milliseconds of error would look like speeding up.
- Behind the window for more than **3 s** means the player has **lagged out** and counts as topped out, at the frame where they fell more than 3 s behind (§10.1).
- A batch further ahead than the tolerance is rejected, and the player is **removed** from the match, out at the frame of that batch.
- This rule also detects silent disconnects during a match. No separate in-match heartbeat is needed.
- These constants live in `packages/protocol`.

**An online game never pauses.** The server's clock keeps running, so a late wake of the client's loop steps every frame it missed, with no input, and the player's pieces fall under gravity, as they do on the server. A browser stops `requestAnimationFrame` in a hidden tab and slows ordinary timers to about once a second, so while the tab is hidden the web loop is woken by a timer that runs in a Web Worker (the `worker-timers` library), which browsers don't slow: the game keeps stepping and sending batches, and a player who looks away for a few seconds comes back to a board that kept playing. A laptop that sleeps for longer than 3 s is lagged out by the server, and the client shows that when it wakes.

### 8.5 Garbage delivery

Garbage is the only interaction between boards, and it has to reach the victim's board deterministically even though every client runs ahead of the server. See [ADR 0003](adr/0003-garbage-as-acknowledged-input.md) and [ADR 0013](adr/0013-received-garbage-is-an-action.md).

1. The attacker's verified clear produces an attack, which the attacker's engine cancels against its own garbage meter at the lock that made it (§5.2). What is left (`step`'s `sent`) the server sends on to a target it picks: in a 1v1 the opponent; in an FFA `chooseTarget`, a random player not yet **declared out** (`playerOut`) when the server verifies the attack, drawn with the match RNG. A player whose top-out hasn't been verified yet can still be picked. Once only two players are left, every attack goes to the other one.
2. The server broadcasts `garbageQueued{ id, from, to, lines, holeSeed }` to the room, with the hole seed from the target's garbage RNG (§3), adds the attack to the target's **sent, not yet received** list, and writes the routing to the match log (§9.6). Clients other than the target use it only to draw the attack streak (§13.2).
3. The target's client records `garbageReceived{ id, lines, holeSeed }` in its own action stream at its next frame, and its engine adds the attack to its garbage meter at the start of that frame (§5.2). From then on its own clears can cancel it.
4. The server's replay of the target's batches meets that action at the same frame. It checks it against the sent-not-received list (the `id`, `lines` and `holeSeed` must be what it sent) and applies it there, so the attack enters the server's copy of the meter at exactly the frame it entered the client's. An action that doesn't match, or names an attack the server never sent, is a bad batch: the player is removed. Relays carry the action like any other, so opponents' boards take the attack at the same frame too.
5. The client's engine applies queued garbage at its next piece lock that clears no lines (at most 8 lines per lock), and records `garbageAccepted{ id }` in its own action stream at that frame (`step` with `acceptGarbage`). An attack the cap splits is accepted once at each lock it lands lines at.
6. The server's replay applies the garbage at exactly that frame, so client and server stay identical without any rollback.
7. **Timeout:** if a client hasn't received and accepted an attack within `GARBAGE_ACK_TIMEOUT` (initially 10 s of game time, counted from the target's verified frame when the server sent it), the server treats the player as lagged out. The server never inserts garbage itself, because that would break determinism.
8. **Garbage for a player who goes out is lost.** It isn't sent on to anyone else: re-aiming it would make one attack hit twice in a crowded endgame, and the outcome would depend on network timing.

Without step 3, the server would add the attack to its copy of the target's meter when it sent it, while the client added it a round trip later: a clear the target made in between would cancel the attack on the server and not on the client, the two games would split, and the client's later `garbageAccepted` would be refused.

### 8.6 Opponent boards and snapshots

- Each client runs **one engine per opponent**, fed with the verified, relayed input batches. Opponent boards therefore show exactly what the server computed, about one network delay behind real time.
- **Snapshots** are sent only when a client **joins or reconnects** mid-match: `snapshot{ players: [{ playerId, frame, state }] }`, each player's `engine.serialize()` at that player's own last verified frame, since the server's copies of the players' games aren't all at the same frame. The client restores each engine from it and keeps applying relayed batches from that player's frame onward.
- There is no desync detection, checksumming or rollback in v1. Relayed inputs are already verified, so drift could only come from an engine bug, which the replay-hash tests are meant to catch.
- Spectators use exactly this path.

### 8.7 Messages

The authoritative definitions are the zod schemas in `packages/protocol`. Every room action is a WebSocket message (§9.1).

**Client → gateway:**

- `hello{ protocolVersion, engineVersion, clientVersion, nickname, sessionToken?, kind? }`, `setNickname{ nickname }` (in the lobby only), `ping{ id }`
- `createRoom{ mode }` (`1v1` or `ffa`, fixed for the room's life), `joinRoom{ code }`, `leaveRoom`
- `ready{ ready }`, `startMatch` (host only), `spectate` (step out of a seat), `takeSeat` (take a free seat, in the lobby)
- `quickMatch`, `cancelQuickMatch`, `rematch` (quick-match rooms, after results)
- `inputBatch{ seq, frames: [{ frame, actions }] }`

**Gateway → client:**

- `welcome{ sessionId, sessionToken, nickname, serverTime }` (the nickname as the server normalised it), `error{ code, message }`, `pong{ id, serverTime }`
- `roomState{ code, mode, hostId, phase, players: [{ id, nickname, kind, seat, ready, lastPlace? }], spectators: [{ id, nickname, kind }] }`: `kind` is `guest` or `bot` (§10.2), and `seat` is the seat number. Quick-match rooms have no `hostId`.
- `quickMatchQueued`, `quickMatchCancelled`, `opponentLeft` (quick-match rooms)
- `countdown{ startAt, seed, matchId, players: [{ id, index }] }`, `snapshot{ players: [{ playerId, frame, state }] }`
- `batchAck{ seq }`, `relay{ playerId, frames }`, `garbageQueued{ id, from, to, lines, holeSeed }`
- `playerOut{ playerId, reason, frame }` (`reason`: `toppedOut`, `laggedOut`, `removed` or `left`), `matchEnd{ placements: [{ playerId, place, reason?, frame? }], stats: [{ playerId, linesSent, apm, pps }] }`

`error` codes clients show in plain words include `version_mismatch`, `room_not_found`, `room_full` (only for a full spectator list), `nickname_invalid`, `rate_limited`, `too_many_connections`, `room_limit` and `not_host`.

**Gateway ⇄ game (internal):** the room-scoped messages above, wrapped with `{roomCode, epoch, sessionId}`, plus `createRoom`, `attach`, `detach`, `drain`.

---

## 9. Backend

See [ADR 0004](adr/0004-gateway-and-game-services-with-valkey.md) and [ADR 0005](adr/0005-gateway-forwards-to-game-pods.md).

### 9.1 Services

```
            ┌──────── Gateway API (one public origin, TLS) ────────┐
            │  /        → shura-web   (static Vite build)           │
            │  /ws      → gateway     (stateless, N pods)           │
            │  /api     → reserved for future HTTP (accounts)       │
            └───────────────────────────────────────────────────────┘
gateway ──(internal WS, per room)──▶ game pod that owns the room (stateful, M pods)
gateway, game ──▶ Valkey (registry, queue, sessions, pod health, match logs)
```

- **gateway** (stateless, scales freely):
  - terminates player WebSockets and handles the room and quick-match messages on them (§8.7);
  - looks up `room → pod` and forwards each room's traffic to the game pod that owns it, reusing one internal connection per room;
  - enforces the abuse limits (§11) and serves `/livez`, `/readyz` and `/metrics` on an internal port.

  If a gateway pod dies, its players reconnect to any other gateway with their session token.
- **game** (stateful):
  - hosts many rooms in memory; each room lives on **exactly one** game pod for its whole life;
  - per room: the verification engines, clock enforcement, garbage, relay, results and log appends;
  - writes a heartbeat to Valkey every 2 s (TTL 5 s) with its pod IP, port, room count and `engineVersion`.
- **shura-web**: a static server (nginx or Caddy) holding the Vite build. Hashed assets are cached long, and `index.html` is never cached.

Players are never "on" a game pod; rooms are. Two players matched through different gateways end up in the same room, so on the same game pod.

Everything live goes over the WebSocket: `hello`, rooms, quick-match and play. The gateway has no public HTTP routes in v1, only `/livez`, `/readyz` and `/metrics` on its internal port. `/api` is reserved in the route table for future HTTP: accounts, sign-in and leaderboards (§16). Sign-in flows (OAuth redirects, email links, cookies) need HTTP, and data people read (leaderboards, profiles) is cacheable and linkable over it, while anything live stays on the socket. Whether that HTTP lives in the gateway or in a service of its own is left to the accounts work.

### 9.2 Room placement

New rooms go to the **least-loaded live game pod with a matching `engineVersion`**, using room counts from the heartbeats. The gateway records `room → {pod address, epoch}` in Valkey. Game pods register their own pod IP, so they need no StatefulSet or per-pod DNS.

### 9.3 Ownership epoch

Every room assignment carries an **epoch** number, incremented whenever the room changes owner. Game pods tag their log appends with it. In v1 the epoch is only recorded. In phase 2, appends with a stale epoch are rejected (fencing, §9.7).

### 9.4 Quick-match

- The queue is a Valkey list shared by all gateways, oldest entry first.
- On `quickMatch`, the gateway atomically pops a waiting partner with a Lua script. If none is waiting, it enqueues the player. The same script refuses a session that is already queued or still cooling down.
- When a pair forms, the pairing gateway creates the room (§9.2), and a Valkey pub/sub message tells the waiting player's gateway to attach them.
- Quick-match rooms have no host and start automatically. 1v1 only. They skip the lobby: after results both players get *Rematch*, which starts the next match once both have pressed it, or *Leave*. If one leaves, the other gets `opponentLeft` and goes back to the quick-match waiting screen, from where they can queue again.
- Each session can have one queue entry. Leaving the queue starts a short requeue cooldown (3 s); being paired doesn't.

### 9.5 Valkey usage

Accessed only through `packages/valkey` interfaces, using `iovalkey`. Initial key layout:

| Key | Type | Content | TTL |
|---|---|---|---|
| `room:{code}` | hash | pod address, epoch, mode, phase, settings, host | deleted with the room |
| `qm:1v1` | list | waiting session ids, oldest first | n/a |
| `qm:cooldown:{sessionId}` | string | set while a session that left the queue waits to rejoin it | the requeue cooldown |
| `qm:matched` | pub/sub channel | `{ sessionId, partnerId, roomCode }`: tells the waiting player's gateway that a pair formed | n/a |
| `session:{token}` | hash | session id, nickname, current room | ~30 min sliding |
| `pod:{id}` | hash | address, room count, engineVersion, draining | 5 s, refreshed every 2 s |
| `log:{matchId}` | stream | seed + settings entry, then one entry per room every 100 ms of verified batches and garbage routings (tagged with epoch) | deleted at match end |
| `rl:bucket:{key}` | hash | a token bucket's tokens and when they were counted (`RateLimiter`, §11) | until it would be full again |
| `rl:count:{key}` | counter | a connection count (`RateLimiter`, §11) | set by the caller, restarted on each count |

The `{key}` of a rate limit is the caller's, such as `ip:{address}` or `session:{id}`. Every key and channel can take a prefix, which tests use to share one Valkey. Each interface has an in-memory version with the same behaviour, on an injected clock, for tests and single-process runs. Every change that reads and then writes runs as one Lua script, so concurrent calls from several pods stay atomic. Rate-limit buckets refill on the calling pod's clock, passed into the script, so pods' clocks must be in sync (NTP).

In production Valkey runs with a replica and failover (Sentinel or a managed service; deferred), with AOF `everysec`.

### 9.6 Match log

See [ADR 0007](adr/0007-full-match-log-in-valkey.md).

- At match start, `game` writes the seed, mode settings and player list as the first entry of `log:{matchId}`.
- Every 100 ms it appends one entry per room containing all players' newly verified batches and the garbage routings since the last entry: each `garbageQueued` (attacker, target, id, lines, hole seed, and the target's verified frame when it was sent). That's about 10 appends/s per room, pipelined. The routings record the match RNG's FFA draws (§4) and the sent-not-received lists (§8.5), which phase-2 recovery needs and the batches alone don't give.
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
lobby ──(host starts, ≥ 1 other seated player ready)──▶ countdown (3 s) ──▶ playing ──(one left)──▶ results ──▶ lobby
```

- **Mode:** chosen when the room is created (`createRoom{ mode }`, 1v1 unless FFA is asked for) and fixed for the room's life. Playing another mode means creating another room.
- **Seats:** a 1v1 room has 2 seats and an FFA room 8. Anyone who joins a full room, or joins mid-match, becomes a **spectator**, and takes a free seat at the next lobby in the order they arrived. A room holds at most `MAX_SPECTATORS` (16, in `protocol`); a join beyond that gets `room_full`.
- **Seat moves:** in the lobby, a seated player can step out to spectate (`spectate`) and a spectator can take a free seat (`takeSeat`). Nobody takes a seat during a match.
- **Host:** whoever created the room. The host doesn't ready up: pressing *Start* is their ready, and they can start once at least 1 other seated player is ready. Seated players who aren't ready when the match starts sit it out and watch as spectators. If the host leaves, the player who has been there longest becomes host. Quick-match rooms have no host and start automatically.
- An FFA room can start with 2 players: 1v1 and FFA have identical engine settings, so a 2-player FFA is a 1v1.
- **Out:** a player is out when the server verifies their top-out, lags them out (§8.4), removes them (a batch too far ahead, or a bad batch) or they leave. The server announces it at once (`playerOut`), and the out player watches the rest of the match as a spectator, with their own board greyed.
- **Placements by frame.** Each player goes out at a game frame: the frame of their top-out, the frame where they fell more than 3 s behind (a lag-out), the frame of the bad batch (a removal), or their last verified frame (leaving). Placements follow those frames, later is better, and players who go out at the same frame share a place. The server's copies of the players' games are at different frames, so it settles the placements, and ends the match, only once every player still in has been verified past the last frame at which anyone went out. That takes at most the 1 s window (§8.4). Placing by arrival instead would reward lag: a player whose batches arrive late could win a finish they lost.
- An empty room is deleted after 60 s.
- **Rematch:** after results, the room returns to the lobby with the same players, and everyone readies up again.
- **Results:** placements plus simple server-computed stats: lines sent, attack per minute and pieces per second (`matchEnd`).

### 10.2 Identity and reconnects

- Every player in v1 is a **guest**: known only by a nickname and a session token, with no account. Players carry a `kind` in `roomState`, `guest` for now, so when accounts arrive (§16) "guest or account" is already a branch in the code. Bots from the testing tool (§13.4) say `kind: 'bot'` in their `hello`, and the server passes that on.
- On `hello` the server issues a random **session token**. The web client keeps it in `sessionStorage`, and the CLI in memory.
- The **nickname** comes from the client's settings (§13.1) and is sent in `hello`. The server normalises it (§11), applies the blocklist and the `#2` suffix, and sends back the name it uses, which the client shows. It can be changed in the lobby (`setNickname`), never during a match.
- Reconnecting with the token restores the same seat and nickname.
- Disconnected **in the lobby:** the seat is held for 30 s.
- Disconnected **during a match:** the client keeps playing locally and keeps its unacknowledged batches. It reconnects at once and backs off (250 ms, 500 ms, 1 s, then every 2 s).
  - **Back within the 3 s window** (§8.4): it resends its unacknowledged batches, the server verifies them in order, and the match carries on with nothing lost. The player sees "Reconnecting…" over their HUD meanwhile; opponents see only that board pause for a moment.
  - **Back after the window:** the player has already been lagged out. They get a snapshot and watch the rest as a spectator, with their board greyed and "You lagged out".
  - **Never back:** the seat is held until the match ends, then for the lobby's 30 s.
- **Late joiners** spectate until the next round.

### 10.3 Room codes

4 characters from a 31-character alphabet with ambiguous characters removed (`0/O`, `1/I/L`). That's about 920k codes. Codes are shown as text and as a link (`/r/K7QX`). Clients uppercase a typed code and refuse the removed characters as they're typed. Longer 6-character codes for private rooms are deferred (§16).

---

## 11. Abuse protection

All limits are enforced in the gateway (the only public entry point). Each is an environment variable of the gateway, defaulting to the value below and validated by its zod config. A rejected action gets an `error{ code }` (`rate_limited`, `too_many_connections`, `room_limit`, …), and the clients say what happened in plain words ("Too many rooms created. Try again in a minute").

| Threat | Protection |
|---|---|
| Oversized / malformed messages | `maxPayload` 16 KB. Every message is validated with zod. 3 invalid messages → disconnect |
| Message floods | Token bucket per connection: 60 msg/s, burst 120 |
| Connection floods | Per IP: 10 concurrent connections, 30 new per minute. Counted in Valkey, so the limits hold across gateway pods |
| Room spam | 3 rooms created per minute per IP. 1 hosted room per session. At most 16 spectators per room |
| Room-code guessing | 10 failed joins per minute per IP |
| Nicknames | 1–16 characters: Unicode letters (Hebrew included), digits, `_`, `-`, spaces. NFC-normalized, control and zero-width characters stripped, plus an extendable blocklist file. Duplicates in a room get `#2` |
| Quick-match | One queue entry per session, with a cooldown on rapid requeueing |
| Cheating | Server re-simulation (§8.1), clock enforcement (§8.4), version handshake (§8.3) |

Counts and buckets that must hold across gateway pods live in Valkey (`rl:*`), behind the `RateLimiter` interface in `packages/valkey`, with in-memory and Valkey versions like the others.

`LIMITS_EXEMPT_IPS` (empty by default) exempts the listed addresses from the **per-IP** limits only: the connection caps, room creation and failed joins. The per-connection protections (message size, validation, the message-rate bucket) always apply, so a looping bug still gets caught. `.env.example` sets it to `127.0.0.1,::1`, so a laptop running web, CLI and bot clients at once isn't blocked (§14).

Client IPs come from `X-Forwarded-For`, trusted only from the peers listed in `TRUSTED_PROXIES` (the cluster's own load balancer). With it empty, as on a laptop, the socket's own address is used. Network-level DDoS protection is left to the hosting provider or a CDN/WAF.

---

## 12. Observability

- **Health:** `/livez` (process alive) and `/readyz` (Valkey connected, not draining) on an internal port.
- **Logs:** pino JSON to stdout, from M4 in `gateway`, `game` and the bot tool, with `service`, `pod`, and where relevant `roomCode`, `matchId` and `sessionId`. `pino-pretty` in dev. Inputs and nicknames are never logged at info level.
- **Metrics** (M5): Prometheus format via `prom-client` on `/metrics`.
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
- themes and skins (§13.1, Themes and skins);
- single-player sessions and local personal bests.

**State.** client-core keeps its state in Zustand stores created with `zustand/vanilla`, which has no React in it: the game loop, the session and (from M4) the connection write them from timers and sockets, not from components, and client-core's tests assert on `getState()` with no renderer. A second entry point, `@shura/client-core/react`, holds the hooks both UIs share (`useSession(session, selector)`, which re-renders only when the selected slice changes, `useSettings()`, `useRecords()` and so on), built on Zustand's `useStore`. A session belongs to one game, so `useSession` takes it as an argument. The settings and records stores belong to the whole app, so each app creates them once at startup and puts them in a `<ClientCoreProvider settings records>` at its root, where `useSettings(selector?)` and `useRecords(selector?)` find them (and `useSettingsStore()` / `useRecordsStore()` give the stores themselves, for their writes); a hook used outside the provider throws. `react` and `zustand` are peer dependencies, and both apps take React from the pnpm catalog, so there is one React per app and one version across them. Components are written per app, since Ink and the DOM render different elements. Each app may add its own Zustand stores for UI-only state. See [ADR 0012](adr/0012-client-core-state-on-zustand.md).

**Engine events.** Each wake collects the events of the engine steps it ran (§5.2) and passes them, in frame order and once each, to the session's event listeners (`session.onEvents(listener)`), after the store's subscribers have heard of the wake; a pause passes on those of the frames it steps first. A late wake that steps several frames passes their events on together, and a wake that steps nothing passes nothing, so none come in the countdown or while paused. Events are moments, not state, so they don't go through the store: a UI that redraws less often than the loop wakes would otherwise miss some. The web drives sound, effects and callouts from them.

**Callouts.** Short labels for notable locks, worked out from engine events by one shared function (`lockCallouts`), in this order: "SINGLE" to "TETRIS" (with "T-SPIN" or "T-SPIN MINI" in front for a T-spin, and "T-SPIN" or "T-SPIN MINI" alone for one that clears nothing), "BACK-TO-BACK", "COMBO n" from combo 1, and "PERFECT CLEAR". A lock that clears nothing and isn't a T-spin has none. "BACK-TO-BACK" is a difficult clear (§3) made while the back-to-back status was already on. The lock event carries the status after the lock, so `trackBackToBack(session)` follows a session's locks and keeps the status before each one: the previous lock's, off before a game's first lock and again after a restart. `onCallouts(session, listener)` uses it to pass each notable lock's callouts on, and the web client's effects use it too. They carry information, so they show even with effects off (§13.2).

**Game loop.** The loop gets a clock from its platform: `now()` in milliseconds and `schedule(callback)` to wake it. The CLI uses `performance.now()` and a ~4 ms timer, the web `performance.now()` and `requestAnimationFrame`, and tests a fake clock they advance by hand. The game's frame comes from the time since its start, not from counting wakes: each wake steps the engine to `floor((now() − start) × 60 / 1000)`, several frames at once if the wake came late, so timer jitter never changes game speed and a Sprint time stays exact. Key events (and the actions they become) carry the time they arrived and apply at the first frame that starts after it, at most one frame (16.7 ms) later, or at the first frame not yet stepped if that is later, as for one that reaches the loop late. Pausing first steps the frames that have started, then stops stepping, and resuming moves `start` forward by the time paused plus the countdown it shows again, so the game carries on from the same frame and the same point in it. Key events that arrive while paused still count: they reach the input engine as the countdown starts again, so a key released in the menu isn't left held, and one held from there is charged at Go. If a wake finds more than 30 frames (0.5 s) to step, as after a laptop sleep or a debugger break, a single-player game opens the menu instead of simulating time the player never saw: it pauses at the last frame stepped, and the time since is dropped. An online game never pauses: it steps every frame it missed (§8.4). The UI redraws from the store at its own rate (about 30 fps in Ink, the display's refresh rate on the web), independently of the loop.

**Countdown.** Every single-player game starts with "3, 2, 1, Go", 0.5 s a step, and resuming from the menu or restarting shows it again. The countdown is frames −90 to −1: the board, queue and hold are shown and the input engine runs, so DAS charges, but the engine doesn't step. Go is frame 0, where Sprint's time starts. One client-core function (`countdownLabel`) gives the label from the session's state ("3", "2", "1", then "GO" for the first 0.5 s of play), so the web and the CLI agree.

**Single-player session.** A session runs one mode through countdown, play, the menu (§7.4) and the end of the game, and then shows the results: the mode's headline (Sprint's time, or the score), lines, pieces, pieces per second, score and level, "Finished" or "Game over", and the personal best line ("new personal best", or how far off it the run was). "Finished" means the game met its mode's end condition (Sprint's 40 lines, Marathon's 150, Ultra's 2 minutes) and "Game over" that it topped out. One client-core function (`soloResult`) works these out from the engine's state, the headline included, so the web and the CLI agree. So does everything else both UIs show of a game: the personal best line and the menu's personal best summary (`personalBestLine`, `personalBestSummary`), Ultra's time left (`timeLeft`), and the formats (`formatFrames` for `m:ss.mmm` times, `formatScore` for `171,349`). Whether a headline is a time or a score is decided once (`headlineOf`): everything else reads its `kind`. While playing, the HUD shows the mode's numbers: Sprint the time since Go and the lines out of 40, Marathon the level, the lines out of 150 and the score, and Ultra the time left of the 2 minutes and the score. From the results, Restart plays the same mode again, and Enter or Esc returns to the main menu. Restart, from the menu or the results, is the session's own `restart()`: a new game of the same mode from a fresh seed, through the countdown, with an empty action log. The input engine carries on through it, so a direction held into a restart is charged at Go, as after a resume. Key events that arrive once a game has ended wait for a restart (without waking the loop), so a key released on the results isn't left held. A session starts from a fresh seed, and its store holds the mode, the seed, the phase (countdown, playing, paused for the menu, or ended), the frames left in the countdown, the frame of the latest countdown's Go, the engine's state and the action log, and notifies its subscribers after each wake that steps a frame and each pause and resume.

**Personal bests.** One per mode, the best run only:

| Mode | What counts |
|---|---|
| Sprint | The fastest finished 40 lines, in frames, shown as `m:ss.mmm`. A top-out never counts |
| Ultra | The highest score of a game that lasted the full 2 minutes. A top-out never counts |
| Marathon | The highest score at the end of the game, by top-out or by finishing 150 lines, with the level and lines shown beside it |

Each record keeps the date, the stats the results show (Finished or Game over, score, lines, pieces, level and the frame it ended on), `engineVersion`, and the seed and action log of the run, so it can be replayed or verified later (§16). A record is only written when a game ends: quitting mid-game writes nothing. A run that only equals the personal best doesn't replace it. The records store's `submit` takes the ended session's state and says what the run did: a new personal best (and the one it beat), how far off the best it was, or that it didn't count, which the results' personal best line shows. Both UIs record a game through `useSoloRecord(session)`, which submits each game once, as it ends, and gives that line.

**Settings model.** client-core owns the settings rules that every settings screen needs: the handling ranges (§7.2), the bindings with the swap rule (§7.4), the ghost toggle, the theme and the skin, the nickname, validation and saving. The CLI's and the web's settings screens are views over it. Handling is kept in milliseconds and stepped a frame at a time (DAS 0–333 ms, ARR 0–83 ms, rounded to whole ms), and the input engine gets it rounded to frames. The soft-drop factor steps through ×5, ×10 … ×40, then instant. `stepHandling` steps a setting one way, for the CLI's steppers, and `handlingSteps` lists every value a setting can take, for the web's sliders. Bindings are each platform's own key names, a list per action, with the platform's defaults: rebinding a slot to a key another slot holds swaps the two keys, and taking a key for a new slot removes it from the action that had it, so a key is never bound twice. `rebindChange` also says which other action a rebind changed (it gets the slot's old key, or loses its own), and `ACTION_LABELS` names each game control, so both screens word the message alike ("Rotate CW gets C."). A settings file needs only the fields it changes: the rest take their defaults. An invalid file falls back to the defaults whole, with a message, and stays as it was until the settings are next saved. Changes go to the store at once and to storage only on `save()`. Volume and effects (§13.2) are in the same model but web-only: the CLI's settings screen doesn't show them.

**Themes and skins.** Two shared visual settings, defined as data in client-core so the web and the CLI look alike:

- A **theme** is a designed set of colours: the seven piece colours, ghost and garbage, and the UI chrome (background, text, borders, accent, the board's background and grid). Each colour has a 24-bit value and the nearest of the 16 ANSI colours for terminals without 24-bit colour. Pieces keep their guideline hues (I cyan, O yellow, T purple, S green, Z red, J blue, L orange), tuned as one family against dark backgrounds. A theme carries its own piece colours anyway, so a later theme (a light one, say) can retune them. v1 ships three themes that share the piece colours and differ in their backdrop: Indigo (the default), Plum and Deep Sea. More themes are new data, with no code changes.
- A **skin** is how a cell is drawn, separately from its colour. Each skin defines both its canvas drawing and its two terminal characters: Pixel (pixel art on an 8×8 grid: a dark edge, a lit top-left, a shaded bottom-right and one shine pixel, `██`, the default), Flat (a solid cell with a dark edge, `▓▓`) and Outline (a ring in the piece colour on a faint fill, `[]`). In the terminal the skin draws filled cells (the stack, the active piece, hold and the preview); the ghost (`░░`, in the theme's ghost colour) and the empty cells' dots (in the grid colour) are the same in every skin. A skin's canvas drawing is data: rectangles of art pixels painted in order, each a shade of the cell's colour (toward black or white by a fraction) and an optional alpha. Pixel's: the whole cell darkened 55 % (the edge), the inner 6×6 in the piece colour, its top row and left column lightened 40 %, its bottom row and its right column from row 2 down darkened 22 %, and a white shine pixel at (2, 2). Flat's: the edge, and the inner 6×6 in the piece colour. Outline's: the edge, the inner 6×6's 1-pixel ring in the piece colour, the inner 4×4 in the piece colour at 22 % alpha (over the edge), and a shine pixel at (2, 2) lightened 50 %. The web draws every cell, on the board and in the settings screen's skin previews, with one function over this data, so they look alike. On canvas the ghost is the same in every skin too: every other pixel of the cell's outer ring, in the piece colour at 55 % alpha.

The look is juicy arcade pixel: pixel fonts, pixel-art cells, thick cream borders with hard offset shadows, saturated piece colours on a deep backdrop, bouncy menus, and effects that make every clear land (§13.2). Not restrained terminal styling, and no hacker clichés (green-on-black, scanlines, glitch effects). The CLI shares the colours and skins and draws the rest as text.

**Online session.** client-core's `OnlineSession` is what both UIs (and the bot tool, §13.4) use for online play. It opens the WebSocket when the player enters *Play online* and closes it when they go back to the main menu, so single-player never touches the network (§6). It does the `hello`, keeps the session token, reconnects with backoff (§10.2), keeps the clock offset and ping from ping samples (§8.4), and holds a Zustand store of the connection (connecting, connected, reconnecting, failed, with the reason), the room (`roomState`), the quick-match state and the current match. A match runs the same game loop and input engine as a single-player session, with the loop's start set from `startAt` and the clock offset, plus: the player's actions sent as input batches about every 3 frames, kept until acknowledged and resent after a reconnect; `garbageQueued` for this player turned into a `garbageReceived` action at the next frame (§8.5); one engine per opponent fed from relays (§8.6); snapshots restored on joining or reconnecting mid-match; and who is out, with placements, from `playerOut` and `matchEnd`. Engine events from the player's own engine reach `onEvents` as in single-player. The loop never pauses (§8.4). Every online screen in both UIs is a view over this store.

**Nickname.** A `nickname` field in the settings model, empty until set, kept the way the rest of the settings are (`localStorage` on the web, `config.json` in the CLI). The first time a player chooses *Play online* with no nickname, a prompt asks for one, prefilled with a random suggestion (`Player4821`) that Enter accepts, and checked as it's typed with the same validation the gateway uses, from `protocol` (§11). It can be changed in the settings screen and in the lobby; a change made in the lobby is saved to settings too. The CLI's `--name` overrides it for one run without saving it. The server still has the last word on the name (§10.2).

**Storage.** Settings and records are two separate stores, each with its own zod schema and `version` field, migrated on load, behind one storage interface (`read`, an all-or-nothing `write`, and `setAside`, which moves unusable records out of the way). A stored version newer than the client's is unusable, like an invalid file. Records are machine-written data, so a hand edit of the settings can't damage them. The CLI keeps them in two files (§13.3), and the web in two `localStorage` keys.

### 13.2 Web

- **App:** a React single-page app built by Vite, served as static files. No server rendering: every screen is client-side state.
- **Routes** (wouter): `/` (main menu), `/settings`, `/solo/:mode` (`sprint`, `marathon` or `ultra`; anything else redirects to `/`), `/online` (the *Play online* menu and the quick-match waiting screen) and `/r/:code` (a room: its lobby, matches and results). Back and forward work, and a refresh on a game route starts a fresh game, since quitting mid-game writes nothing anyway (§13.1). The game route's page loads apart from the rest of the app (`React.lazy`), when a game first opens, since it brings Pixi.
- **Main menu:** *Play online*, *Single player* (Sprint, Marathon and Ultra, each with its personal best beside it) and *Settings*. There is no *Quit*. Menus are driven by the arrow keys and Enter, as in the CLI, and an item with a shortcut key (shown beside it as a key cap) is chosen by that key alone, by its `KeyboardEvent.code` so any keyboard layout works; with Ctrl, Alt or Meta it keeps its browser meaning (Ctrl+R still reloads). The main menu opens on the item last chosen from it, so coming back from a game or the settings, the cursor is where the player left.
- **Devices:** desktop browsers with a keyboard. A touch device with no keyboard sees "Shura needs a keyboard". Touch controls are deferred (§16). Supported browsers are Vite's default build target (current Chrome, Edge, Firefox and Safari).
- **Styling:** CSS Modules, one per component, plus a shared tokens file of CSS variables (colours from the theme, type, spacing). The UI is built from native HTML elements (`<dialog>`, `<input type="range">`, checkboxes, radios) wrapped in our own styled primitives (`Button`, `MenuList`, `Slider`, `Toggle`, `RadioGroup`, `Dialog`, `KeyCapture`) in `apps/web/src/components/ui/`. No component library. The look (§13.1) on the web: Pixelify Sans for display text and Silkscreen for labels and keys, both self-hosted with `@fontsource` packages; 4 px cream borders with hard offset shadows instead of blurred ones; and a full-window backdrop of three slowly drifting colour swirls. No text on the page can be selected, as in a game. The only typed text is the nickname and the room code, in their own inputs. Web themes add the colours only the web needs, in each theme's `web` group, which the CLI ignores: the panel and the deep (darkest) panel colours, the shadow colour (ink), the muted text, the three swirl colours with their alpha, and the board's checkered well. The `useTheme` hook sets the theme's colours as CSS variables on `:root`, so switching theme needs no reload.
- **Boards:** drawn with PixiJS. A `<BoardCanvas>` component creates a Pixi application on mount and destroys it on unmount. Inside, plain Pixi code reads the session store on Pixi's own ticker and draws, outside React's render cycle, so React never re-renders per frame. A pure `layoutBoard(state, theme, skin, cellSize)` turns the state into plain shapes, and a thin painter draws them: the checkered well (the theme's two well colours), the locked cells (garbage in the theme's garbage colour), the ghost when the setting is on (not once the game has ended), the active piece, the hold on the left (greyed out in the grid colour once used for the piece) and the 5-piece preview on the right, each in a cream frame with a hard shadow. Hold and the preview draw pieces at the full cell size, so their art is as sharp as the board's. The 2 rows above the visible 20 are drawn too, without the checker, so a piece that has just spawned is seen whole, and the boxes' labels sit there. The whole layout is 23 cells wide and 22.5 high (half a cell of margin for the frames), and every position in it is a whole number of art pixels. The cell size is the largest multiple of 8 physical pixels at which the board, hold and preview fit the window's height (and its width, on a narrow window), at least 8, so each pixel of a skin's 8×8 pixel art is a whole number of physical pixels, and Pixi renders at the device pixel ratio with pixel rounding, so the art stays sharp. The layout is centred in the window on a whole physical pixel; the rest is margin. The cell size is worked out again when the window is resized or its pixel ratio changes (zoom, or a move to another screen). The HUD sits in the column under the hold. Pixi shares one WebGL test context across applications; each application's own context is released when it is destroyed. The game loop's `requestAnimationFrame` clock only wakes the session, and its time only runs, once the board is on screen: `<BoardCanvas>` says so on the ticker's tick after its first paint, and the game starts then, with its countdown. Pixi's start-up can hold the main thread for over a second on a slow machine (software WebGL at a high pixel ratio), which the session would otherwise take for a stall (§13.1) and pause the game during the countdown. So a session React makes and throws away (as Strict Mode does in development) never runs, and it stops on unmount. React renders menus, the lobby, settings, results and the overlays (countdown, in-game menu, callouts).
- **Effects:** drawn by Pixi from engine events (§13.1), as overlays that never delay play: the engine has already removed cleared rows, and Sprint times are unchanged. Line clears flash and burst into pixel particles in the cleared cells' colours (bigger for more lines), and clears of two or more lines shake the board (harder for more lines). Hard drops leave a short trail (at most 4 rows) and nudge the board down 3 px. T-spins, back-to-backs and perfect clears get a larger burst (twice the particles), and a T-spin that clears nothing bursts from its piece. Bursts and callouts grow with the combo, up to combo 10. A back-to-back is worked out as for the callouts, with the same `trackBackToBack`. Callouts are React text beside the board, in the column under the hold below the HUD: the latest notable lock's, for 2 s or until the next one's take their place. Under *Full* and *Reduced* they pop in and grow with the combo (up to combo 10). A level-up pulses the board border in the accent colour, a top-out fades the stack to grey from the top (it stays grey until the next game), and a lock briefly brightens the locked cells that are left once its rows have cleared. Effects that draw cells (the brightening, the grey) draw them in the current skin, with the board's draw function. The events of one wake can span several frames, so each effect waits for its own frame. A pure function (`effectsForEvents`) turns a wake's events and the setting into effect descriptions, a second (`effectFrame`) turns the running effects into shapes and the board's offset at a given time, and a thin Pixi painter draws them over the board on its ticker. The board subscribes to the session's events itself; effect state lives in the painter, not in the session's store, and a new game drops it. The *Effects* setting is *Full*, *Reduced* (no shake, nudge or trails) or *Off*, defaulting to *Reduced* when the system asks for reduced motion (`prefers-reduced-motion`) and *Full* otherwise. Callouts show in every setting, as plain text when effects are off.
- **Sound:** short `.mp3` effects from one CC0 pack, Juhani Junkala's "512 Sound Effects (8-bit style)" (credited in `apps/web/public/sounds/CREDITS.md` anyway), played through Web Audio from the session's engine events (§13.1). Each sound is a file named after it (`lock.mp3`, `tetris.mp3`), so a file can be replaced without touching game code. A pure function (`soundsForEvent`) picks each engine event's sounds, and a small player over plain Web Audio plays them.
  - A lock plays one sound for the biggest thing it did: a perfect clear, else a T-spin (with or without lines), else its single, double, triple or Tetris, else the plain lock. A hard drop plays its own sound just before its lock's.
  - Each combo step (combo 1 and up) also plays one combo sample, a semitone higher per step: as recorded at combo 1, up to 11 semitones higher at combo 12. The combo sample is a soft triangle-wave note, quieter than the clear it plays over.
  - Hold, turn, garbage landing, level-up, top-out and finish each have a sound. Moves, soft drops and failed turns are silent.
  - Volume is 0–100 in steps of 10 (0 is off), default 50; it sets the gain (50 is half), and a change applies at once.
  - Audio starts at the first key press on a game page, as browsers require: that press makes the audio context and loads and decodes every sound once for the page's lifetime, so nothing plays (or queues) before it. A later key press resumes audio the browser has suspended. A sound that fails to load stays silent, and a browser without Web Audio plays nothing.
- **Keyboard:** game keys call `preventDefault`, their ignored repeats included, so Space and the arrows don't scroll; every other key keeps its default. The session listens on the window, for as long as the game's page is open, and Esc or P opens the in-game menu during the countdown or play (unless something on the page has already handled the key). When the window loses focus mid-game (`blur`, or `visibilitychange` to hidden), every held key is released and a single-player game opens the in-game menu (as after a stall, §13.1). Browsers don't let a page block Ctrl+W, Ctrl+T or Ctrl+N, so the settings screen warns when W, T or N is bound while Ctrl is.
- **Countdown:** "3", "2", "1" and "GO" pop in over the well, from `countdownLabel` (§13.1), for a new game, a restart and a resume.
- **In-game menu:** a modal `Dialog` titled *Paused*, open whenever the session is paused (by Esc or P, a stall, or lost focus), with *Resume* (Esc), *Restart* (R), *Settings* (S) and *Quit to menu* (Q) (§7.4). The cursor starts on *Resume*, so Enter resumes too; Enter chooses whatever item the cursor is on. *Settings* shows the settings screen in the menu's place, in the same dialog, and its Esc or *Back* returns to the menu with the cursor on *Settings*. While it is open the game's key listener is off: held keys are released as it opens and no key reaches the game. Keys pressed or released in the menu itself still reach the session (§13.1). *Quit to menu* goes to `/`, recording nothing.
- **Results:** a modal `Dialog` once the game has ended, titled *Finished* or *Game over*, with the mode's name, its headline, the personal best line (once `useSoloRecord` has recorded the run), then lines, pieces, pieces per second, the score or time the headline isn't, and the level (§13.1). *Play again* (R) restarts; *Main menu* (Esc, and Enter, since the cursor starts there) goes to `/`, where the mode's new best already shows. The page gets the personal best line from `useSoloSession`, which reads `useSoloRecord`, and passes it to the results: the results feature doesn't use `features/personal-bests` (the main menu's summaries), since features never import each other.
- **Settings screen:** at `/settings`, and from the in-game menu's *Settings* over the paused game (§7.4). Esc or *Back* leaves it: to the main menu from `/settings`, back to the in-game menu from a game. Tab moves between the controls and the arrows change them; the first control has the focus when it opens. Every change goes to the settings store and is saved at once; a save that fails says why under the form, and the change still holds until the page is closed.
  - **Handling:** a slider each for DAS and ARR, a frame a step, showing milliseconds and frames (`167 ms (10 frames)`, and ARR 0 as `0 ms (instant)`), and one for the soft-drop factor (`×5` to `×40`, then `instant`), within the §7.2 ranges.
  - **Keys:** each game control's keys as key caps, named for people (`Left Ctrl`, `←`, `X`), then an empty slot that adds one. Enter, Space or a click on a cap waits for a key ("Press a key"), and the next key pressed is bound there by its code, modifiers alone included, with the swap rule (§7.4); the line under the form says what the other control got or lost ("Rotate CW gets C."). The browser's key repeat is ignored, so a held Enter doesn't bind itself. Esc cancels and Tab moves on, so neither can be bound, and P is refused because it opens the menu. Delete or Backspace on a cap removes its key, and *Reset keys* brings back the web's defaults. The Ctrl warning (Keyboard, above) shows under the keys.
  - **Display:** the ghost (a switch), the theme (Indigo, Plum or Deep Sea, applied at once) and the skin (Pixel, Flat or Outline, each with a preview of a few cells drawn on a canvas).
  - **Effects:** *Full*, *Reduced* or *Off*. While the setting is unset, the option the system resolves it to is checked, with "Following your system" beside it; choosing one sets it, and from then on the system no longer decides.
  - **Sound:** the volume, a slider from 0 (shown as "off") to 100 in steps of 10.
- **Settings and records** are stored in two `localStorage` keys (§13.1), `shura.settings` and `shura.records`, through client-core's `Storage`:
  - Invalid settings fall back to the defaults, with a notice under the main menu. The stored text stays as it was until the settings are next saved.
  - Invalid records are moved to a backup key, never dropped: `shura.records.bak`, or `shura.records.bak-2` and so on if an older backup is already there. A notice under the main menu says where they went, and a fresh set of records starts.
- **Tests:** Vitest with React Testing Library and happy-dom for the primitives and screens, and unit tests for `layoutBoard`, `effectsForEvents` and `effectFrame`. Each mode's route is played to its results with the engine's recorded game (§5.3), its keys fired on the window through the default web bindings on fake animation frames, so the keyboard, the loop, the HUD, the results and the personal bests are tested together. The Pixi painters are kept thin and untested. End-to-end tests wait (§16): a manual checklist, [`web-browser-checklist.md`](web-browser-checklist.md), covers real-browser behaviour (focus, audio, device pixel ratios, no GPU, touch devices, Safari), and from M4 online play (two tabs and a CLI, a room by code and quick-match, a reconnect through DevTools' offline mode, a hidden tab, spectating).
- **Online** (the [match screens mockup](https://claude.ai/artifact/Pijgo3kT79ydG7hCRT31f2) shows the match, spectating and results). Both UIs show the same online screens, over client-core's online session (§13.1); only the drawing differs.
  - ***Play online*** (`/online`) opens a menu: **Quick match**, **Create room** (then *1v1* or *FFA*), **Join room** (a 4-character code, uppercased as it's typed, with the removed characters refused at once, §10.3) and *Back*. The nickname prompt (§13.1) comes first if there's no nickname yet. While connecting it shows "Connecting…", and if the server can't be reached, "Can't reach the server" with *Retry*.
  - **Version mismatch** (§8.3): "A new version of Shura is out", and Enter reloads the page.
  - **Quick match** shows a waiting screen with the time waited and *Cancel* (Esc). A match found goes straight to the countdown.
  - **Links:** opening `/r/K7QX` joins that room, after the nickname prompt if needed. An unknown code says "No room with that code" and goes to `/online`. A player in a room is on its `/r/:code`, so the address bar holds its link.
  - **Lobby:** the room code, big, and the mode, with *Copy link*. The seats (2 or 8 rows): each player's nickname, a dim `guest` or `bot` tag, the host's crown, `ready` or `not ready`, and their place in the last match; empty seats show as empty. The spectators under them, with a count. The player's ping in a corner, in milliseconds, green under 80, yellow under 150, red above (their own only). Keys, each shown as a key cap: **R** or Enter toggles ready (Enter is *Start* for the host, once at least 1 other seated player is ready, with a hint saying what it waits for otherwise), **S** steps out to spectate or takes a free seat, **N** changes the nickname, **Esc** leaves the room for `/online`. Joins, leaves and host changes ("Mira is now host") show as toasts. No chat. Quick-match rooms skip the lobby (§9.4).
  - **Match:** the player's board as in single-player, plus the **garbage meter** on the well's left edge: a bar of the attacks in their garbage meter, one segment per attack, bottom up, in the theme's garbage colour, the newest flashing as it arrives. The HUD under hold shows lines sent, pieces per second, the players still in (FFA) and the ping. In a 1v1 the opponent's board sits on the right with their name, meter, hold and preview, at the player's cell size if the window fits both, otherwise as large as fits (a multiple of 8, as always). In an FFA the opponents share the space right of the player's board in a grid whose column count is whichever gives the largest boards (a 4×2 grid at 16 px cells for 7 opponents in a 1600×900 window), each at least 8 px a cell and showing only the well, name and meter. Each time the server routes garbage (`garbageQueued`), a short **attack streak** of pixels flies from the attacker's board to the target's meter; it follows the effects setting. Opponents' locks make no callouts and no sound. An out board greys and shows its place and why (*topped out*, *lagged out*, *removed*, *left*). A player who is out keeps watching with their board greyed and a "Spectating" banner with *Leave* (Esc). Esc or P opens the online menu (§7.4), an overlay that doesn't pause, and losing focus opens it too. "Reconnecting…" shows over the HUD while the connection is down (§10.2).
  - **Spectating:** every board at the same size in a grid, with no board of the spectator's own, under a banner ("Spectating · you take a seat at the next lobby") with *Leave* (Esc).
  - **Results:** an overlay over the match: the player's place as its title, then every player's place with their lines sent, attack per minute and pieces per second, the player's row highlighted. Enter, or 10 s, goes back to the lobby. In a quick-match room: *Rematch* (Enter) and *Leave* (Esc) instead (§9.4).
  - **Hidden tab:** the loop runs from `worker-timers` while the tab is hidden (§8.4).
- UI text is in English. Nicknames in any script, Hebrew included, display correctly.
- In dev, Vite forwards `/ws` to the gateway, so the browser sees one origin. `/api` is added when something uses it (§9.1).

**Code layout:** the folders of `apps/web` and the rules for what goes where are in [`apps/web/AGENTS.md`](../apps/web/AGENTS.md): pages in `app/routes/` compose features, features never import each other, and the import direction is checked by Biome.

### 13.3 CLI

- **Your board:** 10×20 cells, each 2 characters wide (the skin's characters, `██` by default, §13.1), with hold on the left and the 5-piece preview on the right. The 2 rows above the visible 20 are drawn too, without walls, so a piece that has just spawned is seen whole. The HUD sits under hold, and the status line (`input: precise`) under the board.
- **Opponent boards:** half-block characters (`▀`/`▄` with foreground/background colors), so each takes 10×10 characters plus a name and garbage meter. Up to 7 fit beside your board on a ~120×30 terminal. Smaller terminals show opponents as a list (name, stack height, alive or out).
- **Online:** the same screens as the web (§13.2), drawn as text: the *Play online* menu, the nickname prompt, the waiting screen, the lobby (the room's link printed as text), the match, spectating and results. The garbage meter is a column of `▐` on the left of each well, in the garbage colour. An attack flashes the target's name instead of a streak. The ping shows in the HUD and the lobby.
- **Minimum size:** 80×24. Below that the CLI shows "please enlarge the terminal". If the terminal shrinks below it during a single-player game, the game opens the menu behind the message, and the menu's and the results' keys do nothing until the terminal is big enough again, so a game can't resume unseen.
- **Countdown and menu:** drawn over the middle rows of the board, between its walls, each line covering a whole board row. The countdown shows "3", "2" and "1", then "GO" for the first 0.5 s of play. The in-game menu shows "PAUSED" and its entries, each with its shortcut keys at the right (`Resume  Esc, Enter`, §7.4). Only key presses run a menu shortcut; game keys pressed or released while the menu (or the results) is up still reach the session, so they count at the next Go (§13.1).
- **Results:** replace the game once it ends: the mode, "FINISHED" or "GAME OVER", the headline (Sprint's time, every other mode's score) with the personal best line under it, then lines, pieces, pieces per second (two decimals), the score or time the headline isn't, and the level, then the keys (R plays again, Enter or Esc goes back to the main menu).
- **Color:** the theme's colours (§13.1), 24-bit when supported, otherwise its 16 ANSI colors. `--no-color` / `NO_COLOR` draws cells as glyphs instead, whatever the skin.
- **Rendering:** Ink renders at about 30 fps, while the game logic stays at 60 fps in client-core. Each board is turned into one pre-colored string per row and drawn as a single `<Text>` per row, never one component per cell.
- **Silent:** no sound.

**Distribution:** the npm package `shura`, a single bundled file with no runtime dependencies, requiring Node ≥ 26. Run with `npx shura` or `npm i -g shura`. There's no standalone binary for now (§16).

**Code layout:** the folders of `apps/cli` and the rules for what goes where are in [`apps/cli/AGENTS.md`](../apps/cli/AGENTS.md).

**Commands** (`shura --help`; `shura solo --help` describes each mode):

```
Usage: shura [command] [options]

Without a command, shura opens the menu: Play online, Single player, Settings,
Quit.

Options:
  --server <url>     the server for online play
  --name <nickname>  your nickname for online play
  --input <adapter>  how keys are read, instead of choosing from the first key:
                     precise for terminals with the Kitty keyboard protocol,
                     basic for any other (choices: "precise", "basic")
  --no-color         draw cells as characters instead of colour (or set
                     NO_COLOR)
  -v, --version      print the version
  -h, --help         show this help

Commands:
  solo <mode>        play a single-player game: sprint, marathon or ultra
  quick              join the 1v1 quick-match queue
  create [options]   create a room (1v1 unless --mode ffa) and print its code
                     and link
  join <CODE>        join a room by its code
```

Every flag goes with every command, before or after it. `create` makes a 1v1 room unless `--mode ffa` says otherwise (`--mode` goes with `create` only), and `join` takes a room code (§10.3) in either case. `shura` and `shura solo` need an interactive terminal and say so otherwise. A mistake in the arguments prints what was wrong and the help (that command's own, for a mistake in a command), and exits with code 2. `quick`, `create` and `join` open straight on the quick-match waiting screen, a new room's lobby or that room's lobby, after the nickname prompt if there's no nickname and no `--name`, and like `shura`, they need an interactive terminal. Leaving lands in the *Play online* menu, as leaving a `shura solo` game lands in the main menu. `--name` sets the nickname for that run without saving it. A version mismatch prints `npm i -g shura@latest` and exits with code 1. The help lists every command and flag except `--debug-input` (§7.3), which is for capturing input and goes with `shura` and `shura solo`.

**Main menu:** what `shura` opens on. Its entries are *Play online*, *Single player*, *Settings* and *Quit*, with the cursor on *Single player*. *Single player* opens a list of Sprint, Marathon and Ultra, each with its personal best beside it (§13.1): Sprint's time, Ultra's score, and Marathon's score with the level and lines it reached (`171,349 (level 15, 150 lines)`), or "no record yet". ↑/↓ move the cursor (stopping at the ends), Enter chooses, and Esc goes back from the list. Only key presses choose, so the release of the Enter that started a game or left the results does nothing, and Esc on the main page does nothing either: *Quit* and Ctrl+C quit. The short notices about the stored files (below) show under the menu too. Quit to menu and going back from the results return to the main menu, where it was left: the list, on the mode just played, so the same mode is one Enter away (a new session, from a fresh seed). Leaving the settings returns to the main page, on *Settings*. A game started by `shura solo <mode>` works the same way: it opens straight on that game, and quitting to the menu or going back from its results opens the main menu on that mode's entry, as if it had been chosen there; only *Quit* and Ctrl+C leave the CLI. While the terminal is too small the menu's keys do nothing, as the game's and the settings' don't.

**Settings screen:** handling (DAS, ARR and soft-drop factor, stepped within the §7.2 ranges), a "press a key" rebind for each action with the swap rule, the ghost toggle, the theme and skin pickers, and the nickname. Volume and effects are the web's (§13.1) and aren't shown. It's reached from the main menu and from the in-game menu, and fits 80×24 beside the `--debug-input` panel.

- ↑/↓ choose a row and ←/→ change it. DAS and ARR show their milliseconds and frames (`167 ms (10 frames)`), the soft-drop factor `×20` or `instant`, and each skin its cell (`Flat ▓▓`). An arrow beside a value shows which ways it can still change: the steppers and pickers stop at their ends.
- Each action's row lists its keys. ←/→ choose one of them, or the empty slot after the last, which adds a key. Enter asks for a key ("Press a key for Hold"), and the next key pressed is bound there with the swap rule (a key's OS repeat isn't a press, so in a terminal without key releases a held Enter doesn't bind itself: the screen tells presses from repeats as the basic adapter does, §7.3), the line under the screen saying what the other action got or lost ("Rotate CW gets C."). Esc cancels the prompt. Backspace or Delete clears the chosen key.
- Refused, with a message, while the prompt waits for another key: a key the terminal can't report on its own (anything with Ctrl, Alt, Super or Hyper, Tab, Backspace, the function and editing keys), P, which opens the menu (as Esc does, which cancels the prompt instead), and a key pressed with Shift, which both adapters read as the key alone (the precise adapter drops the modifier, the basic adapter reads a capital as its small letter), so Shift+X would bind X.
- Each change goes to the settings store and is saved at once, so it survives Ctrl+C. A save that fails says why on the screen, and the change still holds for this run. If the last save failed, the CLI says why again on the terminal after quitting, with the stored files' messages (below). Esc leaves.
- While the terminal is too small to show it, its keys do nothing, like the menu's.

**Quitting:** Ctrl+C quits at once from anywhere and restores the terminal (cursor, keyboard protocol, alternate screen). A game in progress is dropped.

**Config:** `~/.config/shura/config.json` (XDG; `%APPDATA%\shura` on Windows) holds the settings: nickname, bindings, handling, ghost, theme, skin and server URL. Server precedence: `--server` > `SHURA_SERVER` > config file > production default compiled into the build.

**Records:** personal bests (§13.1) live in `records.json` in the XDG data directory (`~/.local/share/shura/`; `%LOCALAPPDATA%\shura` on Windows), apart from the config people edit by hand. Both files are written atomically (a temporary file, then a rename), so a crash mid-save never corrupts them. An invalid `config.json` falls back to the defaults with a message that says what's wrong. An invalid `records.json` is moved to `records.json.bak` and a fresh one started, with a message, so personal bests are never silently lost. The game drew on the alternate screen, so these messages show in short in the status line during the game, and in full on the terminal after quitting.

**Update check:** at most once a day, a non-blocking request to the npm registry. If a newer version exists, a one-line notice appears in the menu. `SHURA_NO_UPDATE_CHECK=1` disables it.

### 13.4 Bot (testing tool only)

**Testing tool only. Not part of the product.** `apps/bot` exists so one person on one laptop can fill an FFA, and so M5 can load-test with hundreds of players. It is never deployed and has no Docker image. Its README opens with the same warning.

- A small long-running service with an HTTP API on its own port (8090): `POST /bots { room: "K7QX", count: 5, profile: "casual", pps? }` or `{ quickMatch: true }`, and `DELETE /bots?room=K7QX`. `pnpm bot join K7QX --count 5` (and `pnpm bot quick`) calls it. `pnpm dev:bot` starts it; `pnpm dev` doesn't.
- Each bot is a client like any other: it connects to the gateway's public WebSocket and plays through client-core's online session (§13.1), with no special trust, so it exercises the real path. Its `hello` says `kind: 'bot'`, and the lobby tags it `bot`. Names come from a list (`Ada`, `Turing`, …).
- **It plays like a person.** A pure brain (board, piece, profile and a seeded RNG → a placement) scores each rotation and column by holes, height and bumpiness, using the engine's helpers such as `canMove`, and picks among its best few with weighted randomness, so it sometimes leaves a hole and only sometimes holds or goes for a T-spin. The bot then presses keys through client-core's real input engine with human handling (DAS 167 ms, ARR 33 ms), so its pieces slide, turn step by step and soft-drop, never teleporting. It thinks 250–700 ms before each piece (longer when its stack is high), its speed drifts around a target, and now and then it fumbles: a wrong tap, then a correction.
- These knobs (think time, target speed, mistake rate, how far it looks ahead) are a **bot profile** (`BotProfile`). v1 has one, `casual` (about 1 piece per second, a beatable opponent), and `pps` overrides the speed for load tests. Difficulty levels for PvE are future work on the same profiles (§16).

---

## 14. Tooling and development

| Concern | Choice |
|---|---|
| Package manager | pnpm workspaces, version pinned via the `packageManager` field + corepack (installed from npm, since Node 25+ doesn't bundle it). Versions shared by several packages live in the `catalog:` in `pnpm-workspace.yaml`. Install scripts run only for packages listed under `allowBuilds` |
| Task runner | Turborepo (task graph and caching, with the cache shared to CI through the Actions cache) |
| Language / runtime | TypeScript (strict), ESM only, Node 26 LTS |
| Internal packages | Source-only, no build step. `typecheck` = `tsc --noEmit` per package, cached by Turbo |
| App builds | `gateway`, `game`, `cli`, `bot`: esbuild → one unminified JS file + source map, run with `--enable-source-maps`. `web`: Vite |
| Docker images | `node:26-slim` + the bundle (+ source map). Native optional dependencies such as `bufferutil` are left out of the bundle and installed in the image |
| Tests | Vitest everywhere, with one workspace config and a project per package. Tests live in `tests/` next to `src/` in every app and package, with test-only helpers in `tests/support/`. Ink components via `ink-testing-library`, web via Testing Library. Playwright end-to-end tests come later |
| Lint / format | Biome (`biome.json` at the root) for code, JSON, YAML and CSS. Markdown is excluded, because Biome's Markdown formatter rewrites YAML frontmatter |
| Git hooks | lefthook: Biome on staged files before commit. Before push: reject pushes to `main` and branch names that don't match the convention. The allowed types and scopes live in `scripts/conventions.sh`, which both the hook and CI read |
| Service config | Environment variables validated at startup by a zod schema in each service. `.env.example` is committed |

**Dev workflow:**

```
pnpm dev        docker compose up -d valkey  →  turbo dev:
                gateway :8080 (tsx watch) · game :8081 (tsx watch) · web :5173 (Vite, forwards /ws)
pnpm cli        Ink client in its own terminal (needs a real TTY); defaults to ws://localhost:8080
pnpm dev:game2  second game instance on :8082 to test multi-pod behaviour
pnpm dev:bot    the bot tool on :8090 (testing only, §13.4)
pnpm bot        join K7QX --count 5 · quick: asks the bot tool for bots
pnpm check      Biome + typecheck + test across the repo (the same command CI runs)
```

`.env.example` sets `LIMITS_EXEMPT_IPS=127.0.0.1,::1`, so the per-IP limits (§11) don't block a laptop running several clients and bots.

**Testing online play (from M4):**

- `gateway` and `game` take a clock (`now()` and timers) as client-core's loop does, so tests drive countdowns, the 1 s and 3 s windows, the 30 s seat hold, `GARBAGE_ACK_TIMEOUT` and empty-room deletion with fake time, without waiting.
- Integration tests run `gateway` and `game` in one process against the in-memory `valkey` versions, so they don't need Docker. Their clients are client-core's real online session, with scripted inputs or bot brains. They cover a full 1v1 and a 4-player FFA through to `matchEnd`; garbage, with `garbageReceived` and a clear that cancels an attack between its sending and its receipt (§8.5); top-outs at the same frame sharing a place; a reconnect within 3 s carrying on and one after it spectating; a client running ahead being removed; a version mismatch; and each limit tripping.
- Every integration match ends by checking that each client's own engine hash equals the server's copy of that player's game at the final frame: the server's verdict and the client's game agree.
- Each `packages/valkey` interface has one test suite, run against the in-memory version always and against real Valkey when `VALKEY_URL` is set. CI runs a Valkey service container, so both run on every PR. Locally, `VALKEY_URL=redis://localhost:6379 pnpm check` runs them against `pnpm dev`'s Valkey.
- `packages/protocol` has schema round-trip tests, and a stored snapshot of the schemas' shape that fails when a message or field is removed or renamed without a `PROTOCOL_VERSION` bump.

---

## 15. Repository conventions, CI/CD and releases

The full rules for contributors are in [`CONTRIBUTING.md`](../CONTRIBUTING.md). Summary:

- **Branches:** `<type>/<scope>-<short-description>`. CI checks them against the pattern below. Bot branches (`changeset-release/main`, `dependabot/*`) are exempt.

  ```
  ^(feat|fix|refactor|perf|test|docs|chore|ci|build)/(engine|protocol|client-core|valkey|gateway|game|web|cli|bot|repo|deploy)-[a-z0-9]+(-[a-z0-9]+)*$
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
| Accounts, database, leaderboards, replays, log archive, ratings | Future. The match log is already complete for this. Sign-in and data people read go over HTTP at the reserved `/api`, in the gateway or a service of its own; play stays on the WebSocket, with an optional `accountToken` in `hello` (§8.3, §9.1). Players already carry `kind: 'guest'` (§10.2) |
| PvE bots and difficulty levels | Future. Builds on the bot tool's `BotProfile` (§13.4), with the server spawning bots itself |
| 6-character room codes for private rooms | Future (§10.3) |
| Chat, other players' pings, changing a room's mode | Future. A room's mode is fixed at creation (§10.1); the ping shown is the player's own (§13.2) |
| Player-chosen FFA targeting | Future. One new action plus a new `chooseTarget` |
| Classic (NES) rules mode | Future. Rotation and randomizer are pluggable |
| Battle Royale, Co-op | Future. Co-op breaks the one-player-one-board assumption |
| FFA quick-match | Future |
| UI localisation | Future. English only for now |
| Composite actions (`shiftToWall`, `sonicDrop`) | If action counts at ARR 0 or with instant soft drop become a problem. The input engine sends plain moves for now (§7.3) |
| Personal best history | Future. Only the best run per mode is kept, with its action log (§13.1) |
| OpenTelemetry tracing | When needed |
| Playwright end-to-end tests | After M4, once the online screens have settled. Until then the web keeps a manual real-browser checklist, with an online section from M4 (§13.2) |
| Touch controls on the web: on-screen buttons (a new adapter feeding the input engine) and swipe gestures (their own input model and handling) | Future. The web is desktop and keyboard only for now (§13.2) |
| CLI callouts as text | After M3. Callouts come from engine events, which the CLI already receives (§13.1) |
| More themes (e.g. a light theme), sound packs as a setting | Future. Themes are data (§13.1), and sounds are files named after them, picked for each engine event by one pure function (`soundsForEvent`), so a pack is a folder of files (§13.2) |

---

## 17. Roadmap (v1)

| # | Milestone | Done when |
|---|---|---|
| M0 | Repo skeleton: tooling, empty packages and apps, CI, `main` ruleset, lefthook, docs, Docker Compose with Valkey | `pnpm check` passes in CI, and a non-conforming branch or PR is rejected |
| M1 | Engine: rules from §3, `serialize`/`restore`/`hash`, replay-hash suite | The rules are tested, and recorded matches replay to their expected hashes |
| M2 | CLI single-player: client-core loop + input engine, both adapters, Ink board rendering, the three modes, settings screen, config and records files | All three modes are playable offline via `pnpm cli` with both input adapters, and settings and personal bests are kept between runs |
| M3 | Web single-player: app shell and routes, PixiJS board with effects and callouts, the three modes, settings screen, themes and skins, sound, engine events | The same game in the browser via `pnpm dev` and `vite preview` (no public hosting), with settings and personal bests kept between visits |
| M4 | Multiplayer core: `garbageReceived` in the engine, protocol + handshake, Valkey interfaces, gateway, game, match log, clock enforcement, placements, session tokens, reconnect, spectating, quick-match, limits, the online screens in both clients, the bot tool | A 1v1 by quick-match and by room code, and an FFA by room code, between web, CLI and bots on a laptop, with every match verified by the server |
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
