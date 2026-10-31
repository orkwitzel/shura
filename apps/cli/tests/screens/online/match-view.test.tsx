import type { OnlineMatchState, OnlinePlayerGame, OnlineSessionState } from '@shura/client-core';
import { ActionType, type Engine } from '@shura/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookOf } from '../../../src/board/look';
import { MatchView } from '../../../src/screens/online/match-view';
import { fakeClock } from '../../support/fake-clock';
import {
  fakeOnlineSession,
  freshEngine,
  lobbyRoom,
  renderScreen,
} from '../../support/fake-online-session';
import { KEYS } from '../../support/solo-app';

let unmount: (() => void) | undefined;
afterEach(() => unmount?.());

const NAMES = new Map([
  ['me', 'Ada'],
  ['bo', 'Bo'],
  ['cy', 'Cy'],
]);

/** An engine of the 1v1 settings at frame 1, with `lines` of garbage waiting in its meter. */
function engineWith(index: number, lines = 0): Engine {
  const engine = freshEngine(index);
  const actions =
    lines > 0 ? [{ frame: 1, type: ActionType.GarbageReceived, id: 1, lines, holeSeed: 5 }] : [];
  engine.step(1, actions);
  return engine;
}

function game(playerId: string, index: number, change: Partial<OnlinePlayerGame> = {}) {
  return { playerId, index, engine: engineWith(index).state, out: null, linesSent: 0, ...change };
}

function matchOf(players: OnlinePlayerGame[], change: Partial<OnlineMatchState> = {}) {
  return {
    matchId: 'm1',
    seed: 7,
    mode: '1v1',
    phase: 'playing',
    countdown: 0,
    countdownStep: 60,
    goFrame: 0,
    playerId: 'me',
    players,
    actions: [],
    result: null,
    ...change,
  } satisfies OnlineMatchState;
}

async function matchView(state: Partial<OnlineSessionState>, size = { columns: 80, rows: 24 }) {
  const session = fakeOnlineSession({ room: lobbyRoom({ phase: 'playing' }), ...state });
  const onLeave = vi.fn();
  const screen = await renderScreen(
    <MatchView
      session={session}
      look={lookOf('none')}
      ghost
      clock={fakeClock(1_000)}
      input={{ choice: 'precise' }}
      size={size}
      names={NAMES}
      active
      onLeave={onLeave}
    />,
    size,
  );
  unmount = screen.app.unmount;
  return { ...screen, session, onLeave };
}

/** The HUD column, under the name and hold: its lines joined by spaces. */
const hudOf = (frame: string) =>
  frame
    .split('\n')
    .map((line) => line.slice(0, 14).trim())
    .filter((line) => line !== '')
    .join(' ');

const meterCount = (frame: string) => [...frame].filter((c) => c === '▐').length;

describe('the garbage meter', () => {
  it('is a column of ▐ left of your well, a character a line', async () => {
    const match = matchOf([game('me', 0, { engine: engineWith(0, 6).state }), game('bo', 1)]);
    const { frame } = await matchView({ match });
    expect(meterCount(frame())).toBe(6);
    // Bottom up, against the well's left wall.
    const rows = frame()
      .split('\n')
      .filter((line) => line.includes('▐│'));
    expect(rows).toHaveLength(6);
  });

  it("is a column of ▐ left of an opponent's half-block well, a character for 2 lines", async () => {
    const match = matchOf([game('me', 0), game('bo', 1, { engine: engineWith(1, 5).state })]);
    const { frame } = await matchView({ match });
    expect(meterCount(frame())).toBe(3);
  });
});

describe('the HUD', () => {
  it('shows lines sent, pieces per second and the ping', async () => {
    const match = matchOf([game('me', 0, { linesSent: 14 }), game('bo', 1)]);
    const { frame } = await matchView({ match, ping: 38 });
    const hud = hudOf(frame());
    expect(hud).toContain('SENT 14');
    expect(hud).toContain('PPS 0.00');
    expect(hud).toContain('PING ● 38 ms');
    expect(hud).not.toContain('ALIVE');
  });

  it('in an FFA, shows the players still in', async () => {
    const match = matchOf(
      [game('me', 0), game('bo', 1, { out: { reason: 'toppedOut', frame: 1 } }), game('cy', 2)],
      { mode: 'ffa' },
    );
    const { frame } = await matchView({
      match,
      room: lobbyRoom({ mode: 'ffa', phase: 'playing' }),
    });
    expect(hudOf(frame())).toContain('ALIVE 2/3');
  });

  it('shows "Reconnecting…" while the connection is down', async () => {
    const match = matchOf([game('me', 0), game('bo', 1)]);
    const { frame } = await matchView({ match, connection: { status: 'reconnecting' } });
    expect(frame()).toContain('Reconnecting…');
  });

  it('shows the names, yours and your opponent’s', async () => {
    const { frame } = await matchView({ match: matchOf([game('me', 0), game('bo', 1)]) });
    expect(frame()).toContain('Ada');
    expect(frame()).toContain('Bo');
  });
});

