import { describe, expect, test } from 'vitest';
import { gatewayUrl } from '@/lib/open-online-session';

describe('gatewayUrl', () => {
  test('is /ws on the page’s own origin, over TLS when the page is', () => {
    expect(gatewayUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/ws',
    );
    expect(gatewayUrl({ protocol: 'https:', host: 'shura.example' })).toBe(
      'wss://shura.example/ws',
    );
  });
});
