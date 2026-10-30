# Shura

Shura is an online multiplayer falling-block puzzle game with web and terminal clients. These are the terms used in code, docs and discussion.

## Game

**Board**:
One player's 10-wide, 40-tall grid of cells, of which the bottom 20 rows are visible.
_Avoid_: field, matrix, playfield

**Piece**:
One of the seven tetrominoes (I, O, T, S, Z, J, L) under player control or in the queue.
_Avoid_: block, tetromino (in code), shape

**Rotation state**:
One of a piece's four orientations: 0 (as it spawns), R (one turn clockwise), 2 (two turns) and L (one turn anticlockwise).
_Avoid_: orientation (in code), facing

**Kick**:
An offset the rotation system tries when a piece turns, so that it can turn next to a wall, the floor or the stack. A turn takes the first kick where the piece fits.
_Avoid_: wall kick (for kicks in general), nudge

**Mode**:
A named preset of rules and end conditions: Marathon, Sprint, Ultra, 1v1 or FFA.
_Avoid_: mod, variant, game type

**Mode settings**:
The rule values a mode fixes (gravity, lock delay, attack table, margin time and so on). Players can't change them individually.
_Avoid_: config, ruleset

**Lock delay**:
The 30 frames a piece can rest on the stack before it locks. Moving or rotating on the stack restarts it, up to 15 times per piece.
_Avoid_: lock timer (for the rule), grace period

**Attack**:
The number of garbage lines a clear produces, before cancellation.
_Avoid_: damage, lines sent (for the pre-cancellation value)

**Garbage**:
Lines added to the bottom of a board, each with one gap, as a result of an opponent's attack.
_Avoid_: junk, penalty lines

**Garbage meter**:
A player's queue of incoming garbage that hasn't landed yet.
_Avoid_: pending bar, incoming

**Cancellation**:
Using your own attack to remove lines from your garbage meter before anything is sent on.
_Avoid_: blocking, countering

**Margin time**:
The point in a versus match after which the attack multiplier starts to rise, ending stalemates.
_Avoid_: overtime, sudden death

**Top-out**:
A player losing their board through block out, lock out or garbage overflow.
_Avoid_: death, game over (for one player in a multiplayer match)

**Lag-out**:
A player being counted as topped out because their client fell too far behind the server clock or stopped acknowledging garbage.
_Avoid_: timeout, kick

## Input

**Action**:
One atomic engine instruction (move, rotate, hold, soft drop, hard drop, garbage accepted) at a specific frame.
_Avoid_: command, keypress, event

**Frame**:
One tick of game time, 1/60 of a second. The engine's only clock.
_Avoid_: tick, step

**Handling**:
A player's client-side tuning of auto-repeat and soft drop: DAS, ARR and soft-drop factor.
_Avoid_: controls, sensitivity

**DAS**:
Delayed auto shift: how long a direction key is held before auto-repeat starts.

**ARR**:
Auto repeat rate: the interval between repeated moves once auto-repeat has started.

**Precise input / basic input**:
The two CLI input modes. Precise has real key-release events. Basic infers releases from the terminal's key-repeat stream.
_Avoid_: kitty mode, fallback mode

## Online play

**Room**:
A group of players, identified by a code, that plays matches together and outlives any single match.
_Avoid_: lobby (for the whole room), game, server

**Lobby**:
The phase of a room between matches, when players join and ready up.
_Avoid_: waiting room

**Match**:
One game played in a room, from countdown to results.
_Avoid_: round, game, session

**Room code**:
The short code (e.g. `K7QX`) used to join a room.
_Avoid_: room id, invite code

**Host**:
The player who controls a room's mode and starts its matches.
_Avoid_: owner, admin

**Quick-match**:
The global queue that pairs waiting players into a new 1v1 room.
_Avoid_: matchmaking, random match

**Session**:
An anonymous player's identity on the server for as long as their session token is valid.
_Avoid_: user, account, connection

**Session token**:
The secret a client presents to reclaim its session, seat and nickname after reconnecting.
_Avoid_: auth token, cookie

**Spectator**:
A session in a room watching the current match without a board in it.
_Avoid_: observer, viewer

**Input batch**:
A sequence-numbered group of a client's actions covering a few frames, sent to the server.
_Avoid_: packet, input message

**Ack**:
The server's confirmation that an input batch has been verified and recorded in the match log.
_Avoid_: receipt, confirmation

**Relay**:
Verified input batches forwarded to the other players in a room so they can simulate opponents' boards.
_Avoid_: broadcast, echo

**Snapshot**:
The serialized engine state of every player at a frame, sent to a client joining or reconnecting mid-match.
_Avoid_: state dump, sync

**Recorded match**:
An engine test case: the seed, mode settings and action log of a game, plus the hash its final state must have. The replay-hash suite replays every recorded match.
_Avoid_: replay, fixture, recording

**Match log**:
The complete, ordered record of a match's seed, mode settings and verified input batches.
_Avoid_: replay (for the stored data), event log, journal

## Backend

**Gateway**:
The stateless service that holds player connections and forwards room traffic to the right game pod.
_Avoid_: proxy, API server, edge

**Game pod**:
An instance of the stateful service that hosts rooms in memory and verifies their matches.
_Avoid_: game server, worker, shard

**Registry**:
The shared record of which game pod owns each room.
_Avoid_: directory, routing table

**Epoch**:
The number that identifies one period of ownership of a room by a game pod, incremented whenever ownership changes.
_Avoid_: generation, version, term

**Heartbeat**:
A game pod's periodic announcement that it's alive, with its address, room count and engine version.
_Avoid_: ping, health check (that's the HTTP probe)

**Draining**:
A game pod's state while shutting down: it gets no new rooms and finishes or hands off the ones it has.
_Avoid_: terminating, cordoned

**Engine version / protocol version**:
Integers that must match between client and server. Engine version identifies the game rules. Protocol version identifies the message format.
_Avoid_: client version, app version (those are package versions)
