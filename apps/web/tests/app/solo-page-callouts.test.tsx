import { screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
// The engine's recorded T-spin game (design §5.3), a Sprint without its line goal: its opener is a
// T-spin double, which locks at frame 72. Its next clear, a single, locks at frame 81.
import tSpins from '../../../../packages/engine/recorded-matches/t-spins.json';
import { finishRecorded, type RecordedGame } from '../support/solo-game';

/** The frame the recorded game's T-spin double locks at. */
const T_SPIN_DOUBLE_FRAME = 72;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The recorded game's opener: its actions up to the T-spin double's hard drop. */
const opener: RecordedGame = {
  seed: tSpins.seed,
  players: [
    {
      actions: (tSpins.players[0]?.actions ?? []).filter(
        ({ frame }) => frame <= T_SPIN_DOUBLE_FRAME,
      ),
    },
  ],
};

test('a T-spin double played through the engine shows "T-SPIN DOUBLE", with effects Off', async () => {
  await finishRecorded('/solo/sprint', 'Sprint', opener, {
    stored: { settings: { version: 1, effects: 'off' } },
  });
  expect(screen.getByRole('status', { name: 'Callouts' })).toHaveTextContent('T-SPIN DOUBLE');
  expect(screen.getByText('T-SPIN DOUBLE')).toBeVisible();
});
