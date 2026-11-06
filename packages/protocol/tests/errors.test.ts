import { expect, test } from 'vitest';
import { ERRORS, errorBody, isErrorBody } from '../src/index';

test('every error code has a message and an HTTP error status', () => {
  for (const { message, status } of Object.values(ERRORS)) {
    expect(message).not.toBe('');
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(600);
  }
});

test('ERRORS has every code the design names, with its HTTP status (§8.3, §8.7, §11)', () => {
  const status = Object.fromEntries(
    Object.entries(ERRORS).map(([code, { status }]) => [code, status]),
  );
  expect(status).toMatchObject({
    version_mismatch: 426,
    room_not_found: 404,
    rate_limited: 429,
    invalid_message: 400,
    internal_error: 500,
  });
  for (const code of [
    'session_required',
    'room_full',
    'nickname_invalid',
    'too_many_connections',
    'room_limit',
    'not_host',
    'wrong_phase',
    'not_in_room',
    'unavailable',
    'no_free_seat',
  ]) {
    expect(status).toHaveProperty(code);
  }
});

test('errorBody uses the default text unless given one', () => {
  expect(errorBody('invalid_message')).toEqual({
    code: 'invalid_message',
    message: ERRORS.invalid_message.message,
  });
  expect(errorBody('invalid_message', 'nope')).toEqual({
    code: 'invalid_message',
    message: 'nope',
  });
});

test('isErrorBody accepts only a known code with a message', () => {
  expect(isErrorBody(errorBody('internal_error'))).toBe(true);
  expect(isErrorBody({ code: 'nope', message: 'x' })).toBe(false);
  expect(isErrorBody({ code: 'invalid_message' })).toBe(false);
  expect(isErrorBody('invalid_message')).toBe(false);
  expect(isErrorBody(null)).toBe(false);
});
