import { describe, expect, test } from 'vitest';
import { parseRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, roomCodeInput } from '../src/index';

describe('the room-code alphabet', () => {
  test('has 31 characters, 4 to a code', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(31);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(31);
    expect(ROOM_CODE_LENGTH).toBe(4);
  });

  test('leaves out the ambiguous characters 0, O, 1, I and L', () => {
    for (const removed of ['0', 'O', '1', 'I', 'L'])
      expect(ROOM_CODE_ALPHABET).not.toContain(removed);
  });
});

describe('parseRoomCode', () => {
  test('uppercases a typed code', () => {
    expect(parseRoomCode('k7qx')).toBe('K7QX');
    expect(parseRoomCode('K7qX')).toBe('K7QX');
  });

  test('ignores surrounding spaces', () => {
    expect(parseRoomCode('  k7qx ')).toBe('K7QX');
  });

  test('refuses the removed characters', () => {
    expect(parseRoomCode('K7Q0')).toBeUndefined();
    expect(parseRoomCode('k7qo')).toBeUndefined();
    expect(parseRoomCode('K7Q1')).toBeUndefined();
    expect(parseRoomCode('k7qi')).toBeUndefined();
    expect(parseRoomCode('k7ql')).toBeUndefined();
  });

  test('refuses a code of the wrong length or with other characters', () => {
    expect(parseRoomCode('')).toBeUndefined();
    expect(parseRoomCode('K7Q')).toBeUndefined();
    expect(parseRoomCode('K7QXA')).toBeUndefined();
    expect(parseRoomCode('K7-X')).toBeUndefined();
    expect(parseRoomCode('K7 X')).toBeUndefined();
  });
});

describe('roomCodeInput', () => {
  test('uppercases what was typed and drops the removed characters as they are typed', () => {
    expect(roomCodeInput('k')).toBe('K');
    expect(roomCodeInput('k7o')).toBe('K7');
    expect(roomCodeInput('k7lqx')).toBe('K7QX');
  });

  test('stops at the code length', () => {
    expect(roomCodeInput('k7qxab')).toBe('K7QX');
  });
});
