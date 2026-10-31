import { describe, expect, it } from 'vitest';
import { countdownLabel, createSoloSession } from '../src/index';
import { fakeClock } from './support/fake-clock';

/** The countdown before Go: 1.5 s. */
const COUNTDOWN_MS = 1_500;

/** A Sprint from seed 7 on a fake clock, and its countdown label now. */
function sprint() {
  const clock = fakeClock();
  const session = createSoloSession({ mode: 'sprint', clock, seed: 7 });
  return { clock, session, label: () => countdownLabel(session.getState()) };
}

describe('the countdown label (design §13.1, Countdown)', () => {
  it('counts 3, 2, 1, 0.5 s a step, then shows GO for the first 0.5 s of play', () => {
    const { clock, session, label } = sprint();
    expect(label()).toBe('3');
    clock.run(499);
    expect(label()).toBe('3');
    clock.run(1);
    expect(label()).toBe('2');
    clock.run(500);
    expect(label()).toBe('1');
    clock.run(500);
    expect(session.getState()).toMatchObject({ phase: 'playing', goFrame: 0 });
    expect(label()).toBe('GO');
    // Frame 29 is the last of GO's 30.
    clock.run(499);
    expect(label()).toBe('GO');
    clock.run(1);
    expect(label()).toBeNull();
    session.pause();
  });

  it('counts again on resuming, and shows GO from the frame the game paused at', () => {
    const { clock, session, label } = sprint();
    clock.run(COUNTDOWN_MS + 1_000);
    session.pause();
    expect(label()).toBeNull();
    session.resume();
    expect(label()).toBe('3');
    const { goFrame } = session.getState();
    expect(goFrame).toBe(session.getState().engine.frame);
    clock.run(COUNTDOWN_MS + 100);
    expect(session.getState().engine.frame - goFrame).toBeLessThan(30);
    expect(label()).toBe('GO');
    clock.run(500);
    expect(label()).toBeNull();
    session.pause();
  });

  it('counts again on a restart, with Go at frame 0', () => {
    const { clock, session, label } = sprint();
    clock.run(COUNTDOWN_MS + 1_000);
    session.restart(7);
    expect(session.getState()).toMatchObject({ goFrame: 0 });
    expect(label()).toBe('3');
    clock.run(COUNTDOWN_MS);
    expect(label()).toBe('GO');
    session.pause();
  });
});
