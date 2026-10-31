import { defineConfig } from 'vitest/config';

// Lets `pnpm vitest` (and editors) run every package's tests from the root.
// CI runs each package's own `test` script through Turbo instead, for caching. Those scripts keep
// Vitest's module cache in the package's own node_modules (`--fsModuleCachePath`): with the default
// cache shared at the root, a lockfile change made every parallel run clear it at once (ENOTEMPTY).
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
  },
});
