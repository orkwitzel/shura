import { expect, test } from 'vitest';
import { DEFAULT_SERVER, serverUrl, webUrl } from '../../src/addresses/server-url';

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
  expect(DEFAULT_SERVER).toBe('http://127.0.0.1:8080');
});

test('the web client is at SHURA_WEB, else at the server (design §13.3)', () => {
  const server = 'https://shura.example';
  expect(webUrl({ env: 'http://127.0.0.1:5173', server })).toBe('http://127.0.0.1:5173');
  expect(webUrl({ env: '', server })).toBe(server);
  expect(webUrl({ server })).toBe(server);
});
