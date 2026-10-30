---
status: accepted
---

# Internal packages export TypeScript source; only apps are built

`engine`, `protocol`, `client-core` and `valkey` point their `exports` at `src/index.ts` and have no build step. Every consumer already understands TypeScript (Vite, esbuild, Vitest, tsx), so edits take effect immediately everywhere with no per-package watchers. Type safety comes from a `typecheck` task (`tsc --noEmit`) per package, cached by Turbo. The deployable apps (`gateway`, `game`, `cli`) are each bundled by esbuild into one unminified JS file with a source map, and `web` is built by Vite.

## Consequences

- Adding a `dist/` build to an internal package is unnecessary. It's only needed if that package is ever published to npm.
- Docker images contain Node plus one bundle, with no `node_modules` apart from native optional dependencies such as `bufferutil`.