describe('out boards', () => {
  it("grey an opponent's board, with their place and why", async () => {
    const match = matchOf([
      game('me', 0),
      game('bo', 1, { out: { reason: 'toppedOut', frame: 100 } }),
    ]);
    const { frame } = await matchView({ match });
    expect(frame()).toMatch(/│\s*2ND\s*│/);
    expect(frame()).toMatch(/│topped out│/);
  });

  it('grey your own board, with your place, why, and the Spectating banner', async () => {
    const match = matchOf([
      game('me', 0, { out: { reason: 'laggedOut', frame: 50 } }),
      game('bo', 1),
    ]);
    const { frame, type, session, onLeave } = await matchView({ match });
    expect(frame()).toMatch(/│\s*2ND\s*│/);
    expect(frame()).toContain('lagged out');
    expect(frame()).toContain('SPECTATING');
    await type(KEYS.escape);
    expect(session.leaveRoom).toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalled();
  });
});

describe('the countdown', () => {
  it('counts the 3 s down a second a step over your board', async () => {
    const counting = (countdown: number) =>
      matchOf([game('me', 0), game('bo', 1)], { phase: 'countdown', countdown });
    const { frame, session } = await matchView({ match: counting(180) });
    expect(frame()).toMatch(/│\s+3\s+│/);
    session.set({ match: counting(100) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(frame()).toMatch(/│\s+2\s+│/);
  });
});

describe('the online menu', () => {
  it('opens on Esc over your board, without stopping the game, and Q leaves the match', async () => {
    const match = matchOf([game('me', 0), game('bo', 1)]);
    const { frame, type, session } = await matchView({ match });
    await type(KEYS.escape);
    expect(frame()).toContain('MENU');
    expect(frame()).toContain('Back to game');
    expect(frame()).toContain('Leave match');
    await type(KEYS.letter('q'));
    expect(session.leaveMatch).toHaveBeenCalled();
    expect(session.leaveRoom).not.toHaveBeenCalled();
    expect(frame()).not.toContain('Back to game');
  });

  it('keeps game keys from the game while it is open, and Esc goes back to the game', async () => {
    const match = matchOf([game('me', 0), game('bo', 1)]);
    const { frame, type, session } = await matchView({ match });
    await type(KEYS.escape);
    session.key.mockClear();
    await type(KEYS.space);
    expect(session.key).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'press' }));
    await type(KEYS.escape);
    expect(frame()).not.toContain('Back to game');
    await type(KEYS.space);
    expect(session.key).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'hardDrop', kind: 'press' }),
    );
  });

  it('in a quick-match room, Leave match leaves the room', async () => {
    const match = matchOf([game('me', 0), game('bo', 1)]);
    const { type, session, onLeave } = await matchView({
      match,
      room: lobbyRoom({ hostId: undefined, phase: 'playing' }),
    });
    await type(KEYS.escape, KEYS.letter('q'));
    expect(session.leaveRoom).toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalled();
  });
});

describe('spectating', () => {
  it('shows every board under the banner, with no board of your own', async () => {
    const match = matchOf([game('bo', 0), game('cy', 1)], { playerId: null });
    const { frame, type, onLeave } = await matchView({ match });
    expect(frame()).toContain('SPECTATING');
    expect(frame()).toContain('you take a seat at the next lobby');
    expect(frame().match(/└─{10}┘/g)).toHaveLength(2);
    expect(frame()).not.toMatch(/└─{20}┘/);
    await type(KEYS.escape);
    expect(onLeave).toHaveBeenCalled();
  });

  it('lists the boards that do not fit', async () => {
    const players = ['bo', 'cy', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((id, at) => game(id, at));
    const match = matchOf(players, { playerId: null, mode: 'ffa' });
    const { frame } = await matchView({ match });
    expect(frame()).not.toMatch(/└─{10}┘/);
    expect(frame()).toMatch(/Bo\s+height\s+0/);
  });
});
