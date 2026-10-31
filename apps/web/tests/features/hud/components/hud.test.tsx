import { createSoloSession, type SoloMode } from '@shura/client-core';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { Hud } from '@/features/hud/components/hud';
import { fakeClock } from '../../../support/fake-clock';

function setup(mode: SoloMode) {
  const clock = fakeClock(0);
  const session = createSoloSession({ mode, clock, seed: 3 });
  render(<Hud session={session} />);
  return { clock, session };
}

/** A HUD value, found by its label. */
const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling;

describe('the HUD', () => {
  test('Sprint shows the time since Go and the lines out of 40', () => {
    const { clock } = setup('sprint');
    expect(stat('Time')).toHaveTextContent('0:00.000');
    expect(stat('Lines')).toHaveTextContent('0/40');
    // The countdown is 1.5 s; a second after Go is frame 60.
    act(() => clock.run(2_500));
    expect(stat('Time')).toHaveTextContent('0:01.000');
  });

  test('Marathon shows the level, the lines out of 150 and the score', () => {
    setup('marathon');
    expect(stat('Level')).toHaveTextContent('1');
    expect(stat('Lines')).toHaveTextContent('0/150');
    expect(stat('Score')).toHaveTextContent('0');
  });

  test('Ultra shows the time left of the 2 minutes and the score', () => {
    const { clock } = setup('ultra');
    expect(stat('Time left')).toHaveTextContent('2:00.000');
    expect(stat('Score')).toHaveTextContent('0');
    act(() => clock.run(2_500));
    expect(stat('Time left')).toHaveTextContent('1:59.000');
  });
});
