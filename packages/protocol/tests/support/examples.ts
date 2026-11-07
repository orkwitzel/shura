import type { Examples } from './round-trip';

// Valid and malformed `data` for every message, by event (design §8.7).

const empty: Examples = { valid: [{}], invalid: [null, 'x', []] };

/** Every client → gateway message (design §8.7), with valid and malformed `data`. */
export const CLIENT_EXAMPLES: Record<string, Examples> = {
  hello: {
    valid: [
      { protocolVersion: 1, engineVersion: 3, clientVersion: '0.4.0', sessionToken: 'tok' },
      {
        protocolVersion: 1,
        engineVersion: 3,
        clientVersion: '0.4.0',
        sessionToken: 't',
        kind: 'bot',
      },
    ],
    invalid: [
      { protocolVersion: 1, engineVersion: 3, clientVersion: '0.4.0' },
      { protocolVersion: '1', engineVersion: 3, clientVersion: '0.4.0', sessionToken: 't' },
      { protocolVersion: 1.5, engineVersion: 3, clientVersion: '0.4.0', sessionToken: 't' },
      { protocolVersion: 1, engineVersion: 3, clientVersion: '0', sessionToken: 't', kind: 'cat' },
    ],
  },
  setNickname: { valid: [{ nickname: 'אור' }], invalid: [{}, { nickname: 7 }] },
  ping: { valid: [{ id: 0 }, { id: 12 }], invalid: [{}, { id: -1 }, { id: 'a' }] },
  createRoom: { valid: [{ mode: '1v1' }, { mode: 'ffa' }], invalid: [{}, { mode: '2v2' }] },
  joinRoom: { valid: [{ code: 'K7QX' }, { code: 'k7qx' }], invalid: [{}, { code: 7 }] },
  leaveRoom: empty,
  ready: { valid: [{ ready: true }, { ready: false }], invalid: [{}, { ready: 'yes' }] },
  startMatch: empty,
  spectate: empty,
  takeSeat: empty,
  quickMatch: empty,
  cancelQuickMatch: empty,
  rematch: empty,
  inputBatch: {
    valid: [
      { seq: 0, frames: [] },
      {
        seq: 4,
        frames: [
          { frame: 10, actions: [] },
          {
            frame: 11,
            actions: [
              { frame: 11, type: 'garbageReceived', id: 0, lines: 2, holeSeed: 77 },
              { frame: 11, type: 'hardDrop' },
            ],
          },
          { frame: 12, actions: [{ frame: 12, type: 'garbageAccepted', id: 0 }] },
        ],
      },
    ],
    invalid: [
      { frames: [] },
      { seq: -1, frames: [] },
      { seq: 0 },
      { seq: 0, frames: [{ frame: 0, actions: [] }] },
      { seq: 0, frames: [{ frame: 1, actions: [{ frame: 1, type: 'teleport' }] }] },
      { seq: 0, frames: [{ frame: 1, actions: [{ frame: 2, type: 'hold' }] }] },
    ],
  },
};

/** The fields every room-scoped message on a gateway ⇄ game link carries (design §8.7). */
const scope = { roomCode: 'K7QX', epoch: 0, sessionId: 's1' };

/**
 * The examples of `events` in `examples`, as room-scoped link messages: with `scope` added to each
 * valid and malformed `data`, and refused without it or with a malformed one.
 */
const scoped = (examples: Record<string, Examples>, events: readonly string[]) =>
  Object.fromEntries(
    events.map((event) => {
      const { valid, invalid } = examples[event] ?? { valid: [], invalid: [] };
      const first = valid[0] ?? {};
      return [
        event,
        {
          valid: valid.map((data) => ({ ...data, ...scope })),
          invalid: [
            ...invalid.flatMap((data) =>
              typeof data === 'object' && data !== null && !Array.isArray(data)
                ? [{ ...data, ...scope }]
                : [],
            ),
            first,
            { ...first, ...scope, roomCode: undefined },
            { ...first, ...scope, epoch: -1 },
            { ...first, ...scope, sessionId: 7 },
          ],
        },
      ];
    }),
  );

const player = { id: 'p1', nickname: 'Or', kind: 'guest', seat: 0, ready: true };
const room = { code: 'K7QX', mode: '1v1', phase: 'lobby' };

