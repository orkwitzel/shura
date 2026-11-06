import { describe, expect, expectTypeOf, test } from 'vitest';
import {
  type GameToGatewayData,
  type GatewayToGameData,
  gameToGatewayMessages,
  gameToGatewaySchema,
  gatewayToGameMessages,
  gatewayToGameSchema,
  type ServerMessage,
  unscoped,
} from '../../src/index';
import { GAME_TO_GATEWAY_EXAMPLES, GATEWAY_TO_GAME_EXAMPLES } from '../support/examples';
import { roundTrip } from '../support/round-trip';

describe('gateway → game link messages', () => {
  roundTrip(gatewayToGameSchema, gatewayToGameMessages, GATEWAY_TO_GAME_EXAMPLES);
});

describe('game → gateway link messages', () => {
  roundTrip(gameToGatewaySchema, gameToGatewayMessages, GAME_TO_GATEWAY_EXAMPLES);
});

test('a room-scoped link message is its client or server message plus the scope', () => {
  expectTypeOf<GatewayToGameData<'ready'>>().toHaveProperty('ready').toEqualTypeOf<boolean>();
  expectTypeOf<GatewayToGameData<'ready'>>().toHaveProperty('epoch').toEqualTypeOf<number>();
  expectTypeOf<GameToGatewayData<'batchAck'>>().toHaveProperty('seq').toEqualTypeOf<number>();
  expectTypeOf<GameToGatewayData<'batchAck'>>().toHaveProperty('sessionId').toEqualTypeOf<string>();
});

test('a pod’s message for a client, unscoped, is the server message the client gets', () => {
  const scope = { roomCode: 'K7QX', epoch: 2, sessionId: 'ada' };
  const { scope: from, message } = unscoped({
    event: 'batchAck',
    data: { ...scope, seq: 4 },
  });
  expect(from).toEqual(scope);
  expect(message).toEqual({ event: 'batchAck', data: { seq: 4 } });
  expectTypeOf(message).toEqualTypeOf<ServerMessage>();
});
