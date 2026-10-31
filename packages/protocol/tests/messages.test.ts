import { ActionType, createEngine, ONE_VS_ONE } from '@shura/engine';
import { describe, expect, test } from 'vitest';
import type { z } from 'zod';
import {
  actionSchema,
  clientMessageSchema,
  gameToGatewaySchema,
  gatewayToGameSchema,
  serverMessageSchema,
} from '../src/index';
import { messageTypes } from './support/shape';

interface Examples {
  /** Messages the schema accepts as they are. */
  valid: object[];
  /** Messages it refuses. */
  invalid: object[];
}

const engineState = createEngine(ONE_VS_ONE, 1234, 0).serialize();

const actions = {
  valid: [
    { frame: 1, type: 'moveLeft' },
    { frame: 9, type: 'hardDrop' },
    { frame: 9, type: 'hold' },
    { frame: 12, type: 'garbageAccepted', id: 3 },
    { frame: 12, type: 'garbageReceived', id: 3, lines: 4, holeSeed: 0xffff_ffff },
  ],
  invalid: [
    { frame: 1, type: 'teleport' },
    { frame: 0, type: 'moveLeft' },
    { frame: 1.5, type: 'moveLeft' },
    { type: 'moveLeft' },
    { frame: 12, type: 'garbageAccepted' },
    { frame: 12, type: 'garbageReceived', id: 3, lines: 0, holeSeed: 1 },
    { frame: 12, type: 'garbageReceived', id: 3, lines: 2, holeSeed: 2 ** 32 },
    { frame: 12, type: 'garbageReceived', id: 3, lines: 2 },
  ],
};

const frames = [
  { frame: 7, actions: [] },
  { frame: 8, actions: [{ frame: 8, type: 'moveRight' }] },
  {
    frame: 9,
    actions: [
      { frame: 9, type: 'garbageReceived', id: 0, lines: 2, holeSeed: 77 },
      { frame: 9, type: 'hardDrop' },
    ],
  },
];

const player = { id: 's1', nickname: 'Or', kind: 'guest', seat: 0, ready: true };

const client: Record<string, Examples> = {
  hello: {
    valid: [
      {
        type: 'hello',
        protocolVersion: 1,
        engineVersion: 2,
        clientVersion: '0.3.0',
        nickname: 'Or',
      },
      {
        type: 'hello',
        protocolVersion: 1,
        engineVersion: 2,
        clientVersion: '0.3.0',
        nickname: 'bot-1',
        sessionToken: 'tok',
        kind: 'bot',
      },
    ],
    invalid: [
      { type: 'hello', protocolVersion: 1, engineVersion: 2, clientVersion: '0.3.0' },
      {
        type: 'hello',
        protocolVersion: '1',
        engineVersion: 2,
        clientVersion: '0.3.0',
        nickname: 'Or',
      },
      {
        type: 'hello',
        protocolVersion: 1,
        engineVersion: 2,
        clientVersion: '0.3.0',
        nickname: 'Or',
        kind: 'admin',
      },
    ],
  },
  setNickname: {
    valid: [{ type: 'setNickname', nickname: 'Or' }],
    invalid: [{ type: 'setNickname' }, { type: 'setNickname', nickname: 7 }],
  },
  ping: {
    valid: [{ type: 'ping', id: 0 }],
    invalid: [{ type: 'ping' }, { type: 'ping', id: -1 }],
  },
  createRoom: {
    valid: [
      { type: 'createRoom', mode: '1v1' },
      { type: 'createRoom', mode: 'ffa' },
    ],
    invalid: [{ type: 'createRoom' }, { type: 'createRoom', mode: 'sprint' }],
  },
  joinRoom: {
    valid: [{ type: 'joinRoom', code: 'K7QX' }],
    invalid: [{ type: 'joinRoom' }, { type: 'joinRoom', code: 42 }],
  },
  leaveRoom: { valid: [{ type: 'leaveRoom' }], invalid: [] },
  ready: {
    valid: [
      { type: 'ready', ready: true },
      { type: 'ready', ready: false },
    ],
    invalid: [{ type: 'ready' }, { type: 'ready', ready: 'yes' }],
  },
  startMatch: { valid: [{ type: 'startMatch' }], invalid: [] },
  spectate: { valid: [{ type: 'spectate' }], invalid: [] },
  takeSeat: { valid: [{ type: 'takeSeat' }], invalid: [] },
  quickMatch: { valid: [{ type: 'quickMatch' }], invalid: [] },
  cancelQuickMatch: { valid: [{ type: 'cancelQuickMatch' }], invalid: [] },
  rematch: { valid: [{ type: 'rematch' }], invalid: [] },
  inputBatch: {
    valid: [
      { type: 'inputBatch', seq: 0, frames },
      { type: 'inputBatch', seq: 5, frames: [] },
    ],
    invalid: [
      { type: 'inputBatch', frames },
      { type: 'inputBatch', seq: -1, frames },
      { type: 'inputBatch', seq: 1, frames: [{ frame: 3, actions: [{ frame: 3, type: 'fly' }] }] },
      // An action stamped with a frame other than its entry's.
      { type: 'inputBatch', seq: 1, frames: [{ frame: 3, actions: [{ frame: 4, type: 'hold' }] }] },
    ],
  },
};

