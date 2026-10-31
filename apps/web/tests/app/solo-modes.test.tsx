import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
// The engine's recorded Marathon and Ultra (design §5.3): each a full game whose action log plays it
// to its end.
import marathon from '../../../../packages/engine/recorded-matches/marathon.json';
import ultra from '../../../../packages/engine/recorded-matches/ultra.json';
import { personalBest } from '../support/records';
import {
  COUNTDOWN_MS,
  dialog,
  finishRecorded,
  personalBestLine,
  play,
  result,
  runTo,
  stat,
  tap,
} from '../support/solo-game';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A mode's item on the main menu. */
const modeItem = (name: string) => screen.getByRole('menuitem', { name });

/** Hard drops a piece every 50 ms, from Go, until the stack tops out. */
async function topOut(path: string, name: string, stored?: Parameters<typeof play>[2]) {
  const { app, start } = await play(path, name, stored);
  runTo(start + COUNTDOWN_MS + 20);
  for (let drop = 0; drop < 100 && !dialog('Game over'); drop++) {
    tap('Space');
    runTo(performance.now() + 50);
  }
  return app;
}

describe('/solo/marathon', () => {
  test('plays to 150 lines: Finished, with the score as its headline, and records it', async () => {
    const app = await finishRecorded('/solo/marathon', 'Marathon', marathon);
    // The recorded Marathon reaches 150 lines at frame 4,065 (1:07.750), with 171,349 points.
    const results = dialog('Finished');
    expect(results).toHaveTextContent('Marathon');
    expect(results).toHaveTextContent('171,349');
    expect(result(results, 'Lines')).toHaveTextContent('150');
    expect(result(results, 'Pieces')).toHaveTextContent('377');
    expect(result(results, 'Time')).toHaveTextContent('1:07.750');
    expect(result(results, 'Level')).toHaveTextContent('15');
    expect(personalBestLine(results)).toHaveTextContent('New personal best!');
    expect(app.stores.records.getState().marathon?.stats.score).toBe(171_349);
    // The HUD followed the game to its end.
    expect(stat('Level')).toHaveTextContent('15');
    expect(stat('Lines')).toHaveTextContent('150/150');
    expect(stat('Score')).toHaveTextContent('171,349');
  });

  test('its best shows on the main menu with the level and lines', async () => {
    const app = await finishRecorded('/solo/marathon', 'Marathon', marathon);
    await userEvent.keyboard('{Enter}');
    expect(app.location()).toBe('/');
    expect(modeItem('Marathon')).toHaveAccessibleDescription('171,349 (level 15, 150 lines)');
  });

  test('a top-out is Game over, and still counts for a personal best', async () => {
    const app = await topOut('/solo/marathon', 'Marathon');
    const results = dialog('Game over');
    expect(results).toHaveTextContent('Marathon');
    expect(personalBestLine(results)).toHaveTextContent('New personal best!');
    expect(app.stores.records.getState().marathon?.stats.outcome).toBe('gameOver');
  });
});

describe('/solo/ultra', () => {
  test('plays the full 2 minutes: Finished, with the score as its headline, and records it', async () => {
    const app = await finishRecorded('/solo/ultra', 'Ultra', ultra);
    // The recorded Ultra finishes at the end of frame 7,200 with 21,449 points: 266 pieces and 101
    // lines (67 singles, 14 doubles and 2 triples) at level 1.
    const results = dialog('Finished');
    expect(results).toHaveTextContent('Ultra');
    expect(results).toHaveTextContent('21,449');
    expect(result(results, 'Lines')).toHaveTextContent('101');
    expect(result(results, 'Pieces')).toHaveTextContent('266');
    expect(result(results, 'Time')).toHaveTextContent('2:00.000');
    expect(result(results, 'Level')).toHaveTextContent('1');
    expect(personalBestLine(results)).toHaveTextContent('New personal best!');
    expect(app.stores.records.getState().ultra?.stats.score).toBe(21_449);
    // The HUD followed the game to its end.
    expect(stat('Time left')).toHaveTextContent('0:00.000');
    expect(stat('Score')).toHaveTextContent('21,449');
  });

  test('its best shows on the main menu', async () => {
    const app = await finishRecorded('/solo/ultra', 'Ultra', ultra);
    await userEvent.keyboard('{Enter}');
    expect(app.location()).toBe('/');
    expect(modeItem('Ultra')).toHaveAccessibleDescription('21,449');
  });

  test('says how far off the personal best a lower score was', async () => {
    const records = { version: 1, ultra: personalBest({ score: 25_000, frames: 7_200 }) };
    const app = await finishRecorded('/solo/ultra', 'Ultra', ultra, { stored: { records } });
    expect(personalBestLine(dialog('Finished'))).toHaveTextContent(
      '3,551 points off your best (25,000)',
    );
    expect(app.stores.records.getState().ultra?.stats.score).toBe(25_000);
  });

  test('a top-out is Game over, and sets no personal best', async () => {
    const app = await topOut('/solo/ultra', 'Ultra');
    const results = dialog('Game over');
    expect(results).toHaveTextContent('Ultra');
    expect(personalBestLine(results)).toHaveTextContent(
      "A top-out doesn't count for a personal best",
    );
    expect(app.stores.records.getState().ultra).toBeUndefined();
    expect(app.storage.texts.has('records')).toBe(false);
  });

  test('a top-out leaves the personal best as it was', async () => {
    const records = { version: 1, ultra: personalBest({ score: 25_000, frames: 7_200 }) };
    const app = await topOut('/solo/ultra', 'Ultra', { stored: { records } });
    expect(personalBestLine(dialog('Game over'))).toHaveTextContent(
      "A top-out doesn't count. Your best: 25,000",
    );
    expect(app.stores.records.getState().ultra?.stats.score).toBe(25_000);
  });
});
