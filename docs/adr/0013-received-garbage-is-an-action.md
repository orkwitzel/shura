---
status: accepted
---

# Received garbage is an action in the victim's stream

This builds on [ADR 0003](0003-garbage-as-acknowledged-input.md), which stays in force: the victim's client still decides where garbage lands and records `garbageAccepted{id}`. It adds the other end of the attack's life, the moment it enters the victim's garbage meter.

Under ADR 0003 alone, the server added an attack to its copy of the victim's meter when it sent `garbageQueued`, at whatever frame its copy of that game had been verified to, while the victim's client added it when the message arrived, a round trip later and further on in its game. A clear the victim made in between cancelled the attack on the server and not on the client. The two games split, the client's later `garbageAccepted` was refused, and an honest player was thrown out. The engine's `queueGarbage` changed the state between frames without recording which frame, so the server could only guess.

So the victim's client records `garbageReceived{id, lines, holeSeed}` in its own action stream at its next frame after `garbageQueued` arrives, and the engine adds the attack to the meter at the start of that frame, before the frame's other actions. The server keeps the attacks it has sent but not yet seen received, and applies each when its replay reaches the action, checking `lines` and `holeSeed` against what it sent. Relays carry the action like any other, so opponents' boards take the attack at the same frame, and the match log is complete with no side channel. `queueGarbage` is removed. `GARBAGE_ACK_TIMEOUT` still runs from when the server sent the attack, so a client can't stall by never confirming it.

## Considered options

- **A "queued after frame N" note beside the batches.** The server would split its replay at that frame. It works, but it is a second kind of input next to the actions, which the match log, the relay and replays would each have to carry separately.
- **Garbage cancels only once it has landed.** No drift, but no cancellation either, which goes against guideline play and §3.

## Consequences

- Versus outcomes change, so `ENGINE_VERSION` goes to 2 and the recorded 1v1 matches are re-recorded with `garbageReceived` in each victim's log.
- A game's action log is the whole of its input. Replays, the match log and recovery need nothing beside it except the server's FFA routing choices, which the match log records too.
