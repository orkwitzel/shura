import { expect, test } from 'vitest';
import { DEFAULT_SERVER, serverUrl } from '../../src/app/server-url';

test('--server beats SHURA_SERVER, which beats the config, which beats the default', () => {
  const flag = 'wss://flag.test';
  const env = 'wss://env.test';
  const config = 'wss://config.test';
  expect(serverUrl({ flag, env, config })).toBe(flag);
  expect(serverUrl({ env, config })).toBe(env);
  expect(serverUrl({ config })).toBe(config);
  expect(serverUrl({})).toBe(DEFAULT_SERVER);
});

test('an empty value counts as none', () => {
  expect(serverUrl({ flag: '', env: '', config: 'wss://config.test' })).toBe('wss://config.test');
});
