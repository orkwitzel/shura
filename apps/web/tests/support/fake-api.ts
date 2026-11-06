import { type Api, createApi, type Fetch } from '@shura/client-core';
import { ERRORS, type RoomMode, SEATS } from '@shura/protocol';

/** An `Api` over a fake server, and every room code looked up through it, oldest first. */
export interface FakeApi extends Api {
  readonly lookups: readonly string[];
}

/**
 * client-core's real API client over a fake `fetch`, so tests go through its parsing: a server
 * whose `GET /api/rooms/:code` knows the rooms in `rooms` (code → mode) and answers 404
 * `room_not_found` for any other. Sessions are the fake online session's, so it has none.
 */
export function fakeApi(rooms: Readonly<Record<string, RoomMode>> = {}): FakeApi {
  const lookups: string[] = [];
  const fetch: Fetch = async (url) => {
    const match = /\/api\/rooms\/([^/?]+)$/.exec(url);
    if (!match?.[1]) return answer(404, { code: 'not_found', message: 'Not found.' });
    const code = decodeURIComponent(match[1]);
    lookups.push(code);
    const mode = Object.hasOwn(rooms, code) ? rooms[code] : undefined;
    if (mode === undefined) {
      return answer(ERRORS.room_not_found.status, {
        code: 'room_not_found',
        message: ERRORS.room_not_found.message,
      });
    }
    return answer(200, { code, mode, seats: SEATS[mode], seated: 1, spectators: 0 });
  };
  return { ...createApi({ serverUrl: 'http://shura.test', fetch }), lookups };
}

const answer = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
