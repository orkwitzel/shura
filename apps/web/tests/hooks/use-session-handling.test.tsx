import { createSoloSession, type SoloSession } from '@shura/client-core';
import { ActionType, canMove } from '@shura/engine';
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { SettingsForm } from '@/features/settings/components/settings-form';
import { useSessionHandling } from '@/hooks/use-session-handling';
import { type FakeClock, fakeClock } from '../support/fake-clock';
import { renderWithStores } from '../support/render-with-stores';

/** The countdown before Go, and a frame. */
const COUNTDOWN_MS = 1_500;
const FRAME_MS = 1_000 / 60;

/** A game with the settings over it, as the solo page shows them over the paused game. */
function Game({ session }: { session: SoloSession }) {
  useSessionHandling(session);
  return <SettingsForm onClose={() => {}} />;
}

/** A Sprint past its countdown, paused for the settings, with the handling the store holds. */
function pausedSprint(): { session: SoloSession; clock: FakeClock } {
  const clock = fakeClock();
  const session = createSoloSession({ mode: 'sprint', clock, seed: 7 });
  renderWithStores(<Game session={session} />);
  act(() => clock.run(COUNTDOWN_MS + 100));
  act(() => session.pause());
  return { session, clock };
}

/** Resumes, holds → from Go, and plays `frames` frames. */
function holdRight(session: SoloSession, clock: FakeClock, frames: number): void {
  act(() => session.resume());
  act(() => clock.run(COUNTDOWN_MS - 1));
  session.key({ action: ActionType.MoveRight, kind: 'press', time: clock.now() });
  act(() => clock.run(frames * FRAME_MS));
}

const atRightWall = (session: SoloSession) => !canMove(session.getState().engine, 1, 0);

describe('useSessionHandling', () => {
  test('with the default handling, a held direction waits for DAS', () => {
    const { session, clock } = pausedSprint();
    holdRight(session, clock, 3);
    expect(atRightWall(session)).toBe(false);
  });

  test('handling changed in the settings changes how the game plays when it resumes', () => {
    const { session, clock } = pausedSprint();
    fireEvent.change(screen.getByRole('slider', { name: 'DAS' }), { target: { value: '0' } });
    fireEvent.change(screen.getByRole('slider', { name: 'ARR' }), { target: { value: '0' } });
    holdRight(session, clock, 3);
    expect(atRightWall(session)).toBe(true);
  });
});
