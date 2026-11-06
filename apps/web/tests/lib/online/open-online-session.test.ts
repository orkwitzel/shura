import type { Connect, Fetch } from '@shura/client-core';
import { describe, expect, test, vi } from 'vitest';
import { deferredConnect, deferredFetch } from '@/lib/online/open-online-session';

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

describe('deferredFetch', () => {
  const init = { method: 'POST', headers: {} };
  const response = { ok: true, status: 200, json: async () => ({}) };

  test('fetches once the current task is done', async () => {
    const fetch = vi.fn<Fetch>(async () => response);
    const answer = deferredFetch(fetch, () => false)('/api/sessions', init);
    expect(fetch).not.toHaveBeenCalled();
    await expect(answer).resolves.toBe(response);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/sessions', init);
  });

  test('never fetches for a session closed straight away', async () => {
    const fetch = vi.fn<Fetch>(async () => response);
    let closed = false;
    const answer = deferredFetch(fetch, () => closed)('/api/sessions', init);
    closed = true;
    await expect(answer).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
