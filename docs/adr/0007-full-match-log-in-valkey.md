---
status: accepted
---

# A complete input log per match in Valkey, with no checkpoints

The `game` service appends every match's seed, settings and verified input batches to a Valkey stream (`log:{matchId}`, one pipelined append per room every 100 ms). A batch is acknowledged to its client only after the append succeeds. The log is kept **complete** for the whole match, with no checkpoints and no trimming. It serves crash recovery (a new owner replays it, in phase 2), and once accounts and a database exist, the full match history can be archived from it unchanged (replays, disputes, cheat review) without rewriting this part of the system. A complete log also makes recovery depend only on the engine, not on `serialize`/`restore`, and lets any match be replayed from frame 0 for debugging.

## Considered options

- **Latest checkpoint plus a short input tail (e.g. 5 s).** Bounded, small memory (~90 KB per full room), but the history before the checkpoint would be lost on a crash, so a future archive would be incomplete. Moving to it later would just be a trimming setting.
- **Registry only, no log.** A pod crash loses its matches, and deploys must wait for matches to end.

## Consequences

- Valkey memory grows with match length: ≈ 0.7 MB for a 3-minute 1v1, ≈ 2.9 MB for a 3-minute 8-player FFA, ≈ 0.5–1 GB at peak for 1,000 rooms. Margin time keeps versus matches bounded.
- v1 writes the log (acks, sequence numbers, ownership epochs, deletion at match end). Failover, fencing and replay recovery are phase 2, so they add new code without protocol changes.
- Valkey replication is asynchronous. A failover coinciding with a pod crash can lose up to ~1 s of appends, and that match becomes a no-contest.
