// @vitest-environment happy-dom
/// <reference lib="dom" />

import { ActionType, createEngine, type PieceActionType, SPRINT } from '@shura/engine';
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createRecordsStore,
  createSettingsStore,
  createSoloSession,
  type RecordsStore,
  type SettingsStore,
  type SoloSession,
  type SoloSessionState,
} from '../src/index';
import {
  ClientCoreProvider,
  useRecords,
  useRecordsStore,
  useSession,
  useSettings,
  useSettingsStore,
  useSoloRecord,
} from '../src/react';
import { type FakeClock, fakeClock } from './support/fake-clock';
import { memoryStorage } from './support/memory-storage';

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

describe('useSettings and useRecords', () => {
  let root: Root;
  let settings: SettingsStore;
  let records: RecordsStore;

  beforeEach(() => {
    root = createRoot(document.createElement('div'));
    const storage = memoryStorage();
    const bindings = Object.fromEntries(
      Object.values(ActionType).map((action) => [action, [action]]),
    ) as unknown as Parameters<typeof createSettingsStore>[0]['bindings'];
    settings = createSettingsStore({ storage, bindings });
    records = createRecordsStore({ storage });
  });

  afterEach(() => act(() => root.unmount()));

  function renderInProvider(children: ReactNode) {
    act(() =>
      root.render(
        <ClientCoreProvider settings={settings} records={records}>
          {children}
        </ClientCoreProvider>,
      ),
    );
  }

  test('find the stores the provider holds, and re-render as the selected slice changes', () => {
    const ghosts: boolean[] = [];
    function Probe() {
      ghosts.push(useSettings((state) => state.ghost));
      return null;
    }
    renderInProvider(<Probe />);
    act(() => settings.update({ volume: 70 }));
    expect(ghosts).toEqual([true]);
    act(() => settings.update({ ghost: false }));
    expect(ghosts).toEqual([true, false]);
  });

  test('give the whole state without a selector', () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useSettings(), useRecords());
      return null;
    }
    renderInProvider(<Probe />);
    expect(seen).toEqual([settings.getState(), records.getState()]);
  });

  test('give the stores themselves, for their writes', () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useSettingsStore(), useRecordsStore());
      return null;
    }
    renderInProvider(<Probe />);
    expect(seen).toEqual([settings, records]);
  });

  test('follow a new personal best', () => {
    const bests: (number | undefined)[] = [];
    function Probe() {
      bests.push(useRecords((state) => state.sprint?.stats.frames));
      return null;
    }
    renderInProvider(<Probe />);
    const engine = {
      ...createEngine(SPRINT, 1, 0).state,
      frame: 3_000,
      score: 0,
      linesCleared: 40,
      piecesPlaced: 100,
      level: 1,
      toppedOut: false,
      finished: true,
    };
    act(() => records.submit({ mode: 'sprint', seed: 1, actions: [], engine }));
    expect(bests).toEqual([undefined, 3_000]);
  });

  test('throw outside a provider, saying what is missing', () => {
    function Probe() {
      useSettings();
      return null;
    }
    const error = console.error;
    console.error = () => {};
    try {
      expect(() => act(() => root.render(<Probe />))).toThrow(/ClientCoreProvider/);
    } finally {
      console.error = error;
    }
  });
});

describe('useSoloRecord', () => {
  let clock: FakeClock;
  let session: SoloSession;
  let records: RecordsStore;
  let root: Root;
  const lines: (string | undefined)[] = [];

  beforeEach(() => {
    clock = fakeClock();
    session = createSoloSession({ mode: 'marathon', clock, seed: 7 });
    const storage = memoryStorage();
    const bindings = Object.fromEntries(
      Object.values(ActionType).map((action) => [action, [action]]),
    ) as unknown as Record<PieceActionType, string[]>;
    records = createRecordsStore({ storage });
    root = createRoot(document.createElement('div'));
    lines.length = 0;
    function Probe() {
      lines.push(useSoloRecord(session));
      return null;
    }
    act(() =>
      root.render(
        <ClientCoreProvider settings={createSettingsStore({ storage, bindings })} records={records}>
          <Probe />
        </ClientCoreProvider>,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    session.pause();
  });

  /** Plays through the countdown, then hard drops until the stack tops out. */
  function topOut() {
    act(() => clock.run(1_600));
    for (let i = 0; i < 50 && session.getState().phase !== 'ended'; i++) {
      act(() => {
        session.act(ActionType.HardDrop, clock.now());
        clock.run(20);
      });
    }
    expect(session.getState().phase).toBe('ended');
  }

  test('records a game once when it ends, and gives its personal best line', () => {
    const submit = vi.spyOn(records, 'submit');
    expect(lines.at(-1)).toBeUndefined();
    topOut();
    expect(lines.at(-1)).toBe('New personal best!');
    expect(records.getState().marathon).toBeDefined();
    act(() => clock.run(500));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  test('records the game a restart starts as a new one', () => {
    const submit = vi.spyOn(records, 'submit');
    topOut();
    act(() => session.restart(7));
    expect(lines.at(-1)).toBeUndefined();
    topOut();
    expect(lines.at(-1)).toMatch(/^Equals your best/);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  test('records nothing for a game left before it ends', () => {
    const submit = vi.spyOn(records, 'submit');
    act(() => clock.run(2_000));
    act(() => session.pause());
    expect(lines.at(-1)).toBeUndefined();
    expect(submit).not.toHaveBeenCalled();
  });
});
