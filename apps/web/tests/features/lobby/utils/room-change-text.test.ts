import { describe, expect, test } from 'vitest';
import { isolate, roomChangeText } from '@/features/lobby/utils/room-change-text';

describe('roomChangeText', () => {
  test('says who joined and who left', () => {
    expect(roomChangeText({ kind: 'joined', id: 'mira', nickname: 'Mira', you: false })).toBe(
      `${isolate('Mira')} joined`,
    );
    expect(roomChangeText({ kind: 'left', id: 'mira', nickname: 'Mira', you: false })).toBe(
      `${isolate('Mira')} left`,
    );
  });

  test('says who is host now, or that you are', () => {
    expect(roomChangeText({ kind: 'host', id: 'mira', nickname: 'Mira', you: false })).toBe(
      `${isolate('Mira')} is now host`,
    );
    expect(roomChangeText({ kind: 'host', id: 'me', nickname: 'Or', you: true })).toBe(
      'You are now host',
    );
  });

  test('sets a name apart, so a Hebrew one keeps the sentence in order', () => {
    expect(isolate('שירה')).toBe('\u2068שירה\u2069');
  });
});
