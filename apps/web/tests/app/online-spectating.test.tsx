import { ActionType, createEngine, FFA, ONE_VS_ONE } from '@shura/engine';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { AppRouter } from '@/app/router';
import { pixiApps, tickPixi } from '../support/fake-pixi';
import { renderWithStores } from '../support/render-with-stores';
import { type ScriptedServer, scriptedServer } from '../support/scripted-server';

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
  ready: false,
});

/** A game at `index` of the match (seed 7) after a hard drop at frame 10, as a snapshot has it. */
function droppedOnce(mode: 'ffa' | '1v1', index: number) {
  const engine = createEngine(mode === 'ffa' ? FFA : ONE_VS_ONE, 7, index);
  engine.step(10, [{ frame: 10, type: ActionType.HardDrop }]);
  return engine.state;
}

/** The app at `/r/K7QX`, its session welcomed as `me` (Or) by a server the test plays. */
function atRoom() {
  const server = scriptedServer();
  const app = renderWithStores(<AppRouter />, {
    path: '/r/K7QX',
    online: server.open,
    stored: NAMED,
  });
  server.accept();
  return { ...app, server };
}

const FFA_PLAYERS = [player('bo', 0, 'Bo'), player('cy', 1, 'Cy'), player('dan', 2, 'שירה')];

/**
 * You join K7QX mid-match: an FFA of Bo, Cy and Dan (שירה), hosted by Bo, under way for a while.
 * The server sends the countdown, then the snapshot of their games.
 */
async function joinedMidMatch() {
  const room = atRoom();
  const { server } = room;
  server.say({
    type: 'roomState',
    code: 'K7QX',
    mode: 'ffa',
    hostId: 'bo',
    phase: 'playing',
    players: FFA_PLAYERS,
    spectators: [{ id: 'me', nickname: 'Or', kind: 'guest' }],
  });
  server.say({
    type: 'countdown',
    startAt: -60_000,
    seed: 7,
    matchId: 'm1',
    players: FFA_PLAYERS.map(({ id }, index) => ({ id, index })),
  });
  server.say({
    type: 'snapshot',
    players: FFA_PLAYERS.map(({ id }, index) => ({
      playerId: id,
      frame: 10,
      state: droppedOnce('ffa', index),
    })),
  });
  await screen.findAllByRole('region', { name: 'Player’s board' });
  await act(async () => {});
  return room;
}

