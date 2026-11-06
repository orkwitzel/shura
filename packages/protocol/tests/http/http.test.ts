import { describe, expect, test } from 'vitest';
import {
  createSessionRequestSchema,
  ENGINE_VERSION_HEADER,
  PROTOCOL_VERSION_HEADER,
  roomInfoSchema,
  sessionSchema,
} from '../../src/index';

describe('POST /api/sessions', () => {
  test('takes a nickname, and the session token to resume', () => {
    for (const body of [{ nickname: 'Or' }, { nickname: 'אור', sessionToken: 'tok' }]) {
      expect(createSessionRequestSchema.parse(body)).toEqual(body);
    }
  });

  test('answers with the session and the nickname as the server normalized it', () => {
    const session = { sessionId: 's1', sessionToken: 'tok', nickname: 'Or K' };
    expect(sessionSchema.parse(session)).toEqual(session);
  });

  test('lets unknown fields through', () => {
    const body = { nickname: 'Or', locale: 'he' };
    expect(createSessionRequestSchema.parse(body)).toEqual(body);
    const session = { sessionId: 's1', sessionToken: 'tok', nickname: 'Or', expiresAt: 1 };
    expect(sessionSchema.parse(session)).toEqual(session);
  });

  test('refuses malformed bodies', () => {
    for (const body of [{}, { nickname: 7 }, { nickname: 'Or', sessionToken: 7 }, null]) {
      expect(createSessionRequestSchema.safeParse(body).success).toBe(false);
    }
    for (const session of [
      { sessionToken: 'tok', nickname: 'Or' },
      { sessionId: 's1', nickname: 'Or' },
      { sessionId: 's1', sessionToken: 'tok' },
    ]) {
      expect(sessionSchema.safeParse(session).success).toBe(false);
    }
  });
});

describe('GET /api/rooms/:code', () => {
  test('answers with the room’s mode and how full it is', () => {
    const room = { code: 'K7QX', mode: 'ffa', seats: 8, seated: 3, spectators: 0 };
    expect(roomInfoSchema.parse(room)).toEqual(room);
    expect(roomInfoSchema.parse({ ...room, phase: 'lobby' })).toEqual({ ...room, phase: 'lobby' });
  });

  test('refuses a malformed answer', () => {
    const room = { code: 'K7QX', mode: '1v1', seats: 2, seated: 1, spectators: 0 };
    for (const bad of [
      { ...room, mode: 'solo' },
      { ...room, seated: -1 },
      { ...room, spectators: undefined },
      { ...room, code: undefined },
    ]) {
      expect(roomInfoSchema.safeParse(bad).success).toBe(false);
    }
  });
});

test('the version headers are Shura-Protocol and Shura-Engine (design §8.3)', () => {
  expect(PROTOCOL_VERSION_HEADER).toBe('Shura-Protocol');
  expect(ENGINE_VERSION_HEADER).toBe('Shura-Engine');
});
