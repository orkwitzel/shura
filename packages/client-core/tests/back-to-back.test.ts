import { TSpin } from '@shura/engine';
import { describe, expect, it } from 'vitest';
import { createSoloSession, isBackToBack, trackBackToBack } from '../src/index';
import { lockEvent } from './support/engine-events';
import { fakeClock } from './support/fake-clock';

describe('a back-to-back', () => {
  it('is a difficult clear made while the status was already on', () => {
    expect(isBackToBack(lockEvent({ lines: 4 }), true)).toBe(true);
    expect(isBackToBack(lockEvent({ lines: 1, tSpin: TSpin.Mini }), true)).toBe(true);
    expect(isBackToBack(lockEvent({ lines: 4 }), false)).toBe(false);
    expect(isBackToBack(lockEvent({ lines: 3 }), true)).toBe(false);
    expect(isBackToBack(lockEvent({ tSpin: TSpin.Full }), true)).toBe(false);
  });
});

describe('a session’s back-to-back tracker', () => {
  function tracking() {
    const clock = fakeClock();
    const session = createSoloSession({ mode: 'sprint', clock, seed: 7 });
    return { session, clock, tracker: trackBackToBack(session) };
  }

  it('gives each lock the status the lock before it left, off before the first', () => {
    const { tracker } = tracking();
    expect(tracker.next(lockEvent({ lines: 4, backToBack: true }))).toBe(false);
    expect(tracker.next(lockEvent({ backToBack: true }))).toBe(true);
    expect(tracker.next(lockEvent({ lines: 1, backToBack: false }))).toBe(true);
    expect(tracker.next(lockEvent({ lines: 4, backToBack: true }))).toBe(false);
  });

  it('starts again with the status off when the session restarts', () => {
    const { session, clock, tracker } = tracking();
    clock.run(2_000);
    tracker.next(lockEvent({ lines: 4, backToBack: true }));
    session.restart();
    expect(tracker.next(lockEvent({ lines: 4, backToBack: true }))).toBe(false);
  });

  it('keeps the status through a pause', () => {
    const { session, clock, tracker } = tracking();
    clock.run(2_000);
    tracker.next(lockEvent({ lines: 4, backToBack: true }));
    session.pause();
    session.resume();
    clock.run(2_000);
    expect(tracker.next(lockEvent({ lines: 4, backToBack: true }))).toBe(true);
  });

  it('no longer starts again once stopped', () => {
    const { session, clock, tracker } = tracking();
    clock.run(2_000);
    tracker.next(lockEvent({ lines: 4, backToBack: true }));
    tracker.stop();
    session.restart();
    expect(tracker.next(lockEvent({ lines: 4, backToBack: true }))).toBe(true);
  });
});
