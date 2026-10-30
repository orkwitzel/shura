import { defineConfig } from 'vitest/config';

// Lets `pnpm vitest` (and editors) run every package's tests from the root.
// CI runs each package's own `test` script through Turbo instead, for caching.
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
  },
});
