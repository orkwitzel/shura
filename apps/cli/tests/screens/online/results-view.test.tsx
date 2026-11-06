import type { OnlineMatchState, OnlineRoom, OnlineSessionState } from '@shura/client-core';
import type { ServerData } from '@shura/protocol';
import stringWidth from 'string-width';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultsView } from '../../../src/screens/online/results-view';
import { fakeClock } from '../../support/fake-clock';
import {
  fakeOnlineSession,
  freshEngine,
  lobbyRoom,
  matchState,
  renderScreen,
} from '../../support/fake-online-session';
import { settle } from '../../support/ink';
import { KEYS } from '../../support/solo-app';

let unmount: (() => void) | undefined;
afterEach(() => unmount?.());

const NAMES = new Map([
  ['me', 'Ada'],
  ['bo', 'Mira'],
  ['cy', 'Cy'],
]);

const RESULT: ServerData<'matchEnd'> = {
  placements: [
    { playerId: 'bo', place: 1 },
    { playerId: 'me', place: 2, reason: 'toppedOut', frame: 900 },
    { playerId: 'cy', place: 3, reason: 'left', frame: 400 },
  ],
  stats: [
    { playerId: 'bo', linesSent: 41, apm: 14.7, pps: 2.21 },
    { playerId: 'me', linesSent: 38, apm: 13.62, pps: 2.04 },
    { playerId: 'cy', linesSent: 4, apm: 2.9, pps: 0.97 },
  ],
};

function ended(playerId: string | null = 'me'): OnlineMatchState {
  return matchState({
    matchId: 'm1',
    seed: 7,
    mode: 'ffa',
    phase: 'ended',
    countdown: 0,
    playerId,
    players: ['bo', 'me', 'cy'].map((id, index) => ({
      playerId: id,
      index,
      engine: freshEngine(index).state,
      out: null,
      linesSent: 0,
    })),
    result: RESULT,
  });
}

async function results(
  state: Partial<OnlineSessionState> = {},
  room: OnlineRoom | null = lobbyRoom({ mode: 'ffa' }),
) {
  const session = fakeOnlineSession({ match: ended(), room, ...state });
  const clock = fakeClock(1_000);
  const onBack = vi.fn();
  const onLeave = vi.fn();
  const screen = await renderScreen(
    <ResultsView
      session={session}
      names={NAMES}
      clock={clock}
      active
      onBack={onBack}
      onLeave={onLeave}
    />,
  );
  unmount = screen.app.unmount;
  return { ...screen, session, clock, onBack, onLeave };
}

const squeezed = (frame: string, text: string) =>
  (frame.split('\n').find((line) => line.includes(text)) ?? '').replace(/\s+/g, ' ').trim();

describe('in a room with a code', () => {
  it('shows your place, then every place with lines sent, APM and PPS, your row marked', async () => {
    const { frame } = await results();
    expect(frame()).toContain('2ND PLACE');
    expect(frame()).toContain('Mira won');
    expect(squeezed(frame(), 'PLAYER')).toBe('# PLAYER SENT APM PPS');
    expect(squeezed(frame(), '14.7')).toBe('1 Mira 41 14.7 2.21');
    expect(squeezed(frame(), 'Ada')).toBe('› 2 Ada (you) 38 13.6 2.04');
    expect(squeezed(frame(), 'Cy')).toBe('3 Cy 4 2.9 0.97');
  });

  it('goes back to the lobby on Enter', async () => {
    const { type, onBack } = await results();
    expect((await results()).frame()).toContain('Enter back to lobby');
    await type(KEYS.enter);
    expect(onBack).toHaveBeenCalled();
  });

  it('goes back to the lobby on its own after 10 s', async () => {
    const { clock, onBack, frame } = await results();
    clock.run(9_000, 500);
    await settle();
    expect(frame()).toContain('(1 s)');
    expect(onBack).not.toHaveBeenCalled();
    clock.run(1_000, 500);
    await settle();
    await settle();
    expect(onBack).toHaveBeenCalled();
  });

  it('keeps the columns in line for wide and combining nicknames (L1)', async () => {
    const names = new Map([
      ['me', 'Ada'],
      ['bo', '日本語の名前です日本語の名前'],
      ['cy', 'שָׁלוֹם'],
    ]);
    const session = fakeOnlineSession({ match: ended(), room: lobbyRoom({ mode: 'ffa' }) });
    const screen = await renderScreen(
      <ResultsView
        session={session}
        names={names}
        clock={fakeClock(1_000)}
        active
        onBack={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    unmount = screen.app.unmount;
    const rows = screen
      .frame()
      .split('\n')
      .filter((line) => /\d\.\d\d\s*$/.test(line));
    expect(rows).toHaveLength(3);
    // Every row ends its PPS column at the same terminal column.
    const ends = rows.map((line) => stringWidth(line.trimEnd()));
    expect(new Set(ends).size).toBe(1);
  });

  it('says "RESULTS" to someone who watched', async () => {
    const { frame } = await results({ match: ended(null), sessionId: 'di' });
    expect(frame()).toContain('RESULTS');
    expect(frame()).not.toContain('(you)');
  });
});

describe('in a quick-match room', () => {
  const room = lobbyRoom({ hostId: undefined, quickMatch: true });

  it('offers Rematch (Enter) and Leave (Esc), and never goes back on its own', async () => {
    const { frame, type, session, clock, onBack } = await results({}, room);
    expect(frame()).toContain('Enter rematch');
    expect(frame()).toContain('Esc leave');
    clock.run(11_000, 500);
    await settle();
    expect(onBack).not.toHaveBeenCalled();
    await type(KEYS.enter);
    expect(session.rematch).toHaveBeenCalled();
    // The server marks you ready for the rematch (design §9.4).
    session.set({
      room: {
        ...room,
        players: room.players.map((player) => ({ ...player, ready: player.id === 'me' })),
      },
    });
    await settle();
    expect(frame()).toContain('Waiting for Mira');
  });

  it('still waits for the opponent when the rematch was asked before (a reconnect)', async () => {
    const asked = {
      ...room,
      players: room.players.map((player) => ({ ...player, ready: player.id === 'me' })),
    };
    const { frame } = await results({}, asked);
    expect(frame()).toContain('Waiting for Mira');
  });

  it('Esc leaves the room', async () => {
    const { type, session, onLeave } = await results({}, room);
    await type(KEYS.escape);
    expect(session.leaveRoom).toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalled();
  });

  it('says so once the opponent has left, and Enter goes on', async () => {
    const { frame, type, onBack } = await results({ quickMatch: 'opponentLeft' }, null);
    expect(frame()).toContain('Opponent left');
    await type(KEYS.enter);
    expect(onBack).toHaveBeenCalled();
  });
});
