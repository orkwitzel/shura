---
status: accepted
---

# Stateless gateway, stateful game pods, Valkey as shared state

The backend must scale out and run on Kubernetes, but a live match is a 60 fps simulation that can't be stateless. It's split into a stateless `gateway` (player connections, room and quick-match API, abuse limits) and a stateful `game` service. Each room lives in one game pod's memory for its whole life, and Valkey holds only the shared state: the room → pod registry, the quick-match queue, sessions, pod heartbeats and match logs. Rooms are placed on pods, never players, so two matched players always share a pod. The two services are separate apps in the workspace monorepo with their own Dockerfiles and Deployments, sharing `engine`, `protocol` and `valkey` packages.

## Considered options

- **Live match state in Valkey, any pod processes any batch.** That puts a lock and a read-modify-write round trip on every input batch (~160/s per full room), recomputing what a pod can hold in memory.
- **A single process.** Cheapest to start, but Redis/Valkey and routing would have to be retrofitted later.
- **One image with a `ROLE=gateway|game|all` switch.** Rejected in favour of separate services with clearer ownership. Local dev runs both services plus one Valkey container instead.
- **Agones.** Built for one process per session over UDP with direct node addressing. Too much infrastructure for many small WebSocket rooms.
- **Cloudflare Durable Objects.** A good fit for room-per-object, but it would replace the Node server.

This is the same shape as Colyseus and Nakama: a match is owned by one node, and presence and registry data live in a shared store.
