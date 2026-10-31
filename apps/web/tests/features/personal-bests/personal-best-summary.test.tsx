import { act, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { PersonalBestSummary } from '@/features/personal-bests/components/personal-best-summary';
import { toppedOutMarathon } from '../../support/games';
import { personalBest } from '../../support/records';
import { renderWithStores } from '../../support/render-with-stores';

describe('PersonalBestSummary', () => {
  test('says when a mode has no record yet', () => {
    renderWithStores(<PersonalBestSummary mode="sprint" />);
    expect(screen.getByText('no record yet')).toBeInTheDocument();
  });

  test("shows Sprint's best time", () => {
    const records = { version: 1, sprint: personalBest({ frames: 3_000 }) };
    renderWithStores(<PersonalBestSummary mode="sprint" />, { stored: { records } });
    expect(screen.getByText('0:50.000')).toBeInTheDocument();
  });

  test("shows Marathon's best score with its level and lines", () => {
    const best = personalBest({ outcome: 'gameOver', score: 184_300, level: 12, lines: 115 });
    renderWithStores(<PersonalBestSummary mode="marathon" />, {
      stored: { records: { version: 1, marathon: best } },
    });
    expect(screen.getByText('184,300 (level 12, 115 lines)')).toBeInTheDocument();
  });

  test('updates when a new personal best is recorded', () => {
    const { stores } = renderWithStores(<PersonalBestSummary mode="marathon" />);
    const game = toppedOutMarathon();
    act(() => void stores.records.submit(game));
    expect(screen.queryByText('no record yet')).not.toBeInTheDocument();
    expect(screen.getByText(/\(level 1, 0 lines\)/)).toBeInTheDocument();
  });
});
