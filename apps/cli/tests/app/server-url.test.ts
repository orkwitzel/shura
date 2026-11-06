import { expect, test } from 'vitest';
import { DEFAULT_SERVER, serverUrl } from '../../src/app/server-url';

test('--server wins over SHURA_SERVER, which wins over the config (design §13.3)', () => {
  const flag = 'https://flag.example';
  const env = 'https://env.example';
  const config = 'https://config.example';
  expect(serverUrl({ flag, env, config })).toBe(flag);
  expect(serverUrl({ env, config })).toBe(env);
  expect(serverUrl({ config })).toBe(config);
  expect(serverUrl({ flag: '', env: '', config })).toBe(config);
});

test('without any, the local gateway: an HTTP origin', () => {
  expect(serverUrl({})).toBe(DEFAULT_SERVER);
  expect(DEFAULT_SERVER).toBe('http://localhost:8080');
});
