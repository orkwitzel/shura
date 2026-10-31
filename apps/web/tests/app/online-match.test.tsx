import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { AppRouter } from '@/app/router';
import { pixiApps, tickPixi } from '../support/fake-pixi';
import { renderWithStores } from '../support/render-with-stores';
import { scriptedServer } from '../support/scripted-server';

const NAMED = { settings: { version: 1, nickname: 'Or' } };

beforeEach(() => {
  window.innerWidth = 1600;
  window.innerHeight = 900;
  window.devicePixelRatio = 1;
});

const player = (id: string, seat: number, nickname = id) => ({
  id,
  nickname,
  kind: 'guest',
  seat,
  ready: true,
});

/**
 * The app in room K7QX with a match starting: you (`Or`) and the opponents given (a 1v1 against
 * Bo by default), a code room unless `quickMatch`. The countdown's frame 0 falls 3 s on.
 */
async function inMatch({
  opponents = [['bo', 'Bo']] as [string, string][],
  quickMatch = false,
  stored = NAMED as object,
} = {}) {
  const server = scriptedServer();
  const app = renderWithStores(<AppRouter />, { path: '/r/K7QX', online: server.open, stored });
  server.accept();
  const players = [
    player('me', 0, 'Or'),
    ...opponents.map(([id, name], at) => player(id, at + 1, name)),
  ];
  server.say({
    type: 'roomState',
    code: 'K7QX',
    mode: opponents.length > 1 ? 'ffa' : '1v1',
    ...(!quickMatch && { hostId: 'me' }),
    phase: 'countdown',
    players,
    spectators: [],
  });
  server.say({
    type: 'countdown',
    startAt: 3_000,
    seed: 7,
    matchId: 'm1',
    players: players.map(({ id }, index) => ({ id, index })),
  });
  // The match screen loads apart, then Pixi starts.
  await screen.findByRole('region', { name: 'Your board' });
  await act(async () => {});
  const frame = () => server.session().getState().match?.players[0]?.engine.frame ?? 0;
  return { ...app, server, frame };
}

const menu = () => screen.queryByRole('dialog', { name: 'Menu' });

describe('the match screen (design §13.2, Match)', () => {
  test('shows your board and the opponent’s, with names, the countdown and your HUD', async () => {
    const { server } = await inMatch();
    const yours = screen.getByRole('region', { name: 'Your board' });
    expect(within(yours).getByText('Or')).toBeInTheDocument();
    expect(within(yours).getByText(/You ·/)).toBeInTheDocument();
    expect(within(yours).getByRole('timer', { name: 'Countdown' })).toHaveTextContent('3');
    expect(within(yours).getByText('Sent', { selector: 'dt' })).toBeInTheDocument();
    const theirs = screen.getByRole('region', { name: 'Opponent’s board' });
    expect(within(theirs).getByText('Bo')).toBeInTheDocument();
    server.run(1_000);
    expect(within(yours).getByRole('timer')).toHaveTextContent('2');
    server.run(2_000);
    expect(within(yours).getByRole('timer')).toHaveTextContent('GO');
  });

  test('draws both full boards with their meters on one Pixi stage', async () => {
    await inMatch();
    tickPixi();
    expect(pixiApps).toHaveLength(1);
    const painted = pixiApps[0]?.painted ?? [];
    expect(painted).toHaveLength(2);
    // Both at 32 px cells in 1600×900, each with its meter, hold and preview.
    expect(painted.map(({ width }) => width)).toEqual([23 * 32, 23 * 32]);
    for (const layout of painted) {
      expect(layout.shapes.some(({ part }) => part === 'meter')).toBe(true);
      expect(layout.shapes.some(({ part }) => part === 'preview')).toBe(true);
    }
  });

  test('an FFA shows small boards for the opponents, and the players still in', async () => {
    await inMatch({
      opponents: [
        ['bo', 'Bo'],
        ['cy', 'Cy'],
        ['dan', 'שירה'],
      ],
    });
    tickPixi();
    const painted = pixiApps[0]?.painted ?? [];
    expect(painted).toHaveLength(4);
    // 1600×900 with 3 opponents: yours at 32 px cells, theirs a row of small boards at 16.
    expect(painted.map(({ width }) => width)).toEqual([23 * 32, 12 * 16, 12 * 16, 12 * 16]);
    for (const layout of painted.slice(1)) {
      expect(layout.shapes.some(({ part }) => part === 'preview')).toBe(false);
    }
    expect(screen.getByText('שירה')).toBeInTheDocument();
    expect(screen.getByText('Alive', { selector: 'dt' }).nextElementSibling).toHaveTextContent(
      '4/4',
    );
  });

  test('plays your keys into the match', async () => {
    const { server } = await inMatch();
    server.run(3_100);
    await userEvent.keyboard(' ');
    server.run(100);
    expect(server.session().getState().match?.players[0]?.engine.piecesPlaced).toBe(1);
  });

  test('starts an attack streak for each garbage routing, none with effects off', async () => {
    const { server, stores } = await inMatch();
    server.run(3_500);
    server.say({ type: 'garbageQueued', id: 1, from: 'bo', to: 'me', lines: 2, holeSeed: 4 });
    expect(pixiApps[0]?.streaks).toEqual([{ type: 'streak', from: 'bo', to: 'me', lines: 2 }]);
    act(() => stores.settings.update({ effects: 'off' }));
    server.say({ type: 'garbageQueued', id: 2, from: 'me', to: 'bo', lines: 1, holeSeed: 4 });
    expect(pixiApps[0]?.streaks).toHaveLength(1);
  });

  test('greys an opponent who is out, with their place and why', async () => {
    const { server } = await inMatch();
    server.run(4_000);
    server.say({ type: 'playerOut', playerId: 'bo', reason: 'laggedOut', frame: 50 });
    const theirs = screen.getByRole('region', { name: 'Opponent’s board' });
    expect(within(theirs).getByRole('status')).toHaveTextContent('2ND');
    expect(within(theirs).getByRole('status')).toHaveTextContent('lagged out');
  });

  test('shows "Reconnecting…" over your HUD while the connection is down', async () => {
    const { server } = await inMatch();
    server.run(3_500);
    server.drop();
    const yours = screen.getByRole('region', { name: 'Your board' });
    expect(within(yours).getByText('Reconnecting…')).toBeInTheDocument();
    expect(screen.getAllByText('Reconnecting…')).toHaveLength(1);
    // The match plays on meanwhile.
    const before = server.session().getState().match?.players[0]?.engine.frame ?? 0;
    server.run(500);
    expect(server.session().getState().match?.players[0]?.engine.frame).toBeGreaterThan(before);
  });
});

