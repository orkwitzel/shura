import { ActionType, createEngine } from '@shura/engine';
import { MATCH_SETTINGS, type RoomMode, type ServerData } from '@shura/protocol';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { AppRouter } from '@/app/router';
import { fakeApi } from '../support/fake-api';
import { pixiApps, tickPixi } from '../support/fake-pixi';
import { renderWithStores } from '../support/render-with-stores';
import { type ScriptedServer, scriptedServer } from '../support/scripted-server';

const NAMED = { settings: { version: 1, nickname: 'Or' } };

beforeEach(() => {
  window.innerWidth = 1600;
  window.innerHeight = 900;
  window.devicePixelRatio = 1;
});

const player = (id: string, seat: number, nickname = id, ready = false) => ({
  id,
  nickname,
  kind: 'guest' as const,
  seat,
  ready,
});

/** A game at `index` of the match (seed 7) after a hard drop at frame 10, as a snapshot has it. */
function droppedOnce(mode: RoomMode, index: number) {
  const engine = createEngine(MATCH_SETTINGS[mode], 7, index);
  engine.step(10, [{ frame: 10, type: ActionType.HardDrop }]);
  return engine.serialize();
}

/** The app at `/r/K7QX` (a `mode` room), its session welcomed as `me` (Or) by a test's server. */
async function atRoom(mode: RoomMode) {
  const server = scriptedServer();
  const app = renderWithStores(<AppRouter />, {
    path: '/r/K7QX',
    online: server.open,
    api: fakeApi({ K7QX: mode }),
    stored: NAMED,
  });
  await server.accept();
  return { ...app, server };
}

const FFA_PLAYERS = [player('bo', 0, 'Bo'), player('cy', 1, 'Cy'), player('dan', 2, 'שירה')];

/**
 * You join K7QX mid-match: an FFA of Bo, Cy and Dan (שירה), hosted by Bo, under way for a minute.
 * The server sends the countdown again, then the snapshot of their games (design §8.6).
 */
async function joinedMidMatch() {
  const room = await atRoom('ffa');
  const { server } = room;
  server.say({
    event: 'roomState',
    data: {
      code: 'K7QX',
      mode: 'ffa',
      hostId: 'bo',
      phase: 'playing',
      players: FFA_PLAYERS,
      spectators: [{ id: 'me', nickname: 'Or', kind: 'guest' }],
    },
  });
  server.say({
    event: 'countdown',
    data: {
      startAt: -60_000,
      seed: 7,
      matchId: 'm1',
      players: FFA_PLAYERS.map(({ id }, index) => ({ id, index })),
    },
  });
  server.say({
    event: 'snapshot',
    data: {
      players: FFA_PLAYERS.map(({ id }, index) => ({
        playerId: id,
        frame: 10,
        state: droppedOnce('ffa', index),
      })),
    },
  });
  await screen.findAllByRole('region', { name: 'Player’s board' });
  await act(async () => {});
  return room;
}

/** You play K7QX's 1v1 against Bo, under way, in a room with a code unless `quickMatch`. */
async function playing({ quickMatch = false } = {}) {
  const room = await atRoom('1v1');
  const { server } = room;
  const players = [player('me', 0, 'Or', true), player('bo', 1, 'Bo', true)];
  server.say({
    event: 'roomState',
    data: {
      code: 'K7QX',
      mode: '1v1',
      ...(quickMatch ? { quickMatch: true as const } : { hostId: 'me' }),
      phase: 'countdown',
      players,
      spectators: [],
    },
  });
  server.say({
    event: 'countdown',
    data: {
      startAt: 3_000,
      seed: 7,
      matchId: 'm1',
      players: players.map(({ id }, index) => ({ id, index })),
    },
  });
  await screen.findByRole('region', { name: 'Your board' });
  await act(async () => {});
  server.run(3_500);
  return room;
}

/** The room after a 1v1 of you and Bo, back in its lobby (design §10.1). */
const lobbyAfter = (
  quickMatch: boolean,
  ready = false,
): ServerData<'roomState'> & { phase: 'lobby' } => ({
  code: 'K7QX',
  mode: '1v1',
  ...(quickMatch ? { quickMatch: true as const } : { hostId: 'me' }),
  phase: 'lobby',
  players: [
    { ...player('me', 0, 'Or', ready), lastPlace: 1 },
    { ...player('bo', 1, 'Bo'), lastPlace: 2 },
  ],
  spectators: [],
});

/** Bo tops out, the match ends with you 1st, and the room goes back to its lobby. */
function youWin(server: ScriptedServer, { quickMatch = false } = {}) {
  server.say({ event: 'playerOut', data: { playerId: 'bo', reason: 'toppedOut', frame: 40 } });
  server.say({
    event: 'matchEnd',
    data: {
      placements: [
        { playerId: 'me', place: 1 },
        { playerId: 'bo', place: 2, reason: 'toppedOut', frame: 40 },
      ],
      stats: [
        { playerId: 'me', linesSent: 4, apm: 12.5, pps: 1.25 },
        { playerId: 'bo', linesSent: 1, apm: 3, pps: 0.5 },
      ],
    },
  });
  server.say({ event: 'roomState', data: lobbyAfter(quickMatch) });
}

