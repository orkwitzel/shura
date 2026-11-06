import { describe, expect, test, vi } from 'vitest';
import { createOnlineClock, HIDDEN_WAKE_MS } from '@/lib/online-clock';
import { fakeBrowser } from '../support/fake-browser';
import { scriptedServer } from '../support/scripted-server';

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
  /**
   * A real online session on the fake browser's online clock, over the scripted server: its 1v1
   * counts down to Go at 3 s on that clock (no pong has come back, so the offset is 0).
   */
  async function playing() {
    const server = scriptedServer();
    const session = server.open({ nickname: 'Or' });
    await server.accept();
    const players = [
      { id: 'me', nickname: 'Or', kind: 'guest' as const, seat: 0, ready: true },
      { id: 'bo', nickname: 'Bo', kind: 'guest' as const, seat: 1, ready: true },
    ];
    server.say({
      event: 'roomState',
      data: {
        code: 'K7QX',
        mode: '1v1',
        hostId: 'me',
        phase: 'countdown',
        players,
        spectators: [],
      },
    });
    server.say({
      event: 'countdown',
      data: {
        startAt: 3_000,
        seed: 7,
        matchId: 'm',
        players: players.map(({ id }, index) => ({ id, index })),
      },
    });
    const frame = () => session.getState().match?.players[0]?.engine.frame ?? 0;
    const batches = () => server.sent.filter(({ event }) => event === 'inputBatch');
    return { browser: server.browser, frame, batches };
  }

  test('keeps stepping and sending batches while the tab is hidden, with no animation frames', async () => {
    const { browser, frame, batches } = await playing();
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
