import { defineConfig } from 'vitest/config';

// These tests simulate whole matches (bots placing pieces, clients and servers over many frames).
// They take 1–2 s locally but 3–6 s on a loaded CI runner, past Vitest's 5 s default.
export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
});
