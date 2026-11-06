import { describe, expectTypeOf, test } from 'vitest';
import {
  type GameToGatewayData,
  type GatewayToGameData,
  gameToGatewayMessages,
  gameToGatewaySchema,
  gatewayToGameMessages,
  gatewayToGameSchema,
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
