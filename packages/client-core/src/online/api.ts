import { ENGINE_VERSION } from '@shura/engine';
import {
  type CreateSessionRequest,
  ENGINE_VERSION_HEADER,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_HEADER,
  type RoomInfo,
  roomInfoSchema,
  type Session,
  serverMessages,
  sessionSchema,
} from '@shura/protocol';
import type { z } from 'zod';
import { OnlineError, UNREACHABLE_TEXT } from './online-error';

/** As much of a `fetch` response as the API client reads. */
export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

/**
 * As much of the platform's `fetch` as the API client uses: browsers' and Node's own, or a test's.
 * client-core is built for no platform in particular, so it names only what it needs.
 */
export type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<FetchResponse>;

export interface ApiOptions {
  /** The server's HTTP origin (`http://localhost:8080`, `https://shura.example`). */
  readonly serverUrl: string;
  /** The platform's `fetch`: the global one by default. */
  readonly fetch?: Fetch;
}

/**
 * client-core's HTTP calls to the gateway's `/api` (design §13.1, API client): each sends the
 * version headers (§8.3) and parses the answer with the schema the gateway validates with. A
 * `{ code, message }` body, a server that can't be reached and an answer that fails its schema
 * all reject with an `OnlineError`.
 */
export interface Api {
  /** `POST /api/sessions`: a new session, or the one `sessionToken` names if it's still valid. */
  createSession(request: CreateSessionRequest): Promise<Session>;
  /** `GET /api/rooms/:code`: the room's mode and how full it is, or `room_not_found`. */
  lookupRoom(code: string): Promise<RoomInfo>;
}

/** The server origin without a trailing slash. */
const origin = (serverUrl: string): string => serverUrl.replace(/\/+$/, '');

/** The gateway's WebSocket URL for the server at `serverUrl`: `ws(s)://…/ws` (design §13.3). */
export function socketUrl(serverUrl: string): string {
  return `${origin(serverUrl).replace(/^http/, 'ws')}/ws`;
}

const VERSION_HEADERS = {
  [PROTOCOL_VERSION_HEADER]: String(PROTOCOL_VERSION),
  [ENGINE_VERSION_HEADER]: String(ENGINE_VERSION),
};

const globalFetch: Fetch = (url, init) => {
  const platform = (globalThis as { fetch?: Fetch }).fetch;
  if (!platform) throw new Error('this platform has no fetch: pass one to createApi');
  return platform(url, init);
};

export function createApi({ serverUrl, fetch = globalFetch }: ApiOptions): Api {
  const call = async <Schema extends z.ZodType>(
    schema: Schema,
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): Promise<z.infer<Schema>> => {
    let response: FetchResponse;
    let parsed: unknown;
    try {
      response = await fetch(`${origin(serverUrl)}/api${path}`, {
        method,
        headers: {
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...VERSION_HEADERS,
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      parsed = await response.json().catch(() => undefined);
    } catch {
      throw new OnlineError('unreachable', UNREACHABLE_TEXT);
    }
    if (!response.ok) {
      const error = serverMessages.exception.safeParse(parsed);
      if (error.success)
        throw new OnlineError(error.data.code, error.data.message, response.status);
      throw new OnlineError('internal_error', `The server answered ${response.status}.`);
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new OnlineError('invalid_message', "The server's answer is malformed.");
    }
    return result.data;
  };
  return {
    createSession: (request) => call(sessionSchema, '/sessions', 'POST', request),
    lookupRoom: (code) => call(roomInfoSchema, `/rooms/${encodeURIComponent(code)}`, 'GET'),
  };
}
