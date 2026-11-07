import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tests/app/join.test.tsx boots the gateway and a game pod, whose loggers would fill the output.
  test: { env: { LOG_LEVEL: 'silent' } },
});
