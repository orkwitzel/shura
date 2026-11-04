import { expect, test } from 'vitest';
import { ERRORS, errorBody } from '../src/index';

test('every error code has a message and an HTTP error status', () => {
  for (const { message, status } of Object.values(ERRORS)) {
    expect(message).not.toBe('');
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(600);
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
