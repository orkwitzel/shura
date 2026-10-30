---
status: accepted
---

# Incoming garbage is an input the victim's client acknowledges

Every client runs ahead of the server, so a server-chosen landing frame for garbage could already be in the victim's past. Instead, the server sends `garbageQueued{id, lines, holeSeed}`. The victim's engine applies it at its next piece lock that clears no lines, and records `garbageAccepted{id}` in its own action stream at that frame. The server's replay applies the garbage at exactly that frame, so boards stay identical with no rollback.

## Considered options

- **Server picks the frame, client rolls back if late.** Rollback complexity and visible flicker, for no gain in this game.
- **Apply by wall-clock time.** Not deterministic, so it can't be verified.

## Consequences

- A client could stall to avoid garbage. `GARBAGE_ACK_TIMEOUT` (initially 10 s of game time) treats the player as lagged out. The server never inserts garbage itself, because that would break determinism.
