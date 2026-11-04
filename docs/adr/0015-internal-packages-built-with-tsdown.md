---
status: accepted
---

# Internal packages are built with tsdown

Supersedes [ADR 0010](0010-source-only-internal-packages.md).

The NestJS services (ADR 0014) build with the Nest CLI's SWC builder, which compiles each source file on its own and leaves imports as they are. Node can't run the internal packages' TypeScript source (extensionless imports, enums, parameter properties), so source-only packages no longer work for every consumer. Each consumer transpiling the source its own way was also a risk: Vite, esbuild, `tsx`, SWC and Vitest could each read the same package a little differently.

`engine`, `protocol`, `client-core` and `valkey` are built with tsdown into `dist/`: one bundled `.js` and `.d.ts` per entry point (`@shura/client-core/react` is its own entry), and their `exports` point there. Their sources don't change. Every consumer runs the same compiled output.

- **Turbo:** `build`, `typecheck`, `test` and `dev` depend on `^build`, so packages are built before anything uses them.
- **Dev:** each package runs `tsdown --watch`. Each Nest service runs `nest build --watch` beside `node --watch --enable-source-maps dist/main.js`; `node --watch` restarts on any file it loaded, a package's `dist/` included. Vite and `tsx` pick up `dist/` changes themselves.
- **Images:** the services are no longer one bundle. The image build runs `nest build`, then `pnpm --filter <service> deploy --prod`, and the image holds `dist/` plus production `node_modules`, the workspace packages as their built `dist/`. The CLI and the bot tool stay esbuild bundles.

## Considered options

- **SWC without the Nest CLI, packages kept as source** (`@swc-node/register` in dev, esbuild with an SWC plugin in prod): keeps ADR 0010, but off Nest's documented path, and its handling of extensionless ESM imports was unproven.
- **Explicit `@Inject(Token)` on every constructor parameter, no metadata:** no toolchain change, but boilerplate on every provider and a rule agents can get wrong.
- **Bundling the Nest output with esbuild or `nest build --webpack`:** smaller images, but Nest's lazy optional `require`s are a known source of bundling breakage, or a webpack config to keep.

## Consequences

- A package edit reaches its consumers after its watch rebuild, not instantly.
- Service images are bigger (production `node_modules`) and no longer "Node plus one bundle".