describe('the online menu (design §7.4)', () => {
  test('Esc opens it, and the match goes on under it: it doesn’t pause', async () => {
    const { server, frame } = await inMatch();
    server.run(3_500);
    await userEvent.keyboard('{Escape}');
    expect(menu()).toBeVisible();
    expect(within(menu() as HTMLElement).getByText('The match goes on')).toBeInTheDocument();
    const before = frame();
    server.run(1_000);
    expect(frame() - before).toBeGreaterThanOrEqual(59);
    expect(menu()).toBeVisible();
  });

  test('P opens it too, and losing focus', async () => {
    const { server } = await inMatch();
    server.run(3_500);
    await userEvent.keyboard('p');
    expect(menu()).toBeVisible();
    await userEvent.keyboard('{Escape}');
    expect(menu()).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(menu()).toBeVisible();
  });

  test('no key reaches the match while it is open', async () => {
    const { server } = await inMatch();
    server.run(3_500);
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard(' ');
    server.run(100);
    expect(server.session().getState().match?.players[0]?.engine.piecesPlaced).toBe(0);
  });

  test('Back to game (Esc) closes it', async () => {
    const { server } = await inMatch();
    server.run(3_500);
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');
    expect(menu()).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Enter}');
    expect(menu()).not.toBeInTheDocument();
  });

  test('Leave match (Q) in a quick-match room sends leaveRoom', async () => {
    const { server } = await inMatch({ quickMatch: true });
    server.run(3_500);
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('q');
    expect(server.sent.at(-1)).toEqual({ type: 'leaveRoom' });
  });

  test('Leave match in a room by code sends leaveMatch: you stay to watch', async () => {
    const { server } = await inMatch();
    server.run(3_500);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('menuitem', { name: /Leave match/ }));
    expect(server.sent.at(-1)).toEqual({ type: 'leaveMatch' });
    expect(menu()).not.toBeInTheDocument();
  });
});

describe('once you’re out', () => {
  test('your board greys, a banner says you’re spectating, and Esc leaves the room', async () => {
    const { server } = await inMatch();
    server.run(3_500);
    server.say({ type: 'playerOut', playerId: 'me', reason: 'left', frame: 30 });
    tickPixi();
    const yours = pixiApps[0]?.painted.at(-2);
    const colors = new Set(
      (yours?.shapes ?? [])
        .filter(({ part }) => part === 'active')
        .map(({ color }) => color.join()),
    );
    expect(colors.size).toBe(1);
    expect(screen.getByText('Spectating')).toBeInTheDocument();
    expect(screen.getByText(/You left the match/)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(menu()).not.toBeInTheDocument();
    expect(server.sent.at(-1)).toEqual({ type: 'leaveRoom' });
  });
});
