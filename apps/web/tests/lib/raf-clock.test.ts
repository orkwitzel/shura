import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createRafClock } from '@/lib/raf-clock';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the requestAnimationFrame clock', () => {
  test('tells the time with performance.now()', () => {
    const clock = createRafClock();
    const before = clock.now();
    vi.advanceTimersByTime(100);
    expect(clock.now() - before).toBe(100);
  });

  test('wakes a callback once, at the next animation frame, while running', () => {
    const clock = createRafClock();
    clock.start();
    const wake = vi.fn();
    clock.schedule(wake);
    expect(wake).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(wake).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(100);
    expect(wake).toHaveBeenCalledOnce();
  });

  test('a cancelled callback never wakes', () => {
    const clock = createRafClock();
    clock.start();
    const wake = vi.fn();
    const cancel = clock.schedule(wake);
    cancel();
    vi.advanceTimersByTime(100);
    expect(wake).not.toHaveBeenCalled();
  });

  test('wakes nothing until started', () => {
    const clock = createRafClock();
    const wake = vi.fn();
    clock.schedule(wake);
    vi.advanceTimersByTime(100);
    expect(wake).not.toHaveBeenCalled();
    clock.start();
    vi.advanceTimersByTime(20);
    expect(wake).toHaveBeenCalledOnce();
  });

  test('stopping leaves no animation frame behind, and starting again carries on', () => {
    const clock = createRafClock();
    clock.start();
    const wake = vi.fn();
    clock.schedule(wake);
    clock.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(100);
    expect(wake).not.toHaveBeenCalled();
    clock.start();
    vi.advanceTimersByTime(20);
    expect(wake).toHaveBeenCalledOnce();
  });

  test('a callback cancelled while stopped stays cancelled', () => {
    const clock = createRafClock();
    clock.start();
    const wake = vi.fn();
    const cancel = clock.schedule(wake);
    clock.stop();
    cancel();
    clock.start();
    vi.advanceTimersByTime(100);
    expect(wake).not.toHaveBeenCalled();
  });
});
