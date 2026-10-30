---
status: accepted
---

# The input stream carries atomic actions; handling stays on the client

Clients send frame-tagged atomic actions (`moveLeft`, `rotateCW`, `hardDrop`, `softDropOn/Off`, `garbageAccepted`, …), not raw key down/up events. DAS, ARR and soft-drop speed are client settings applied by the input engine in `client-core`, and the engine and server never see them. The engine stays pure game rules, and the server replays actions without knowing how anyone's keys are tuned. The CLI's two input adapters (Kitty-protocol precise mode and the OS-autorepeat basic mode) become interchangeable sources of the same actions.

## Consequences

- The server can't distinguish a human from a script that sends perfect moves. Accepted, as in other competitive clients.
- Changing handling never bumps `engineVersion`.
