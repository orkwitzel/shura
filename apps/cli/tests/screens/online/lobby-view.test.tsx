import type { OnlineRoom, OnlineSessionState } from '@shura/client-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobbyView } from '../../../src/screens/online/lobby-view';
import { fakeClock } from '../../support/fake-clock';
import { fakeOnlineSession, lobbyRoom, renderScreen } from '../../support/fake-online-session';
import { settle } from '../../support/ink';
import { KEYS } from '../../support/solo-app';

let unmount: (() => void) | undefined;
afterEach(() => unmount?.());

async function lobby(room: OnlineRoom, state: Partial<OnlineSessionState> = {}) {
  const session = fakeOnlineSession({ room, ...state });
  const onLeave = vi.fn();
  const screen = await renderScreen(
    <LobbyView
      session={session}
      server="ws://localhost:8080"
      clock={fakeClock()}
      active
      onLeave={onLeave}
    />,
  );
  unmount = screen.app.unmount;
  return { ...screen, session, onLeave };
}

/** The frame's line that has `text` on it, its spaces squeezed. */
function lineWith(frame: string, text: string): string {
  return (frame.split('\n').find((line) => line.includes(text)) ?? '').replace(/\s+/g, ' ').trim();
}

describe('what it shows', () => {
  it('the code, its link as text, and the mode', async () => {
    const { frame } = await lobby(lobbyRoom({ mode: 'ffa' }));
    expect(frame()).toContain('ROOM K7QX');
    expect(frame()).toContain('FFA');
    expect(frame()).toContain('shura join K7QX');
    expect(frame()).toContain('http://localhost:8080/r/K7QX');
  });

  it('the seats with their tags, the host, ready and last place, and the empty seats', async () => {
    const room = lobbyRoom({
      mode: 'ffa',
      players: [
        { id: 'me', nickname: 'Ada', kind: 'guest', seat: 0, ready: false, lastPlace: 2 },
        { id: 'bo', nickname: 'Bo', kind: 'bot', seat: 1, ready: true, lastPlace: 1 },
        { id: 'cy', nickname: 'Cy', kind: 'guest', seat: 2, ready: false },
      ],
    });
    const { frame } = await lobby(room);
    expect(lineWith(frame(), 'Ada')).toBe('› Ada (you) guest host last 2nd');
    expect(lineWith(frame(), 'Bo')).toBe('Bo bot ready last 1st');
    expect(lineWith(frame(), 'Cy')).toBe('Cy guest not ready');
    expect(frame()).toContain('SEATS 3/8');
    expect(frame().match(/empty/g)).toHaveLength(5);
  });

  it('the spectators, with a count', async () => {
    const room = lobbyRoom({
      spectators: [
        { id: 'cy', nickname: 'Cy', kind: 'guest' },
        { id: 'di', nickname: 'Di', kind: 'bot' },
      ],
    });
    const { frame } = await lobby(room);
    expect(frame()).toContain('WATCHING (2)');
    expect(lineWith(frame(), 'WATCHING')).toContain('Cy, Di');
  });

  it("the server's errors from here on, not one from before", async () => {
    const before = { code: 'room_not_found', message: 'No room with that code.' } as const;
    const { frame, session } = await lobby(lobbyRoom(), { error: before });
    expect(frame()).not.toContain('No room with that code.');
    session.set({ error: { code: 'wrong_phase', message: 'Not now.' } });
    await settle();
    expect(frame()).toContain('Not now.');
  });

  it('the ping', async () => {
    const { frame } = await lobby(lobbyRoom(), { ping: 38.4 });
    expect(frame()).toContain('38 ms');
  });

  it('joins, leaves and host changes as they happen', async () => {
    const { frame, session } = await lobby(lobbyRoom({ hostId: 'bo' }));
    session.set({
      room: lobbyRoom({
        hostId: 'me',
        players: [
          { id: 'me', nickname: 'Ada', kind: 'guest', seat: 0, ready: false },
          { id: 'cy', nickname: 'Cy', kind: 'guest', seat: 1, ready: false },
        ],
      }),
    });
    await settle();
    expect(frame()).toContain('Cy joined.');
    expect(frame()).toContain('Bo left.');
    expect(frame()).toContain('You are now host.');
  });
});

describe("the host's keys", () => {
  it('Enter starts once another seated player is ready', async () => {
    const { type, session } = await lobby(lobbyRoom());
    await type(KEYS.enter);
    expect(session.startMatch).toHaveBeenCalled();
  });

  it("Enter says what it waits for while it can't start yet", async () => {
    const room = lobbyRoom({
      players: [
        { id: 'me', nickname: 'Ada', kind: 'guest', seat: 0, ready: false },
        { id: 'bo', nickname: 'Bo', kind: 'bot', seat: 1, ready: false },
      ],
    });
    const { frame, type, session } = await lobby(room);
    expect(frame()).toContain('Enter start (when another player is ready)');
    await type(KEYS.enter);
    expect(session.startMatch).not.toHaveBeenCalled();
  });

  it('S steps out to spectate, N changes the nickname and saves it, Esc leaves', async () => {
    const { frame, type, session, onLeave, stores } = await lobby(lobbyRoom());
    await type(KEYS.letter('s'));
    expect(session.spectate).toHaveBeenCalled();
    await type(KEYS.letter('n'));
    expect(frame()).toContain('NICKNAME');
    await type('\x7f', '\x7f', KEYS.letter('m'), KEYS.enter);
    expect(session.setNickname).toHaveBeenCalledWith('Am');
    expect(stores.settings.getState().nickname).toBe('Am');
    expect(frame()).toContain('ROOM K7QX');
    await type(KEYS.escape);
    expect(session.leaveRoom).toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalled();
  });
});

describe("a player's keys", () => {
  const room = lobbyRoom({
    hostId: 'bo',
    players: [
      { id: 'bo', nickname: 'Bo', kind: 'bot', seat: 0, ready: false },
      { id: 'me', nickname: 'Ada', kind: 'guest', seat: 1, ready: false },
    ],
  });

  it('R or Enter toggles ready', async () => {
    const { frame, type, session } = await lobby(room);
    expect(frame()).toContain('R ready');
    await type(KEYS.letter('r'));
    expect(session.setReady).toHaveBeenLastCalledWith(true);
    session.set({ room: { ...room, players: room.players.map((p) => ({ ...p, ready: true })) } });
    await settle();
    await type(KEYS.enter);
    expect(session.setReady).toHaveBeenLastCalledWith(false);
    expect(session.startMatch).not.toHaveBeenCalled();
  });

  it('S takes a free seat while spectating', async () => {
    const watching = lobbyRoom({
      hostId: 'bo',
      players: [{ id: 'bo', nickname: 'Bo', kind: 'bot', seat: 0, ready: false }],
      spectators: [{ id: 'me', nickname: 'Ada', kind: 'guest' }],
    });
    const { frame, type, session } = await lobby(watching);
    expect(frame()).toContain('S take a seat');
    await type(KEYS.letter('s'));
    expect(session.takeSeat).toHaveBeenCalled();
  });
});
