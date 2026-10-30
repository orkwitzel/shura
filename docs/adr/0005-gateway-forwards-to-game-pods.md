---
status: accepted
---

# The gateway forwards room traffic to the owning game pod

Each client keeps one WebSocket to any gateway pod. The gateway looks up the room's owner in Valkey and forwards messages over an internal connection. Game pods are never publicly addressable. The cluster needs one public route and plain Deployments, and when a room moves to another pod (phase 2 recovery), the client's connection survives and the gateway just re-forwards.

## Considered options

- **A route per game pod (the Colyseus model):** a StatefulSet plus a Service and Gateway API route per pod, with the client connecting to `/g/game-N/ws` after asking where the room is. It saves a hop and keeps game traffic off gateways, but every pod needs its own route kept in sync with scaling, and clients must reconnect when a room moves.
- **Hash-based proxy (consistent hashing on the room code):** the hash decides placement, which conflicts with load-aware placement and reassignment, and adding pods remaps live rooms.
- **Valkey pub/sub as the message path:** puts Valkey in the real-time path twice per message.

## Consequences

- About 150 lines of forwarding code, one sub-millisecond extra in-cluster hop, and gateway CPU spent on game traffic.