/** Every gateway → client message (design §8.7), with valid and malformed `data`. */
export const SERVER_EXAMPLES: Record<string, Examples> = {
  welcome: {
    valid: [{ sessionId: 's1', serverTime: 1_780_000_000_000 }],
    invalid: [{ sessionId: 's1' }, { serverTime: 1 }, { sessionId: 1, serverTime: 1 }],
  },
  exception: {
    valid: [
      { code: 'room_not_found', message: 'There is no room with that code.' },
      { code: 'a_code_added_later', message: 'Old clients still read it.' },
    ],
    invalid: [{ code: 'room_not_found' }, { message: 'x' }, { code: 1, message: 'x' }],
  },
  pong: {
    valid: [{ id: 3, serverTime: 1_780_000_000_000.5 }],
    invalid: [{ id: 3 }, { serverTime: 1 }, { id: -1, serverTime: 1 }],
  },
  roomState: {
    valid: [
      {
        ...room,
        hostId: 'p1',
        players: [player, { ...player, id: 'p2', kind: 'bot', seat: 1, ready: false }],
        spectators: [{ id: 'p3', nickname: 'אור', kind: 'guest' }],
      },
      {
        ...room,
        mode: 'ffa',
        phase: 'results',
        players: [{ ...player, lastPlace: 1 }],
        spectators: [],
      },
      { ...room, quickMatch: true, players: [player], spectators: [] },
    ],
    invalid: [
      { ...room, players: [] },
      { ...room, quickMatch: 'yes', players: [], spectators: [] },
      { ...room, phase: 'paused', players: [], spectators: [] },
      { ...room, players: [{ ...player, seat: -1 }], spectators: [] },
      { ...room, players: [{ ...player, lastPlace: 0 }], spectators: [] },
      { ...room, players: [{ id: 'p1' }], spectators: [] },
    ],
  },
  quickMatchQueued: empty,
  quickMatchCancelled: empty,
  opponentLeft: empty,
  countdown: {
    valid: [
      {
        startAt: 1_780_000_003_000,
        seed: 4_294_967_295,
        matchId: 'm1',
        players: [
          { id: 'p1', index: 0 },
          { id: 'p2', index: 1 },
        ],
      },
    ],
    invalid: [
      { startAt: 1, seed: -1, matchId: 'm1', players: [] },
      { startAt: 1, seed: 2 ** 32, matchId: 'm1', players: [] },
      { startAt: 1, seed: 1, players: [] },
      { startAt: 1, seed: 1, matchId: 'm1', players: [{ id: 'p1' }] },
    ],
  },
  snapshot: {
    valid: [
      { players: [{ playerId: 'p1', frame: 120, state: { frame: 120, board: [] } }] },
      { players: [{ playerId: 'p1', frame: 120, state: { frame: 120, board: [] }, nextSeq: 40 }] },
    ],
    invalid: [
      {},
      { players: [{ playerId: 'p1', frame: 120 }] },
      { players: [{ playerId: 'p1', frame: 120, state: {}, nextSeq: -1 }] },
      { players: [{ playerId: 'p1', frame: -1, state: {} }] },
      { players: [{ playerId: 'p1', frame: 1, state: 'x' }] },
    ],
  },
  batchAck: { valid: [{ seq: 0 }, { seq: 41 }], invalid: [{}, { seq: -1 }, { seq: 'x' }] },
  relay: {
    valid: [{ playerId: 'p2', frames: [{ frame: 7, actions: [{ frame: 7, type: 'rotateCW' }] }] }],
    invalid: [{ frames: [] }, { playerId: 'p2' }, { playerId: 'p2', frames: [{ frame: 7 }] }],
  },
  garbageQueued: {
    valid: [{ id: 0, from: 'p1', to: 'p2', lines: 4, holeSeed: 99 }],
    invalid: [
      { id: 0, from: 'p1', to: 'p2', lines: 0, holeSeed: 99 },
      { id: 0, from: 'p1', to: 'p2', lines: 4, holeSeed: -1 },
      { id: 0, from: 'p1', lines: 4, holeSeed: 99 },
    ],
  },
  playerOut: {
    valid: [
      { playerId: 'p2', reason: 'toppedOut', frame: 900 },
      { playerId: 'p3', reason: 'left', frame: 0 },
    ],
    invalid: [
      { playerId: 'p2', reason: 'bored', frame: 900 },
      { playerId: 'p2', reason: 'laggedOut' },
    ],
  },
  matchEnd: {
    valid: [
      {
        placements: [
          { playerId: 'p1', place: 1 },
          { playerId: 'p2', place: 2, reason: 'laggedOut', frame: 640 },
        ],
        stats: [
          { playerId: 'p1', linesSent: 12, apm: 40.5, pps: 1.8 },
          { playerId: 'p2', linesSent: 0, apm: 0, pps: 0 },
        ],
      },
    ],
    invalid: [
      { placements: [] },
      { placements: [{ playerId: 'p1', place: 0 }], stats: [] },
      { placements: [], stats: [{ playerId: 'p1', linesSent: 1, apm: -1, pps: 1 }] },
    ],
  },
};

/** Every gateway → game link message (design §8.7, §9.1), with valid and malformed `data`. */
export const GATEWAY_TO_GAME_EXAMPLES: Record<string, Examples> = {
  createRoom: {
    valid: [
      { roomCode: 'K7QX', epoch: 0, mode: '1v1', hostId: 's1' },
      { roomCode: 'K7QX', epoch: 2, mode: '1v1', maxSpectators: 4 },
      { roomCode: 'K7QX', epoch: 0, mode: '1v1', quickMatch: true },
    ],
    invalid: [
      { epoch: 0, mode: '1v1' },
      { roomCode: 'K7QX', epoch: -1, mode: '1v1' },
      { roomCode: 'K7QX', epoch: 0, mode: 'solo' },
      { roomCode: 'K7QX', epoch: 0, mode: 'ffa', maxSpectators: -1 },
      { roomCode: 'K7QX', epoch: 0, mode: '1v1', quickMatch: 1 },
    ],
  },
  attach: {
    valid: [{ ...scope, nickname: 'Or', kind: 'guest' }],
    invalid: [{ ...scope, kind: 'guest' }, { ...scope, nickname: 'Or', kind: 'cat' }, scope],
  },
  detach: { valid: [scope], invalid: [{}, { ...scope, epoch: 'one' }] },
  ...scoped(CLIENT_EXAMPLES, [
    'setNickname',
    'leaveRoom',
    'ready',
    'startMatch',
    'spectate',
    'takeSeat',
    'rematch',
    'inputBatch',
  ]),
};

/** Every game → gateway link message (design §8.7, §9.1), with valid and malformed `data`. */
export const GAME_TO_GATEWAY_EXAMPLES: Record<string, Examples> = {
  drain: { valid: [{}], invalid: [null, 'x'] },
  ...scoped(SERVER_EXAMPLES, [
    'exception',
    'roomState',
    'opponentLeft',
    'countdown',
    'snapshot',
    'batchAck',
    'relay',
    'garbageQueued',
    'playerOut',
    'matchEnd',
  ]),
};
