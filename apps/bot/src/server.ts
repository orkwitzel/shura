import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { parseRoomCode } from '@shura/protocol';
import { z } from 'zod';
import type { BotPool, BotRequest } from './bot-pool';
import { BOT_PROFILE_NAMES } from './profile';

/** The most bots one request adds. */
export const MAX_BOTS_PER_REQUEST = 100;
/** The fastest pace a request may ask for, in pieces per second. */
export const MAX_PPS = 10;
/** The largest request body, in bytes. */
const MAX_BODY_BYTES = 4096;

const roomCode = z.string().transform((text, context) => {
  const code = parseRoomCode(text);
  if (code === undefined) {
    context.addIssue({ code: 'custom', message: `"${text}" isn't a room code` });
    return z.NEVER;
  }
  return code;
});

const common = {
  count: z.int().min(1).max(MAX_BOTS_PER_REQUEST).default(1),
  profile: z.enum(BOT_PROFILE_NAMES).default('casual'),
  pps: z.number().positive().max(MAX_PPS).optional(),
};

/** `POST /bots`: `{ room, count, profile, pps? }` or `{ quickMatch: true, … }` (design §13.4). */
const addSchema = z.union([
  z.strictObject({ room: roomCode, ...common }),
  z.strictObject({ quickMatch: z.literal(true), ...common }),
]);

/**
 * The bot tool's HTTP API (design §13.4): `POST /bots` adds bots, `DELETE /bots?room=K7QX`
 * removes a room's, `GET /bots` lists them, and `/livez` answers 200. Every answer is JSON.
 */
export function createBotServer(pool: BotPool): Server {
  return createServer((req, res) => {
    route(pool, req, res).catch((error: unknown) => {
      send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
}

async function route(pool: BotPool, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://bot.local');
  if (url.pathname === '/livez') {
    send(res, 200, { ok: true });
    return;
  }
  if (url.pathname !== '/bots') {
    send(res, 404, { error: 'not found' });
    return;
  }
  if (req.method === 'GET') {
    send(res, 200, { bots: pool.list() });
    return;
  }
  if (req.method === 'POST') {
    const parsed = addSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      send(res, 400, { error: z.prettifyError(parsed.error) });
      return;
    }
    const { count, profile, pps } = parsed.data;
    const request: BotRequest = {
      target: 'room' in parsed.data ? { room: parsed.data.room } : { quickMatch: true },
      count,
      profile,
      ...(pps !== undefined && { pps }),
    };
    send(res, 201, { bots: pool.add(request) });
    return;
  }
  if (req.method === 'DELETE') {
    const code = parseRoomCode(url.searchParams.get('room') ?? '');
    if (code === undefined) {
      send(res, 400, { error: 'DELETE /bots needs ?room= and a room code' });
      return;
    }
    send(res, 200, { removed: pool.remove(code) });
    return;
  }
  res.setHeader('allow', 'GET, POST, DELETE');
  send(res, 405, { error: `${req.method} isn't allowed on /bots` });
}

/** The request's body as JSON, or `undefined` if it isn't JSON. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  let text = '';
  for await (const chunk of req) {
    text += String(chunk);
    if (text.length > MAX_BODY_BYTES) return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(`${JSON.stringify(body)}\n`);
}
