import { ENGINE_VERSION } from '@shura/engine';
import { ENGINE_VERSION_HEADER, PROTOCOL_VERSION, PROTOCOL_VERSION_HEADER } from '@shura/protocol';

/** The version headers every `/api` request carries (design §8.3), with this build's versions. */
export const VERSION_HEADERS = {
  [PROTOCOL_VERSION_HEADER]: String(PROTOCOL_VERSION),
  [ENGINE_VERSION_HEADER]: String(ENGINE_VERSION),
};

/** `POST`s `body` as JSON to `url`, with the version headers unless `headers` replaces them. */
export const postJson = (
  url: string,
  body: unknown,
  headers: Record<string, string> = VERSION_HEADERS,
) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
