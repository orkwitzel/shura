import { defineConfig } from 'tsdown';

// Built to dist/, so every consumer runs the same compiled output (ADR 0015). `react` is its own
// entry, so the root one still brings in no React (ADR 0012). Code both entries use goes in a
// shared chunk, named without a hash so `tsdown --watch --no-clean` leaves no stale ones behind.
export default defineConfig({
  entry: ['src/index.ts', 'src/react.ts'],
  hash: false,
  platform: 'neutral',
  target: 'es2024',
  dts: true,
  sourcemap: true,
  fixedExtension: false,
});
