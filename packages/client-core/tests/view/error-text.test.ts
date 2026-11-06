import { expect, test } from 'vitest';
import { errorText, NICKNAME_PROBLEMS } from '../../src/index';

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
  // A code added after this client was built.
  expect(errorText('brand_new', 'Something new.')).toBe('Something new.');
});

test('a nickname’s problems read in plain words, its length limit the protocol’s (design §11)', () => {
  expect(NICKNAME_PROBLEMS).toEqual({
    empty: 'Type a nickname.',
    tooLong: 'At most 16 characters.',
    invalidCharacters: 'Letters, digits, spaces, _ and - only.',
    blocked: 'That nickname isn’t allowed.',
  });
});
