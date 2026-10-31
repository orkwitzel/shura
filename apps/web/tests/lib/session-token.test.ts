import { afterEach, describe, expect, test, vi } from 'vitest';
import { clearSessionToken, readSessionToken, saveSessionToken } from '@/lib/session-token';

describe('the session token in sessionStorage', () => {
  afterEach(() => vi.restoreAllMocks());

  test('is kept for the tab until cleared', () => {
    expect(readSessionToken()).toBeUndefined();
    saveSessionToken('abc');
    expect(sessionStorage.getItem('shura.sessionToken')).toBe('abc');
    expect(readSessionToken()).toBe('abc');
    clearSessionToken();
    expect(readSessionToken()).toBeUndefined();
  });

  test('is simply not kept when the browser blocks storage', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveSessionToken('abc')).not.toThrow();
    expect(readSessionToken()).toBeUndefined();
  });
});
