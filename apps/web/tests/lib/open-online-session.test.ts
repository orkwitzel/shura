import type { Connect } from '@shura/client-core';
import { describe, expect, test, vi } from 'vitest';
import { deferredConnect, gatewayUrl } from '@/lib/open-online-session';

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

describe('deferredConnect', () => {
  const handlers = { open: () => {}, message: () => {}, close: () => {} };
  const recording = () => {
    const socket = { send: vi.fn(), close: vi.fn() };
    const connect = vi.fn<Connect>(() => socket);
    return { socket, connect };
  };

  test('dials once the current task is done, then passes everything on', async () => {
    const { socket, connect } = recording();
    const opened = deferredConnect(connect)('ws://x/ws', handlers);
    expect(connect).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(connect).toHaveBeenCalledExactlyOnceWith('ws://x/ws', handlers);
    opened.send('hello');
    opened.close();
    expect(socket.send).toHaveBeenCalledWith('hello');
    expect(socket.close).toHaveBeenCalledOnce();
  });

  test('never dials for a socket closed straight away', async () => {
    const { connect } = recording();
    deferredConnect(connect)('ws://x/ws', handlers).close();
    await Promise.resolve();
    expect(connect).not.toHaveBeenCalled();
  });
});
