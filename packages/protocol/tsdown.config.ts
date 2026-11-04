import { defineConfig } from 'tsdown';

// Built to dist/, so every consumer runs the same compiled output (ADR 0015).
export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'neutral',
  target: 'es2024',
  dts: true,
  sourcemap: true,
  fixedExtension: false,
});