const results = () => screen.queryByRole('dialog', { name: /place|Results/ });

describe('spectating a match you joined part-way (design §13.2, Spectating)', () => {
  test('shows every board the same size, with no board of your own, from the snapshot', async () => {
    await joinedMidMatch();
    expect(screen.queryByRole('region', { name: 'Your board' })).not.toBeInTheDocument();
    const boards = screen.getAllByRole('region', { name: 'Player’s board' });
    expect(boards.map((board) => board.textContent)).toEqual(['Bo', 'Cy', 'שירה']);
    tickPixi();
    const painted = pixiApps[0]?.painted ?? [];
    // 3 small boards in one row at 32 px cells, under the banner.
    expect(painted.map(({ width }) => width)).toEqual([12 * 32, 12 * 32, 12 * 32]);
    // Each from the snapshot: its first piece already locked.
    for (const layout of painted) {
      expect(layout.shapes.some(({ part }) => part === 'locked')).toBe(true);
    }
  });

  test('says you take a seat at the next lobby, and Esc leaves the room', async () => {
    const { server, location } = await joinedMidMatch();
    const banner = screen.getByText('Spectating').closest('[role="status"]') as HTMLElement;
    expect(banner).toHaveTextContent('you take a seat at the next lobby');
    await userEvent.keyboard('{Escape}');
    expect(server.sent.at(-1)).toEqual({ event: 'leaveRoom', data: {} });
    expect(location()).toBe('/online');
  });

  test('plays the players’ relays on their boards', async () => {
    const { server } = await joinedMidMatch();
    server.say({
      event: 'relay',
      data: {
        playerId: 'cy',
        frames: [{ frame: 20, actions: [{ frame: 20, type: ActionType.HardDrop }] }],
      },
    });
    server.run(16);
    expect(server.session().getState().match?.players[1]?.engine.piecesPlaced).toBe(2);
  });

  test('shows the results once the match ends, with no place of your own, then the lobby', async () => {
    const { server } = await joinedMidMatch();
    server.say({
      event: 'matchEnd',
      data: {
        placements: [
          { playerId: 'cy', place: 1 },
          { playerId: 'bo', place: 2, reason: 'toppedOut', frame: 900 },
          { playerId: 'dan', place: 2, reason: 'laggedOut', frame: 900 },
        ],
        stats: FFA_PLAYERS.map(({ id }) => ({ playerId: id, linesSent: 3, apm: 5, pps: 1 })),
      },
    });
    // The room goes back to its lobby at once, and you take the free seat.
    server.say({
      event: 'roomState',
      data: {
        code: 'K7QX',
        mode: 'ffa',
        hostId: 'bo',
        phase: 'lobby',
        players: [...FFA_PLAYERS, player('me', 3, 'Or')],
        spectators: [],
      },
    });
    const dialog = await screen.findByRole('dialog', { name: 'Results' });
    expect(dialog).toHaveTextContent('Cy won');
    expect(
      within(dialog)
        .getAllByRole('row')
        .map((row) => row.firstChild?.textContent),
    ).toEqual(['#', '1', '2', '2']);
    expect(screen.queryByText('you take a seat at the next lobby')).not.toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(results()).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Copy link/ })).toBeInTheDocument();
  });
});

