---
status: accepted
---

# client-core state on Zustand, with a shared React layer

client-core holds the state both UIs show: the single-player session, settings and records, and from M4 the connection and room. It's written by code that isn't React (the game loop on timers, later the WebSocket), and both the web and the Ink CLI are React apps. So client-core keeps its state in Zustand stores made with `zustand/vanilla`, which has no React in it, and a second entry point, `@shura/client-core/react`, holds the hooks both UIs share, built on Zustand's `useStore` with selectors. `react` and `zustand` are peer dependencies, and both apps take React from the pnpm catalog, so each app has one React and both use the same version. Components stay per app, because Ink and the DOM render different elements.

Considered and rejected:

- **A hand-written store read through `useSyncExternalStore`:** the same shape, but every app would write its own selector and equality plumbing, and app-level UI state would want a library anyway, leaving two state systems side by side.
- **Jotai atoms:** they work in both UIs too, but the engine produces one snapshot per step, and splitting each snapshot into many atoms every frame adds code on the hot path for derived values a selector computes just as well.
- **Game state in each app's own store:** it splits the shared logic into a web copy and a CLI copy, which is what client-core exists to prevent.
