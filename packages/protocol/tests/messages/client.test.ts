import { describe, expectTypeOf, test } from 'vitest';
import {
  type ClientData,
  type ClientMessageOf,
  clientMessageSchema,
  clientMessages,
} from '../../src/index';
import { CLIENT_EXAMPLES } from '../support/examples';
import { roundTrip } from '../support/round-trip';

describe('client → gateway messages', () => {
  roundTrip(clientMessageSchema, clientMessages, CLIENT_EXAMPLES);
});

test('messages are typed by event', () => {
  expectTypeOf<ClientData<'ready'>>().toHaveProperty('ready').toEqualTypeOf<boolean>();
  expectTypeOf<ClientMessageOf<'ping'>>().toHaveProperty('event').toEqualTypeOf<'ping'>();
  expectTypeOf<ClientMessageOf<'ping'>['data']>().toHaveProperty('id').toEqualTypeOf<number>();
  expectTypeOf<ClientData<'hello'>['kind']>().toEqualTypeOf<'guest' | 'bot' | undefined>();
});