const server: Record<string, Examples> = {
  welcome: {
    valid: [
      { type: 'welcome', sessionId: 's1', sessionToken: 'tok', nickname: 'Or', serverTime: 1.7e12 },
    ],
    invalid: [{ type: 'welcome', sessionId: 's1', nickname: 'Or', serverTime: 1 }],
  },
  error: {
    valid: [
      { type: 'error', code: 'version_mismatch', message: 'Update Shura.' },
      { type: 'error', code: 'room_full', message: 'The room is full.' },
    ],
    invalid: [
      { type: 'error', code: 'oops', message: 'x' },
      { type: 'error', code: 'rate_limited' },
    ],
  },
  pong: {
    valid: [{ type: 'pong', id: 3, serverTime: 1.7e12 + 0.25 }],
    invalid: [{ type: 'pong', id: 3 }],
  },
  roomState: {
    valid: [
      {
        type: 'roomState',
        code: 'K7QX',
        mode: 'ffa',
        hostId: 's1',
        phase: 'lobby',
        players: [
          player,
          { ...player, id: 's2', kind: 'bot', seat: 1, ready: false, lastPlace: 2 },
        ],
        spectators: [{ id: 's3', nickname: 'אור', kind: 'guest' }],
      },
      // A quick-match room has no host.
      {
        type: 'roomState',
        code: 'K7QX',
        mode: '1v1',
        phase: 'playing',
        players: [],
        spectators: [],
      },
    ],
    invalid: [
      {
        type: 'roomState',
        code: 'K7QX',
        mode: '1v1',
        phase: 'paused',
        players: [],
        spectators: [],
      },
      {
        type: 'roomState',
        code: 'K7QX',
        mode: '1v1',
        phase: 'lobby',
        players: [{ ...player, seat: undefined }],
        spectators: [],
      },
      {
        type: 'roomState',
        code: 'K7QX',
        mode: '1v1',
        phase: 'lobby',
        players: [{ ...player, lastPlace: 0 }],
        spectators: [],
      },
    ],
  },
  quickMatchQueued: { valid: [{ type: 'quickMatchQueued' }], invalid: [] },
  quickMatchCancelled: { valid: [{ type: 'quickMatchCancelled' }], invalid: [] },
  opponentLeft: { valid: [{ type: 'opponentLeft' }], invalid: [] },
  countdown: {
    valid: [
      {
        type: 'countdown',
        startAt: 1.7e12,
        seed: 1234,
        matchId: 'm1',
        players: [
          { id: 's1', index: 0 },
          { id: 's2', index: 1 },
        ],
      },
    ],
    invalid: [
      { type: 'countdown', startAt: 1.7e12, seed: -1, matchId: 'm1', players: [] },
      { type: 'countdown', startAt: 1.7e12, seed: 1, matchId: 'm1', players: [{ id: 's1' }] },
    ],
  },
  snapshot: {
    valid: [{ type: 'snapshot', players: [{ playerId: 's1', frame: 120, state: engineState }] }],
    invalid: [
      { type: 'snapshot', players: [{ playerId: 's1', frame: 120 }] },
      { type: 'snapshot', players: [{ playerId: 's1', frame: 120, state: 'board' }] },
    ],
  },
  batchAck: {
    valid: [{ type: 'batchAck', seq: 4 }],
    invalid: [{ type: 'batchAck' }],
  },
  relay: {
    valid: [{ type: 'relay', playerId: 's2', frames }],
    invalid: [{ type: 'relay', frames }],
  },
  garbageQueued: {
    valid: [{ type: 'garbageQueued', id: 0, from: 's1', to: 's2', lines: 4, holeSeed: 99 }],
    invalid: [
      { type: 'garbageQueued', id: 0, from: 's1', to: 's2', lines: 0, holeSeed: 99 },
      { type: 'garbageQueued', id: 0, from: 's1', to: 's2', lines: 1 },
    ],
  },
  playerOut: {
    valid: ['toppedOut', 'laggedOut', 'removed', 'left'].map((reason) => ({
      type: 'playerOut',
      playerId: 's2',
      reason,
      frame: 900,
    })),
    invalid: [{ type: 'playerOut', playerId: 's2', reason: 'bored', frame: 900 }],
  },
  matchEnd: {
    valid: [
      {
        type: 'matchEnd',
        placements: [
          { playerId: 's1', place: 1 },
          { playerId: 's2', place: 2, reason: 'toppedOut', frame: 900 },
          { playerId: 's3', place: 2, reason: 'laggedOut', frame: 900 },
        ],
        stats: [{ playerId: 's1', linesSent: 12, apm: 48.5, pps: 1.9 }],
      },
    ],
    invalid: [
      { type: 'matchEnd', placements: [{ playerId: 's1', place: 0 }], stats: [] },
      { type: 'matchEnd', placements: [], stats: [{ playerId: 's1', linesSent: 1 }] },
    ],
  },
};

