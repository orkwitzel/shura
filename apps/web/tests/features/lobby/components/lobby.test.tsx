import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { Lobby } from '@/features/lobby/components/lobby';
import { isolate } from '@/features/lobby/utils/room-change-text';
import { Toasts } from '@/lib/toasts';
import { fakeOnlineSession, lobby, seated, watching } from '../../../support/fake-online-session';

const LINK = 'http://shura.test/r/K7QX';

function show(room = lobby(), me = 'me') {
  const session = fakeOnlineSession({ nickname: 'Or' });
  session.welcome(me, 'Or');
  session.room(room);
  const onChangeNickname = vi.fn();
  const view = render(
    <>
      <Lobby session={session} link={LINK} onChangeNickname={onChangeNickname} />
      <Toasts />
    </>,
  );
  return { session, onChangeNickname, view };
}

const seats = () => within(screen.getByRole('list', { name: 'Seats' })).getAllByRole('listitem');
const seat = (name: string) =>
  within(screen.getByRole('list', { name: 'Seats' })).getByRole('listitem', { name });

const mira = (more = {}) => seated('mira', 1, { nickname: 'Mira', ...more });

describe('Lobby', () => {
  test('shows the room code big, its mode, and the ping', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Room K7QX' })).toBeInTheDocument();
    expect(screen.getByText('1v1')).toBeInTheDocument();
    expect(screen.getByText(/42 ms/)).toBeInTheDocument();
  });

  test('shows a seat for each of the mode’s seats, the empty ones as empty', () => {
    show(lobby({ mode: 'ffa', players: [seated('me', 0, { nickname: 'Or' }), mira()] }));
    expect(seats()).toHaveLength(8);
    expect(seats().filter((row) => row.textContent?.includes('empty'))).toHaveLength(6);
  });

  test('shows each player’s name, kind, the host’s crown, ready state and last place', () => {
    show(
      lobby({
        players: [
          seated('me', 0, { nickname: 'Or', lastPlace: 2 }),
          seated('bot', 1, { nickname: 'Bot 1', kind: 'bot', ready: true, lastPlace: 1 }),
        ],
      }),
    );
    const host = seat('Or');
    expect(within(host).getByText('you')).toBeInTheDocument();
    expect(within(host).getByText('guest')).toBeInTheDocument();
    expect(within(host).getByRole('img', { name: 'host' })).toBeInTheDocument();
    expect(within(host).getByText('last: 2nd')).toBeInTheDocument();
    const bot = seat('Bot 1');
    expect(within(bot).getByText('bot')).toBeInTheDocument();
    expect(within(bot).getByText('ready')).toBeInTheDocument();
    expect(within(bot).getByText('last: 1st')).toBeInTheDocument();
    expect(within(bot).queryByRole('img', { name: 'host' })).not.toBeInTheDocument();
  });

  test('shows the spectators, with a count', () => {
    show(lobby({ spectators: [watching('tal', { nickname: 'Tal' }), watching('noa')] }));
    const watchers = screen.getByRole('list', { name: 'Watching (2)' });
    expect(
      within(watchers)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([expect.stringContaining('Tal'), expect.stringContaining('noa')]);
  });

  describe('for the host', () => {
    test('Enter starts once another seated player is ready', async () => {
      const { session } = show(lobby({ players: [seated('me', 0), mira({ ready: true })] }));
      expect(screen.getByText('Start')).toBeInTheDocument();
      await userEvent.keyboard('{Enter}');
      expect(session.startMatch).toHaveBeenCalledOnce();
    });

    test('Enter waits, with a hint, until another player is ready', async () => {
      const { session } = show(lobby({ players: [seated('me', 0), mira()] }));
      expect(screen.getByText('Waiting for a player to get ready')).toBeInTheDocument();
      await userEvent.keyboard('{Enter}');
      expect(session.startMatch).not.toHaveBeenCalled();
      expect(session.setReady).not.toHaveBeenCalled();
    });

    test('alone, the hint waits for someone to join', () => {
      show();
      expect(screen.getByText('Waiting for a player to join')).toBeInTheDocument();
    });
  });

  describe('for a player who isn’t host', () => {
    const room = (ready: boolean) =>
      lobby({ hostId: 'mira', players: [mira(), seated('me', 0, { nickname: 'Or', ready })] });

    test('R or Enter gets ready', async () => {
      const { session } = show(room(false));
      expect(screen.queryByText('Start')).not.toBeInTheDocument();
      await userEvent.keyboard('r');
      expect(session.setReady).toHaveBeenLastCalledWith(true);
      await userEvent.keyboard('{Enter}');
      expect(session.setReady).toHaveBeenCalledTimes(2);
      expect(session.startMatch).not.toHaveBeenCalled();
    });

    test('and once ready, R stops being ready', async () => {
      const { session } = show(room(true));
      expect(within(seat('Or')).getByText('ready')).toBeInTheDocument();
      await userEvent.keyboard('r');
      expect(session.setReady).toHaveBeenLastCalledWith(false);
    });
  });

  test('S steps out to watch, and a spectator’s S takes a free seat', async () => {
    const { session, view } = show();
    await userEvent.keyboard('s');
    expect(session.spectate).toHaveBeenCalledOnce();
    view.unmount();
    const watcher = show(
      lobby({ hostId: 'mira', players: [mira()], spectators: [watching('me')] }),
    ).session;
    await userEvent.keyboard('s');
    expect(watcher.takeSeat).toHaveBeenCalledOnce();
    expect(watcher.setReady).not.toHaveBeenCalled();
  });

  test('N asks for a new nickname', async () => {
    const { onChangeNickname } = show();
    await userEvent.keyboard('n');
    expect(onChangeNickname).toHaveBeenCalledOnce();
  });

  test('Esc leaves the room', async () => {
    const { session } = show();
    await userEvent.keyboard('{Escape}');
    expect(session.leaveRoom).toHaveBeenCalledOnce();
  });

  test('Copy link puts the room’s link on the clipboard, and says so', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toBe(LINK);
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  test('shows toasts for joins, leaves and host changes', async () => {
    const { session } = show(lobby({ hostId: 'mira', players: [mira(), seated('me', 0)] }));
    session.room(
      lobby({
        hostId: 'mira',
        players: [mira(), seated('me', 0)],
        spectators: [watching('tal', { nickname: 'Tal' })],
      }),
    );
    expect(await screen.findByText(`${isolate('Tal')} joined`)).toBeInTheDocument();
    session.room(lobby({ hostId: 'me', players: [seated('me', 0)] }));
    expect(await screen.findByText(`${isolate('Mira')} left`)).toBeInTheDocument();
    expect(await screen.findByText('You are now host')).toBeInTheDocument();
  });

  test('takes no keys while told not to', async () => {
    const session = fakeOnlineSession({ nickname: 'Or' });
    session.welcome('me', 'Or');
    session.room(lobby());
    render(<Lobby session={session} link={LINK} onChangeNickname={vi.fn()} acceptKeys={false} />);
    await userEvent.keyboard('rsn{Escape}');
    expect(session.spectate).not.toHaveBeenCalled();
    expect(session.leaveRoom).not.toHaveBeenCalled();
  });

  test('keys with Ctrl, Alt or Meta keep their browser meaning', async () => {
    const { session } = show();
    await userEvent.keyboard('{Control>}r{/Control}{Meta>}s{/Meta}');
    expect(session.spectate).not.toHaveBeenCalled();
    expect(session.setReady).not.toHaveBeenCalled();
  });
});
