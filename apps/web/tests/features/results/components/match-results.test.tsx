import type { ServerMessageOf } from '@shura/protocol';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { MatchResults, type MatchResultsProps } from '@/features/results/components/match-results';

/** An FFA's end: Mira won, you (`me`) came 2nd, and Dan and Tal went out together, sharing 4th. */
const FFA_END: ServerMessageOf<'matchEnd'> = {
  type: 'matchEnd',
  placements: [
    { playerId: 'dan', place: 4, reason: 'toppedOut', frame: 900 },
    { playerId: 'me', place: 2, reason: 'toppedOut', frame: 2_000 },
    { playerId: 'mira', place: 1 },
    { playerId: 'tal', place: 4, reason: 'laggedOut', frame: 900 },
    { playerId: 'noa', place: 3, reason: 'left', frame: 1_500 },
  ],
  stats: [
    { playerId: 'mira', linesSent: 41, apm: 14.72, pps: 2.214 },
    { playerId: 'me', linesSent: 38, apm: 13.6, pps: 2.04 },
    { playerId: 'noa', linesSent: 29, apm: 10.9, pps: 1.88 },
    { playerId: 'tal', linesSent: 17, apm: 7.1, pps: 1.4 },
    { playerId: 'dan', linesSent: 12, apm: 6, pps: 1.35 },
  ],
};

const NAMES = new Map([
  ['me', 'Or'],
  ['mira', 'Mira'],
  ['noa', 'noa_k'],
  ['tal', 'Tal'],
  ['dan', 'שירה'],
]);

function show(props: Partial<MatchResultsProps> = {}) {
  const handlers = { onBack: vi.fn(), onRematch: vi.fn(), onLeave: vi.fn() };
  render(
    <MatchResults
      result={FFA_END}
      you="me"
      name={(id) => NAMES.get(id) ?? '?'}
      roomCode="K7QX"
      quickMatch={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

/** The table's rows, each as its cells' text. */
const rows = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    );

afterEach(() => {
  vi.useRealTimers();
});

describe('MatchResults (design §13.2, Results)', () => {
  test('titles it with your place, and says who won', () => {
    show();
    const dialog = screen.getByRole('dialog', { name: '2nd place' });
    expect(within(dialog).getByText(/Mira won/)).toBeInTheDocument();
    expect(within(dialog).getByText(/K7QX/)).toBeInTheDocument();
  });

  test('lists every player by place, with lines sent, attack per minute and pieces per second', () => {
    show();
    expect(rows()).toEqual([
      ['1', 'Mira', '41', '14.7', '2.21'],
      ['2', expect.stringContaining('Or'), '38', '13.6', '2.04'],
      ['3', 'noa_k', '29', '10.9', '1.88'],
      ['4', 'שירה', '12', '6.0', '1.35'],
      ['4', 'Tal', '17', '7.1', '1.40'],
    ]);
  });

  test('shows a shared place as the same place for each, after the place before it', () => {
    show();
    const places = rows().map(([place]) => place);
    expect(places.filter((place) => place === '4')).toHaveLength(2);
    expect(places).not.toContain('5');
  });

  test('highlights your row', () => {
    show();
    const table = within(screen.getByRole('table'));
    const yours = table.getAllByRole('row').filter((row) => row.hasAttribute('data-you'));
    expect(yours).toHaveLength(1);
    expect(yours[0]).toHaveTextContent('Or');
    expect(yours[0]).toHaveTextContent('you');
  });

  test('a spectator, who has no place, sees "Results" and no row highlighted', () => {
    show({ you: null });
    expect(screen.getByRole('dialog', { name: 'Results' })).toBeInTheDocument();
    const table = within(screen.getByRole('table'));
    expect(table.getAllByRole('row').filter((row) => row.hasAttribute('data-you'))).toEqual([]);
  });

  test('Enter goes back to the lobby', async () => {
    const { onBack } = show();
    await userEvent.keyboard('{Enter}');
    expect(onBack).toHaveBeenCalledOnce();
  });

  test('goes back to the lobby on its own after 10 s, counting the seconds down', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { onBack } = show();
    const back = screen.getByRole('menuitem', { name: /Back to lobby/ });
    expect(back).toHaveTextContent('10 s');
    act(() => vi.advanceTimersByTime(3_000));
    expect(back).toHaveTextContent('7 s');
    act(() => vi.advanceTimersByTime(6_900));
    expect(onBack).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(100));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('MatchResults in a quick-match room (design §9.4)', () => {
  const ONE_VS_ONE: ServerMessageOf<'matchEnd'> = {
    type: 'matchEnd',
    placements: [
      { playerId: 'me', place: 1 },
      { playerId: 'mira', place: 2, reason: 'toppedOut', frame: 1_200 },
    ],
    stats: [
      { playerId: 'me', linesSent: 20, apm: 30, pps: 2 },
      { playerId: 'mira', linesSent: 12, apm: 18, pps: 1.5 },
    ],
  };

  test('offers Rematch (Enter) and Leave (Esc), and never goes back on its own', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { onBack } = show({ result: ONE_VS_ONE, quickMatch: true });
    expect(screen.getByRole('dialog', { name: '1st place' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Rematch'),
      expect.stringContaining('Leave'),
    ]);
    act(() => vi.advanceTimersByTime(30_000));
    expect(onBack).not.toHaveBeenCalled();
  });

  test('Enter asks for a rematch, then waits for the opponent: Enter again does nothing', async () => {
    const { onRematch, onLeave } = show({ result: ONE_VS_ONE, quickMatch: true });
    await userEvent.keyboard('{Enter}');
    expect(onRematch).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Waiting for Mira…'),
      expect.stringContaining('Leave'),
    ]);
    await userEvent.keyboard('{Enter}');
    expect(onRematch).toHaveBeenCalledOnce();
    expect(onLeave).not.toHaveBeenCalled();
  });

  test('Esc leaves', async () => {
    const { onLeave, onRematch } = show({ result: ONE_VS_ONE, quickMatch: true });
    await userEvent.keyboard('{Escape}');
    expect(onLeave).toHaveBeenCalledOnce();
    expect(onRematch).not.toHaveBeenCalled();
  });
});
