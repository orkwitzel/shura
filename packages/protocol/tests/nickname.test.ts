import { describe, expect, test } from 'vitest';
import { NICKNAME_MAX_LENGTH, suggestNickname, validateNickname } from '../src/index';

const accepted = (raw: string) => {
  const result = validateNickname(raw);
  if (!result.ok) throw new Error(`expected ${JSON.stringify(raw)} to pass, got ${result.reason}`);
  return result.nickname;
};
const reason = (raw: string) => {
  const result = validateNickname(raw);
  return result.ok ? undefined : result.reason;
};

describe('validateNickname', () => {
  test('accepts Latin letters, digits, underscores, hyphens and spaces', () => {
    expect(accepted('Or_K-42 x')).toBe('Or_K-42 x');
  });

  test('accepts Hebrew, with or without niqqud', () => {
    expect(accepted('אור')).toBe('אור');
    expect(accepted('שָׁלוֹם')).toBe('שָׁלוֹם');
  });

  test('accepts mixed scripts', () => {
    expect(accepted('Or אור Юля 7')).toBe('Or אור Юля 7');
    expect(accepted('Zoë_Ñandú')).toBe('Zoë_Ñandú');
  });

  test('NFC-normalizes, so a decomposed accent counts as one character', () => {
    expect(accepted('René')).toBe('René');
    expect(accepted('é'.repeat(NICKNAME_MAX_LENGTH))).toBe('é'.repeat(NICKNAME_MAX_LENGTH));
  });

  test('strips zero-width and other invisible format characters', () => {
    expect(accepted('Or​K')).toBe('OrK');
    expect(accepted('﻿Or‌‍K⁠')).toBe('OrK');
    expect(accepted('‮abc')).toBe('abc');
  });

  test('strips control characters', () => {
    expect(accepted('Or\u0007K')).toBe('OrK');
    expect(accepted('a\tb\nc\u007F')).toBe('abc');
  });

  test('composes what stripping brings together', () => {
    expect(accepted('e​́')).toBe('é');
  });

  test('trims spaces and collapses runs of them, other spaces included', () => {
    expect(accepted('  Or   K  ')).toBe('Or K');
    expect(accepted('Or 　K')).toBe('Or K');
  });

  test('takes 1 to 16 characters, counted after normalizing', () => {
    expect(accepted('a')).toBe('a');
    expect(accepted('a'.repeat(16))).toBe('a'.repeat(16));
    expect(accepted('ש'.repeat(16))).toBe('ש'.repeat(16));
    expect(accepted(`${'a'.repeat(16)}​​`)).toBe('a'.repeat(16));
    expect(reason('a'.repeat(17))).toBe('tooLong');
    expect(reason('ש'.repeat(17))).toBe('tooLong');
  });

  test('refuses a name that is empty once normalized', () => {
    expect(reason('')).toBe('empty');
    expect(reason('   ')).toBe('empty');
    expect(reason('​\u0007')).toBe('empty');
  });

  test('refuses punctuation, symbols and emoji', () => {
    expect(reason('Or!')).toBe('invalidCharacters');
    expect(reason('a@b')).toBe('invalidCharacters');
    expect(reason('gg🎮')).toBe('invalidCharacters');
    expect(reason('½')).toBe('invalidCharacters');
    expect(reason('a.b')).toBe('invalidCharacters');
  });

  test('refuses a blocklisted word, whatever its case, spacing or accents', () => {
    expect(reason('admin')).toBe('blocked');
    expect(reason('The Admin')).toBe('blocked');
    expect(reason('A d_m-I n')).toBe('blocked');
    expect(reason('xXfuckXx')).toBe('blocked');
    expect(reason('שַׁרְמוּטָה')).toBe('blocked');
  });
});

describe('suggestNickname', () => {
  test('is Player and four digits', () => {
    expect(suggestNickname(() => 0)).toBe('Player0000');
    expect(suggestNickname(() => 0.0042)).toBe('Player0042');
    expect(suggestNickname(() => 0.99999)).toBe('Player9999');
    expect(suggestNickname()).toMatch(/^Player\d{4}$/);
  });

  test('is a valid nickname', () => {
    expect(accepted(suggestNickname())).toMatch(/^Player\d{4}$/);
  });
});
