---
status: accepted
---

# TypeScript everywhere, on Node

The engine must run identically on the server, in the browser and in the terminal ([ADR 0001](0001-deterministic-engine-with-server-verification.md)). With TypeScript for every part, one `engine` package is used as source by `game`, `web` and `cli`, so there's no second implementation and no JS↔WASM boundary. The server and CLI run on Node (26 LTS), chosen for maturity over Bun. The CLI uses Ink and the web client uses React, so both UIs share one component model.

## Considered options

- **Go with a Bubble Tea CLI.** A nicer TUI library, but the browser would need the engine compiled to WASM or written twice.
- **Rust with ratatui and wasm-bindgen.** The best WASM story, but the heaviest to build and change.
