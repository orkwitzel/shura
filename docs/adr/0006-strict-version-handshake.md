---
status: accepted
---

# Strict engine and protocol version handshake

Server verification needs every client's engine to produce exactly the server's results, but npm-installed CLIs lag behind deployments. Clients therefore send `protocolVersion` and `engineVersion` (separate integers, independent of package versions) in `hello`, and the gateway rejects any mismatch with an explicit "update" message. Game pods advertise their `engineVersion` in heartbeats, and rooms are placed only on matching pods, which also makes rolling deploys safe.

To keep bumps rare, `protocolVersion` changes only on breaking message changes, since schemas tolerate unknown fields and new fields are optional. `engineVersion` changes only when outcomes change: the replay-hash suite fails CI whenever a recorded match's final hash changes without a bump.

## Considered options

- **Keep several engine versions on the server.** Old clients keep working, but every rules change leaves code behind forever.
- **No checks.** Mismatches would show up as unexplained desyncs during matches.
