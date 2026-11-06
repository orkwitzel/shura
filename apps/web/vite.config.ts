import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const gateway = 'http://127.0.0.1:8080';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // `@/` is `src/` (apps/web/AGENTS.md), here, in tsconfig.json and so in Vitest.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // IPv4 loopback, as every dev default is (docs/design.md §14): Vite's own `localhost` binds
    // only `::1` here, which `127.0.0.1:5173` can't reach. Browsers try both for `localhost`.
    host: '127.0.0.1',
    // One origin in dev, like production: /api and /ws go to the gateway (docs/design.md §13.2).
    proxy: {
      '/api': gateway,
      '/ws': { target: gateway, ws: true },
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/support/setup.ts'],
  },
});
