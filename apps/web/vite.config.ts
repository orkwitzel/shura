import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const gateway = 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // `@/` is `src/` (apps/web/AGENTS.md), here, in tsconfig.json and so in Vitest.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // One origin in dev, like production: /ws goes to the gateway (docs/design.md §13.2). /api is
    // added when something uses it (§9.1).
    proxy: {
      '/ws': { target: gateway, ws: true },
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/support/setup.ts'],
  },
});