describe('the results (design §13.2, Results)', () => {
  test('show over the match once it ends, then Enter goes back to the lobby', async () => {
    const { server } = await playing();
    youWin(server);
    const dialog = await screen.findByRole('dialog', { name: '1st place' });
    // Over the boards, which stay.
    expect(screen.getByRole('region', { name: 'Your board' })).toBeInTheDocument();
    const rows = within(dialog).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Or');
    expect(rows[1]).toHaveAttribute('data-you');
    expect(rows[2]).toHaveTextContent('Bo');
    // Each player's kind, from the room, as the lobby tags them.
    expect(within(rows[1] as HTMLElement).getByText('guest')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('guest')).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(results()).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your board' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Copy link/ })).toBeInTheDocument();
  });

  test('a match the host starts before you’re done with them replaces them', async () => {
    const { server } = await playing();
    youWin(server);
    await screen.findByRole('dialog', { name: '1st place' });
    server.say({
      event: 'roomState',
      data: { ...lobbyAfter(false), phase: 'countdown' },
    });
    server.say({
      event: 'countdown',
      data: {
        startAt: 20_000,
        seed: 8,
        matchId: 'm2',
        players: [
          { id: 'me', index: 0 },
          { id: 'bo', index: 1 },
        ],
      },
    });
    await screen.findByRole('timer', { name: 'Countdown' });
    expect(results()).not.toBeInTheDocument();
  });

  test('in a quick-match room, Enter asks for a rematch and Esc leaves', async () => {
    const { server } = await playing({ quickMatch: true });
    youWin(server, { quickMatch: true });
    await screen.findByRole('dialog', { name: '1st place' });
    await userEvent.keyboard('{Enter}');
    expect(server.sent.at(-1)).toEqual({ event: 'rematch', data: {} });
    // The server marks you ready for the rematch (design §9.4).
    server.say({ event: 'roomState', data: lobbyAfter(true, true) });
    expect(await screen.findByRole('menuitem', { name: 'Waiting for Bo…' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(server.sent.at(-1)).toEqual({ event: 'leaveRoom', data: {} });
  });

  test('a quick-match rematch starts the next match from the results', async () => {
    const { server } = await playing({ quickMatch: true });
    youWin(server, { quickMatch: true });
    await screen.findByRole('dialog', { name: '1st place' });
    await userEvent.keyboard('{Enter}');
    // As the game service sends them: the countdown, then the room counting down.
    server.say({
      event: 'countdown',
      data: {
        startAt: 20_000,
        seed: 8,
        matchId: 'm2',
        players: [
          { id: 'me', index: 0 },
          { id: 'bo', index: 1 },
        ],
      },
    });
    server.say({ event: 'roomState', data: { ...lobbyAfter(true), phase: 'countdown' } });
    await screen.findByRole('timer', { name: 'Countdown' });
    expect(results()).not.toBeInTheDocument();
  });
});

describe('a quick-match opponent who leaves mid-match (design §9.4)', () => {
  test('the results still show, with only Leave, then "Opponent left" at /online', async () => {
    const { server, location } = await playing({ quickMatch: true });
    const sentBefore = server.sent.length;
    // As the game service sends them: the match ends with Bo out as `left`, then the room breaks up.
    server.say({
      event: 'matchEnd',
      data: {
        placements: [
          { playerId: 'me', place: 1 },
          { playerId: 'bo', place: 2, reason: 'left', frame: 40 },
        ],
        stats: [
          { playerId: 'me', linesSent: 4, apm: 12.5, pps: 1.25 },
          { playerId: 'bo', linesSent: 1, apm: 3, pps: 0.5 },
        ],
      },
    });
    server.say({ event: 'opponentLeft', data: {} });
    const dialog = await screen.findByRole('dialog', { name: '1st place' });
    expect(dialog).toHaveTextContent('Opponent left.');
    expect(within(dialog).queryByRole('menuitem', { name: /Rematch/ })).not.toBeInTheDocument();
    expect(location()).toBe('/r/K7QX');

    await userEvent.keyboard('{Enter}');
    expect(location()).toBe('/online');
    expect(await screen.findByRole('heading', { name: 'Opponent left' })).toBeInTheDocument();
    // Nothing was asked of the server meanwhile: no join of the room gone, no rematch.
    expect(
      server.sent
        .slice(sentBefore)
        .filter(({ event }) => event !== 'inputBatch' && event !== 'ping'),
    ).toEqual([]);
  });
});

describe('"Reconnecting…" (design §13.2), once and never over the spectating banner', () => {
  test('a spectator sees it in the spectating banner', async () => {
    const { server } = await joinedMidMatch();
    server.drop();
    expect(screen.getAllByText('Reconnecting…')).toHaveLength(1);
    const banner = screen.getByText('Spectating').closest('[role="status"]') as HTMLElement;
    expect(within(banner).getByText('Reconnecting…')).toBeInTheDocument();
  });

  test('a player at the results sees it once, over the HUD', async () => {
    const { server } = await playing();
    youWin(server);
    await screen.findByRole('dialog', { name: '1st place' });
    server.drop();
    expect(screen.getAllByText('Reconnecting…')).toHaveLength(1);
    const yours = screen.getByRole('region', { name: 'Your board' });
    expect(within(yours).getByText('Reconnecting…')).toBeInTheDocument();
  });

  test('a spectator at the results sees it once, across the top', async () => {
    const { server } = await joinedMidMatch();
    server.say({
      event: 'matchEnd',
      data: {
        placements: FFA_PLAYERS.map(({ id }, at) => ({ playerId: id, place: at + 1 })),
        stats: FFA_PLAYERS.map(({ id }) => ({ playerId: id, linesSent: 3, apm: 5, pps: 1 })),
      },
    });
    await screen.findByRole('dialog', { name: 'Results' });
    server.drop();
    expect(screen.getAllByText('Reconnecting…')).toHaveLength(1);
  });
});

describe('coming back after a lag-out (design §10.2)', () => {
  test('says "You lagged out" and drops you into spectating, your board greyed', async () => {
    const { server } = await playing();
    server.drop();
    server.run(4_000);
    await server.accept();
    server.say({ event: 'playerOut', data: { playerId: 'me', reason: 'laggedOut', frame: 40 } });
    server.say({
      event: 'snapshot',
      data: {
        players: [
          { playerId: 'me', frame: 40, state: droppedOnce('1v1', 0) },
          { playerId: 'bo', frame: 40, state: droppedOnce('1v1', 1) },
        ],
      },
    });
    expect(screen.getByText('Spectating')).toBeInTheDocument();
    expect(screen.getByText('You lagged out · watching the rest')).toBeInTheDocument();
    const yours = screen.getByRole('region', { name: 'Your board' });
    expect(within(yours).getByText('lagged out')).toBeInTheDocument();
    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
  });
});