const ready = { type: 'ready', ready: true };
const envelope = { roomCode: 'K7QX', epoch: 1, sessionId: 's1' };

const gatewayToGame: Record<string, Examples> = {
  createRoom: {
    valid: [
      { type: 'createRoom', roomCode: 'K7QX', epoch: 1, mode: 'ffa', hostId: 's1' },
      { type: 'createRoom', roomCode: 'K7QX', epoch: 1, mode: '1v1' },
    ],
    invalid: [{ type: 'createRoom', roomCode: 'K7QX', mode: '1v1' }],
  },
  attach: {
    valid: [{ type: 'attach', ...envelope, nickname: 'Or', kind: 'guest' }],
    invalid: [{ type: 'attach', ...envelope, nickname: 'Or' }],
  },
  detach: {
    valid: [{ type: 'detach', ...envelope }],
    invalid: [{ type: 'detach', roomCode: 'K7QX', epoch: 1 }],
  },
  room: {
    valid: [{ type: 'room', ...envelope, message: ready }],
    invalid: [
      { type: 'room', ...envelope, message: { type: 'ready' } },
      { type: 'room', roomCode: 'K7QX', sessionId: 's1', message: ready },
    ],
  },
};

const gameToGateway: Record<string, Examples> = {
  room: {
    valid: [{ type: 'room', ...envelope, message: { type: 'batchAck', seq: 2 } }],
    invalid: [{ type: 'room', ...envelope, message: { type: 'batchAck' } }],
  },
  drain: { valid: [{ type: 'drain' }], invalid: [] },
};

const suites: [name: string, schema: z.ZodType, Record<string, Examples>][] = [
  ['client → gateway', clientMessageSchema, client],
  ['gateway → client', serverMessageSchema, server],
  ['gateway → game', gatewayToGameSchema, gatewayToGame],
  ['game → gateway', gameToGatewaySchema, gameToGateway],
];

describe.each(suites)('%s messages', (_, schema, examples) => {
  test('every message type has examples', () => {
    expect(Object.keys(examples).sort()).toEqual(messageTypes(schema).sort());
  });

  test.each(Object.entries(examples))(
    '%s parses its valid examples as they are',
    (_, { valid }) => {
      for (const message of valid) expect(schema.parse(message)).toEqual(message);
    },
  );

  test.each(Object.entries(examples))('%s refuses malformed ones', (_, { invalid }) => {
    for (const message of invalid) {
      expect(schema.safeParse(message).success, JSON.stringify(message)).toBe(false);
    }
  });

  test.each(Object.entries(examples))('%s passes extra fields through', (_, { valid }) => {
    for (const message of valid) {
      const extended = { ...message, addedLater: { nested: [1, 2] } };
      expect(schema.parse(extended)).toEqual(extended);
    }
  });

  test('refuses an unknown message type and a non-object', () => {
    expect(schema.safeParse({ type: 'launchMissiles' }).success).toBe(false);
    expect(schema.safeParse('hello').success).toBe(false);
    expect(schema.safeParse(null).success).toBe(false);
  });
});

describe('actions', () => {
  test('cover every engine action type', () => {
    expect(messageTypes(actionSchema)).toEqual(expect.arrayContaining(Object.values(ActionType)));
  });

  test('parse their valid examples as they are, extra fields included', () => {
    for (const action of actions.valid) {
      expect(actionSchema.parse(action)).toEqual(action);
      expect(actionSchema.parse({ ...action, note: 'x' })).toEqual({ ...action, note: 'x' });
    }
  });

  test('refuse malformed ones', () => {
    for (const action of actions.invalid) {
      expect(actionSchema.safeParse(action).success, JSON.stringify(action)).toBe(false);
    }
  });

  test('pass extra fields through inside a batch', () => {
    const batch = {
      type: 'inputBatch',
      seq: 0,
      frames: [{ frame: 2, actions: [{ frame: 2, type: 'hold', note: 'x' }], note: 'y' }],
    };
    expect(clientMessageSchema.parse(batch)).toEqual(batch);
  });
});
