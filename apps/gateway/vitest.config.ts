import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Nest's injection reads decorator metadata, which Vite's own TypeScript transform doesn't emit:
// SWC compiles the sources and tests instead, with the options of `.swcrc`.
export default defineConfig({
  oxc: false,
  plugins: [swc.vite({ swcrc: true, configFile: '.swcrc', module: { type: 'es6' } })],
  // Tests boot the app with its real logger (`configureApp`): keep it quiet.
  test: {
    env: { LOG_LEVEL: 'silent' },
    // Integration tests play whole matches over real sockets.
    testTimeout: 30_000,
  },
});
