// @vitest-environment happy-dom
/// <reference lib="dom" />
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createSoloSession, type SoloSession, type SoloSessionState } from '../src/index';
import { useSession } from '../src/react';
import { type FakeClock, fakeClock } from './support/fake-clock';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('useSession', () => {
  let clock: FakeClock;
  let session: SoloSession;
  let root: Root;

  beforeEach(() => {
    clock = fakeClock();
    session = createSoloSession({ mode: 'sprint', clock, seed: 7 });
    root = createRoot(document.createElement('div'));
  });

  afterEach(() => {
    act(() => root.unmount());
    session.pause();
  });

  /** Renders `useSession(session, selector)`, recording the value of every render. */
  function renderSelected<T>(selector: (state: SoloSessionState) => T): T[] {
    const renders: T[] = [];
    function Probe() {
      renders.push(useSession(session, selector));
      return null;
    }
    act(() => root.render(<Probe />));
    return renders;
  }

  /** Lets the session's loop run for `ms` on time, inside `act`. */
  function run(ms: number) {
    act(() => clock.run(ms));
  }

  test('returns the selected slice of the session state', () => {
    const renders = renderSelected((state) => state.seed);
    expect(renders).toEqual([7]);
  });

  test('re-renders as the selected slice changes', () => {
    const renders = renderSelected((state) => state.countdown);
    expect(renders).toEqual([90]);
    // Each frame of the countdown changes it: 50 ms is three frames.
    run(50);
    expect(renders.at(-1)).toBe(87);
    expect(renders.length).toBeGreaterThan(1);
  });

  test('does not re-render while the selected slice stays the same', () => {
    const renders = renderSelected((state) => state.phase);
    // The countdown changes the state every frame, but the phase stays 'countdown' until Go.
    run(1000);
    expect(renders).toEqual(['countdown']);
    run(600);
    expect(renders).toEqual(['countdown', 'playing']);
  });

  test('without a selector, returns the whole state and follows each change', () => {
    const renders: SoloSessionState[] = [];
    function Probe() {
      renders.push(useSession(session));
      return null;
    }
    act(() => root.render(<Probe />));
    run(50);
    expect(renders.at(-1)).toBe(session.getState());
    expect(renders.at(-1)?.countdown).toBe(87);
  });
});