/** You play K7QX's match against `opponents` (a 1v1 against Bo by default), under way. */
async function playing({ quickMatch = false } = {}) {
  const room = atRoom();
  const { server } = room;
  const players = [player('me', 0, 'Or'), player('bo', 1, 'Bo')];
  server.say({
    type: 'roomState',
    code: 'K7QX',
    mode: '1v1',
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
  await screen.findByRole('region', { name: 'Your board' });
  await act(async () => {});
  server.run(3_500);
  return room;
}

/** Bo tops out, the match ends with you 1st, and the room goes back to its lobby. */
function youWin(server: ScriptedServer, { quickMatch = false } = {}) {
  server.say({ type: 'playerOut', playerId: 'bo', reason: 'toppedOut', frame: 40 });
  server.say({
    type: 'matchEnd',
    placements: [
      { playerId: 'me', place: 1 },
      { playerId: 'bo', place: 2, reason: 'toppedOut', frame: 40 },
    ],
    stats: [
      { playerId: 'me', linesSent: 4, apm: 12.5, pps: 1.25 },
      { playerId: 'bo', linesSent: 1, apm: 3, pps: 0.5 },
    ],
  });
  server.say({
    type: 'roomState',
    code: 'K7QX',
    mode: '1v1',
    ...(!quickMatch && { hostId: 'me' }),
    phase: 'lobby',
    players: [
      { ...player('me', 0, 'Or'), lastPlace: 1 },
      { ...player('bo', 1, 'Bo'), lastPlace: 2 },
    ],
    spectators: [],
  });
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
    // 3 small boards in a row at 32 px cells, under the banner.
    expect(painted.map(({ width }) => width)).toEqual([12 * 32, 12 * 32, 12 * 32]);
    // Each from the snapshot: its first piece already locked.
    for (const layout of painted) {
      expect(layout.shapes.some(({ part }) => part === 'locked')).toBe(true);
    }
  });

  test('says you take a seat at the next lobby, and Esc leaves the room', async () => {
    const { server } = await joinedMidMatch();
    const banner = screen.getByRole('status', { name: '' });
    expect(banner).toHaveTextContent('Spectating');
    expect(banner).toHaveTextContent('you take a seat at the next lobby');
    await userEvent.keyboard('{Escape}');
    expect(server.sent.at(-1)).toEqual({ type: 'leaveRoom' });
  });

  test('plays the players’ relays on their boards', async () => {
    const { server } = await joinedMidMatch();
    server.say({
      type: 'relay',
      playerId: 'cy',
      frames: [{ frame: 20, actions: [{ frame: 20, type: 'hardDrop' }] }],
    });
    expect(server.session().getState().match?.players[1]?.engine.piecesPlaced).toBe(2);
  });

  test('shows the results once the match ends, with no place of your own, then the lobby', async () => {
    const { server } = await joinedMidMatch();
    server.say({
      type: 'matchEnd',
      placements: [
        { playerId: 'cy', place: 1 },
        { playerId: 'bo', place: 2, reason: 'toppedOut', frame: 900 },
        { playerId: 'dan', place: 2, reason: 'laggedOut', frame: 900 },
      ],
      stats: FFA_PLAYERS.map(({ id }) => ({ playerId: id, linesSent: 3, apm: 5, pps: 1 })),
    });
    server.say({
      type: 'roomState',
      code: 'K7QX',
      mode: 'ffa',
      hostId: 'bo',
      phase: 'lobby',
      players: [...FFA_PLAYERS, player('me', 3, 'Or')],
      spectators: [],
    });
    const dialog = await screen.findByRole('dialog', { name: 'Results' });
    expect(within(dialog).getByText(/Cy won/)).toBeInTheDocument();
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
    await userEvent.keyboard('{Enter}');
    expect(results()).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your board' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Copy link/ })).toBeInTheDocument();
  });

  test('in a quick-match room, Enter asks for a rematch and Esc leaves', async () => {
    const { server } = await playing({ quickMatch: true });
    youWin(server, { quickMatch: true });
    await screen.findByRole('dialog', { name: '1st place' });
    await userEvent.keyboard('{Enter}');
    expect(server.sent.at(-1)).toEqual({ type: 'rematch' });
    expect(screen.getByRole('menuitem', { name: 'Waiting for Bo…' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(server.sent.at(-1)).toEqual({ type: 'leaveRoom' });
  });

  test('a quick-match rematch starts the next match from the results', async () => {
    const { server } = await playing({ quickMatch: true });
    youWin(server, { quickMatch: true });
    await screen.findByRole('dialog', { name: '1st place' });
    await userEvent.keyboard('{Enter}');
    // As the game service sends them: the countdown, then the room counting down.
    server.say({
      type: 'countdown',
      startAt: 20_000,
      seed: 8,
      matchId: 'm2',
      players: [
        { id: 'me', index: 0 },
        { id: 'bo', index: 1 },
      ],
    });
    server.say({
      type: 'roomState',
      code: 'K7QX',
      mode: '1v1',
      phase: 'countdown',
      players: [player('me', 0, 'Or'), player('bo', 1, 'Bo')],
      spectators: [],
    });
    await screen.findByRole('timer', { name: 'Countdown' });
    expect(results()).not.toBeInTheDocument();
  });
});

describe('coming back after a lag-out (design §10.2)', () => {
  test('says "You lagged out" and drops you into spectating, your board greyed', async () => {
    const { server } = await playing();
    server.drop();
    server.run(4_000);
    server.accept();
    server.say({ type: 'playerOut', playerId: 'me', reason: 'laggedOut', frame: 40 });
    server.say({
      type: 'snapshot',
      players: [
        { playerId: 'me', frame: 40, state: droppedOnce('1v1', 0) },
        { playerId: 'bo', frame: 40, state: droppedOnce('1v1', 1) },
      ],
    });
    expect(screen.getByText('Spectating')).toBeInTheDocument();
    expect(screen.getByText('You lagged out · watching the rest')).toBeInTheDocument();
    const yours = screen.getByRole('region', { name: 'Your board' });
    expect(within(yours).getByText('lagged out')).toBeInTheDocument();
    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
  });
});
