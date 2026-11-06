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
