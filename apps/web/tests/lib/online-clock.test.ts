import { type Connect, createOnlineSession, type SocketHandlers } from '@shura/client-core';
import { describe, expect, test, vi } from 'vitest';
import { createOnlineClock, HIDDEN_WAKE_MS } from '@/lib/online-clock';
import { fakeBrowser } from '../support/fake-browser';

describe('the online clock (design §8.4: an online game never pauses)', () => {
  test('wakes the loop at the next animation frame while the tab is visible', () => {
    const browser = fakeBrowser();
    const clock = createOnlineClock(browser.platform);
    const wake = vi.fn();
    clock.schedule(wake);
    expect(browser.frames).toBe(1);
    expect(browser.timers).toBe(0);
    browser.advance(16);
    expect(wake).toHaveBeenCalledOnce();
  });

  test('wakes it from a worker timer while the tab is hidden', () => {
    const browser = fakeBrowser();
    const clock = createOnlineClock(browser.platform);
    browser.setHidden(true);
    const wake = vi.fn();
    clock.schedule(wake);
    expect(browser.frames).toBe(0);
    browser.advance(HIDDEN_WAKE_MS);
    expect(wake).toHaveBeenCalledOnce();
  });

  test('moves a wake waiting for an animation frame to a worker timer as the tab hides', () => {
    const browser = fakeBrowser();
    const clock = createOnlineClock(browser.platform);
    const wake = vi.fn();
    clock.schedule(wake);
    browser.setHidden(true);
    expect(browser.frames).toBe(0);
    browser.advance(HIDDEN_WAKE_MS);
    expect(wake).toHaveBeenCalledOnce();
    // And back to animation frames once it shows again.
    clock.schedule(wake);
    browser.setHidden(false);
    expect(browser.timers).toBe(0);
    browser.advance(16);
    expect(wake).toHaveBeenCalledTimes(2);
  });

  test('cancels a wake, waiting either way', () => {
    const browser = fakeBrowser();
    const clock = createOnlineClock(browser.platform);
    const wake = vi.fn();
    clock.schedule(wake)();
    browser.setHidden(true);
    clock.schedule(wake)();
    browser.advance(100);
    expect(wake).not.toHaveBeenCalled();
  });

  test('times the pings with worker timers, hidden or not', () => {
    const browser = fakeBrowser();
    const clock = createOnlineClock(browser.platform);
    const ping = vi.fn();
    clock.after(2_000, ping);
    browser.setHidden(true);
    browser.advance(1_999);
    expect(ping).not.toHaveBeenCalled();
    browser.advance(1);
    expect(ping).toHaveBeenCalledOnce();
  });
});

describe('a match on the online clock, in a hidden tab (design §8.4)', () => {
  /** An online session on the fake browser's clock, over a socket the test plays the server on. */
  function playing() {
    const browser = fakeBrowser();
    let server: SocketHandlers | undefined;
    const sent: { type: string; frames?: { frame: number }[] }[] = [];
    const connect: Connect = (_url, handlers) => {
      server = handlers;
      return { send: (text) => sent.push(JSON.parse(text)), close: () => {} };
    };
    const session = createOnlineSession({
      url: 'ws://test/ws',
      connect,
      clock: createOnlineClock(browser.platform),
      nickname: 'Or',
      clientVersion: 'test',
    });
    const say = (message: object) => server?.message(JSON.stringify(message));
    server?.open();
    say({ type: 'welcome', sessionId: 'me', sessionToken: 't', nickname: 'Or', serverTime: 0 });
    say({
      type: 'roomState',
      code: 'K7QX',
      mode: '1v1',
      hostId: 'me',
      phase: 'countdown',
      players: [
        { id: 'me', nickname: 'Or', kind: 'guest', seat: 0, ready: true },
        { id: 'bo', nickname: 'Bo', kind: 'guest', seat: 1, ready: true },
      ],
      spectators: [],
    });
    // No pong has come back, so the offset is 0: frame 0 falls at 3 s on this clock.
    say({
      type: 'countdown',
      startAt: 3_000,
      seed: 7,
      matchId: 'm',
      players: [
        { id: 'me', index: 0 },
        { id: 'bo', index: 1 },
      ],
    });
    const frame = () => session.getState().match?.players[0]?.engine.frame ?? 0;
    const batches = () => sent.filter(({ type }) => type === 'inputBatch');
    return { browser, session, frame, batches };
  }

  test('keeps stepping and sending batches while the tab is hidden, with no animation frames', () => {
    const { browser, frame, batches } = playing();
    for (let at = 0; at < 4_000; at += 16) browser.advance(16);
    expect(frame()).toBe(60);
    const before = batches().length;

    browser.setHidden(true);
    // 5 s hidden: the loop is woken from a worker timer about once a frame.
    for (let at = 0; at < 5_000; at += HIDDEN_WAKE_MS) browser.advance(HIDDEN_WAKE_MS);
    expect(frame()).toBeGreaterThanOrEqual(60 + 299);
    expect(batches().length - before).toBeGreaterThanOrEqual(99);
    // Back on show, it carries on from there.
    browser.setHidden(false);
    browser.advance(16);
    expect(frame()).toBeGreaterThanOrEqual(360);
  });
});
