import type { Server } from 'node:http';
import { createAdaptorServer } from '@hono/node-server';
import { zValidator } from '@hono/zod-validator';
import { parseRoomCode } from '@shura/protocol';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { BOT_PROFILE_NAMES } from '../brain/profile';
import type { BotPool, BotRequest } from './bot-pool';

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

/**
 * `POST /bots`: `{ room, count, profile, pps? }` (design §13.4). `{ quickMatch: true, … }` comes
 * with the online session's quick-match (#65).
 */
const addSchema = z.strictObject({ room: roomCode, ...common });

/**
 * The bot tool's HTTP API (design §13.4), on Hono: `POST /bots` adds bots (a JSON body of at most
 * 4 KiB), `DELETE /bots?room=K7QX` removes a room's, `GET /bots` lists them, and `/livez` answers
 * 200. Every answer is JSON, a refusal `{ error }`: 400 for a bad request, 404 for another path,
 * 405 for another method on `/bots`, 413 for a body too large.
 */
export function botApi(pool: BotPool): Hono {
  const app = new Hono();
  app.get('/livez', (c) => c.json({ ok: true }));
  app.get('/bots', (c) => c.json({ bots: pool.list() }));
  app.post(
    '/bots',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: `a request body is at most ${MAX_BODY_BYTES} bytes` }, 413),
    }),
    zValidator('json', addSchema, (result, c) => {
      if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
    }),
    (c) => {
      const { room, count, profile, pps } = c.req.valid('json');
      const request: BotRequest = {
        target: { room },
        count,
        profile,
        ...(pps !== undefined && { pps }),
      };
      return c.json({ bots: pool.add(request) }, 201);
    },
  );
  app.delete('/bots', (c) => {
    const code = parseRoomCode(c.req.query('room') ?? '');
    if (code === undefined)
      return c.json({ error: 'DELETE /bots needs ?room= and a room code' }, 400);
    return c.json({ removed: pool.remove(code) });
  });
  app.all('/bots', (c) => {
    c.header('allow', 'GET, POST, DELETE');
    return c.json({ error: `${c.req.method} isn't allowed on /bots` }, 405);
  });
  app.notFound((c) => c.json({ error: 'not found' }, 404));
  app.onError((error, c) => {
    // A body that isn't JSON is the validator's 400; anything else went wrong here.
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    return c.json({ error: error.message }, 500);
  });
  return app;
}

/** The bot tool's HTTP server, not yet listening: `botApi` on Node's `http`. */
export function createBotServer(pool: BotPool): Server {
  return createAdaptorServer({ fetch: botApi(pool).fetch }) as Server;
}
