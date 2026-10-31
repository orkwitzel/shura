import { expect, test } from 'vitest';
import { errorText } from '../src/index';

test('a limit the server enforces reads as what happened and what to do (design §11)', () => {
  expect(errorText('room_limit', 'x')).toBe('Too many rooms created. Try again in a minute.');
  expect(errorText('too_many_connections', 'x')).toBe(
    'Too many connections from your network. Try again in a minute.',
  );
});

test('other codes keep what the server said, which says more', () => {
  expect(errorText('wrong_phase', 'Leave your room first.')).toBe('Leave your room first.');
  expect(errorText('rate_limited', 'Wait 3 s before queueing again.')).toBe(
    'Wait 3 s before queueing again.',
  );
});
