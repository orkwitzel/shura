import { expect, test } from 'vitest';
import { roomLink } from '../../src/addresses/room-link';

test('a room’s link is /r/CODE at the web client’s origin', () => {
  expect(roomLink('http://127.0.0.1:5173', 'K7QX')).toBe('http://127.0.0.1:5173/r/K7QX');
  expect(roomLink('https://shura.example/play', 'K7QX')).toBe('https://shura.example/r/K7QX');
});

test('no link for a URL that isn’t an HTTP one', () => {
  expect(roomLink('ws://shura.example', 'K7QX')).toBeNull();
  expect(roomLink('not a url', 'K7QX')).toBeNull();
});
