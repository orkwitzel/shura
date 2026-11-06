import { describe, expectTypeOf, test } from 'vitest';
import { type ServerData, serverMessageSchema, serverMessages } from '../../src/index';
import { SERVER_EXAMPLES } from '../support/examples';
import { roundTrip } from '../support/round-trip';

describe('gateway → client messages', () => {
  roundTrip(serverMessageSchema, serverMessages, SERVER_EXAMPLES);
});

test('messages are typed by event', () => {
  expectTypeOf<ServerData<'playerOut'>>()
    .toHaveProperty('reason')
    .toEqualTypeOf<'toppedOut' | 'laggedOut' | 'removed' | 'left'>();
  expectTypeOf<ServerData<'exception'>>().toHaveProperty('code').toEqualTypeOf<string>();
});
