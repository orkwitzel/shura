import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const gateway = 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    // One origin in dev, like production: /api and /ws go to the gateway (docs/design.md §13.2).
    proxy: {
      '/api': gateway,
      '/ws': { target: gateway, ws: true },
    },
  },
});
