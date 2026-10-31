import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { AppRouter } from '@/app/router';
import { Toasts } from '@/lib/toasts';
import { fakeOnline, lobby, seated, watching } from '../support/fake-online-session';
import { renderWithStores } from '../support/render-with-stores';

const NAMED = { settings: { version: 1, nickname: 'Or' } };

/** The app at `path`, with a nickname already set unless `named` is false. */
function onlineApp(path = '/online', { named = true } = {}) {
  const online = fakeOnline();
  const app = renderWithStores(
    <>
      <AppRouter />
      <Toasts />
    </>,
    { path, online: online.open, ...(named && { stored: NAMED }) },
  );
  return { ...app, online };
}

const playOnline = () => screen.getByRole('menu', { name: 'Play online' });

describe('Play online, from the main menu', () => {
  test('is enabled, and opens /online', async () => {
    const app = onlineApp('/');
    const item = screen.getByRole('menuitem', { name: 'Play online' });
    expect(item).toBeEnabled();
    await userEvent.click(item);
    expect(app.location()).toBe('/online');
  });
});

describe('the nickname prompt', () => {
  test('comes first when there’s no nickname, prefilled with a suggestion', async () => {
    const { online } = onlineApp('/online', { named: false });
    const field = screen.getByRole('textbox', { name: 'Nickname' });
    expect((field as HTMLInputElement).value).toMatch(/^Player\d{4}$/);
    // No session until there's a name to say hello with.
    expect(online.sessions).toHaveLength(0);
  });

  test('saves the name to the settings, and opens the session with it', async () => {
    const { online, stores, storage } = onlineApp('/online', { named: false });
    const field = screen.getByRole('textbox', { name: 'Nickname' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Mira{Enter}');
    expect(stores.settings.getState().nickname).toBe('Mira');
    expect(JSON.parse(storage.read('settings') ?? '{}')).toMatchObject({ nickname: 'Mira' });
    expect(online.session().options.nickname).toBe('Mira');
    expect(screen.queryByRole('textbox', { name: 'Nickname' })).not.toBeInTheDocument();
  });

  test('Esc goes back to the main menu', async () => {
    const app = onlineApp('/online', { named: false });
    await userEvent.keyboard('{Escape}');
    expect(app.location()).toBe('/');
  });

  test('isn’t asked again once there’s a nickname', () => {
    const { online } = onlineApp();
    expect(screen.queryByRole('textbox', { name: 'Nickname' })).not.toBeInTheDocument();
    expect(online.session().options.nickname).toBe('Or');
  });
});

describe('the connection', () => {
  test('shows Connecting… until welcomed, then the Play online menu', () => {
    const { online } = onlineApp();
    expect(screen.getByRole('status')).toHaveTextContent('Connecting…');
    online.session().welcome();
    expect(playOnline()).toBeInTheDocument();
  });

  test('Can’t reach the server, with Retry, which opens a new session', async () => {
    const { online } = onlineApp();
    online.session().fail('unreachable', "Can't reach the server.");
    expect(screen.getByRole('heading', { name: 'Can’t reach the server' })).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(online.sessions).toHaveLength(2);
    expect(online.sessions[0]?.close).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Connecting…');
  });

  test('a version mismatch says a new version is out, and Enter reloads', async () => {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    const { online } = onlineApp();
    online.session().fail('version_mismatch');
    expect(
      screen.getByRole('heading', { name: 'A new version of Shura is out' }),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(reload).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  test('shows Reconnecting… while the connection is down, over the screen it was on', () => {
    const { online } = onlineApp();
    online.session().welcome();
    online.session().set({ connection: { status: 'reconnecting' } });
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…');
    expect(playOnline()).toBeInTheDocument();
  });

  test('going back to the main menu closes the session, and forgets its token', async () => {
    const app = onlineApp();
    const session = app.online.session();
    session.welcome('me', 'Or', 'secret');
    expect(sessionStorage.getItem('shura.sessionToken')).toBe('secret');
    await userEvent.keyboard('{Escape}');
    expect(app.location()).toBe('/');
    expect(session.close).toHaveBeenCalled();
    expect(sessionStorage.getItem('shura.sessionToken')).toBeNull();
  });

  test('a reload comes back with the token kept in sessionStorage', () => {
    sessionStorage.setItem('shura.sessionToken', 'kept');
    const { online } = onlineApp('/r/K7QX');
    expect(online.session().options.sessionToken).toBe('kept');
  });

  test('one session serves /online and the rooms', async () => {
    const app = onlineApp();
    app.online.session().welcome();
    app.online.session().room(lobby());
    expect(app.location()).toBe('/r/K7QX');
    await userEvent.keyboard('{Escape}');
    expect(app.location()).toBe('/online');
    expect(app.online.sessions).toHaveLength(1);
  });
});

describe('the Play online menu', () => {
  test('Create room, then FFA, creates an FFA room and goes to it as it comes', async () => {
    const app = onlineApp();
    const session = app.online.session();
    session.welcome();
    await userEvent.keyboard('{ArrowDown}{Enter}{ArrowDown}{Enter}');
    expect(session.createRoom).toHaveBeenCalledWith('ffa');
    session.room(lobby({ mode: 'ffa' }));
    expect(app.location()).toBe('/r/K7QX');
    expect(screen.getByRole('heading', { name: 'Room K7QX' })).toBeInTheDocument();
  });

  test('Join room joins the code typed', async () => {
    const { online } = onlineApp();
    online.session().welcome();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}k7qx{Enter}');
    expect(online.session().joinRoom).toHaveBeenCalledWith('K7QX');
  });

  test('an unknown code says so, and stays on /online', async () => {
    const app = onlineApp();
    app.online.session().welcome();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}k7qx{Enter}');
    app.online.session().error('room_not_found', 'No such room.');
    expect(await screen.findByText('No room with that code')).toBeInTheDocument();
    expect(app.location()).toBe('/online');
  });

  test('Quick match waits, with the time waited, and Esc cancels', async () => {
    const { online } = onlineApp();
    const session = online.session();
    session.welcome();
    await userEvent.keyboard('{Enter}');
    expect(session.quickMatch).toHaveBeenCalledOnce();
    expect(screen.getByRole('timer', { name: 'Time waited' })).toHaveTextContent('0:00');
    await userEvent.keyboard('{Escape}');
    expect(session.cancelQuickMatch).toHaveBeenCalledOnce();
    expect(playOnline()).toBeInTheDocument();
  });

  test('a quick match found goes to its room; when the opponent leaves, back to Opponent left', async () => {
    const app = onlineApp();
    const session = app.online.session();
    session.welcome();
    await userEvent.keyboard('{Enter}');
    session.room(lobby({ hostId: undefined, players: [seated('me', 0), seated('mira', 1)] }));
    expect(app.location()).toBe('/r/K7QX');
    session.set({ room: null, quickMatch: 'opponentLeft' });
    expect(app.location()).toBe('/online');
    expect(screen.getByRole('heading', { name: 'Opponent left' })).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(session.quickMatch).toHaveBeenCalledTimes(2);
  });

  test('Back (Esc) returns to the main menu', async () => {
    const app = onlineApp();
    app.online.session().welcome();
    await userEvent.keyboard('{Escape}');
    expect(app.location()).toBe('/');
  });
});

describe('a room’s link, /r/:code', () => {
  test('joins the room once connected, after the nickname prompt if needed', async () => {
    const { online } = onlineApp('/r/K7QX', { named: false });
    await userEvent.type(screen.getByRole('textbox', { name: 'Nickname' }), '{Enter}');
    const session = online.session();
    expect(session.joinRoom).not.toHaveBeenCalled();
    session.welcome();
    expect(session.joinRoom).toHaveBeenCalledExactlyOnceWith('K7QX');
    expect(screen.getByRole('status')).toHaveTextContent('Joining room K7QX…');
    session.room(lobby({ hostId: 'mira', players: [seated('mira', 0), seated('me', 1)] }));
    expect(screen.getByRole('heading', { name: 'Room K7QX' })).toBeInTheDocument();
  });

  test('an unknown code says "No room with that code" and goes to /online', async () => {
    const app = onlineApp('/r/ZZZZ');
    app.online.session().welcome();
    app.online.session().error('room_not_found', 'No such room.');
    expect(await screen.findByText('No room with that code')).toBeInTheDocument();
    expect(app.location()).toBe('/online');
    expect(playOnline()).toBeInTheDocument();
  });

  test('a code that can’t be one goes to /online at once', async () => {
    const app = onlineApp('/r/0000');
    app.online.session().welcome();
    expect(app.online.session().joinRoom).not.toHaveBeenCalled();
    expect(await screen.findByText('No room with that code')).toBeInTheDocument();
    expect(app.location()).toBe('/online');
  });

  test('a lowercase code is the same room', () => {
    const app = onlineApp('/r/k7qx');
    app.online.session().welcome();
    expect(app.online.session().joinRoom).toHaveBeenCalledWith('K7QX');
    expect(app.location()).toBe('/r/K7QX');
  });

  test('a session restored into its room (a reload) isn’t told it’s already in one', async () => {
    const app = onlineApp('/r/K7QX');
    const session = app.online.session();
    session.welcome();
    session.error('wrong_phase', 'Leave your room first.');
    session.room(lobby());
    expect(screen.getByRole('heading', { name: 'Room K7QX' })).toBeInTheDocument();
    expect(screen.queryByText('Leave your room first.')).not.toBeInTheDocument();
  });

  test('…nor when its room came back before the server’s answer to the join', async () => {
    const app = onlineApp('/r/K7QX');
    const session = app.online.session();
    session.welcome();
    session.room(lobby());
    session.error('wrong_phase', 'Leave your room first.');
    await new Promise((done) => setTimeout(done, 50));
    expect(screen.queryByText('Leave your room first.')).not.toBeInTheDocument();
  });

  test('another room’s link opened by a session restored into its old room goes to the link’s', () => {
    const app = onlineApp('/r/ABCD');
    const session = app.online.session();
    session.welcome();
    expect(session.joinRoom).toHaveBeenLastCalledWith('ABCD');
    session.room(lobby({ code: 'K7QX' }));
    expect(session.leaveRoom).toHaveBeenCalledOnce();
    expect(session.joinRoom).toHaveBeenCalledTimes(2);
    expect(session.joinRoom).toHaveBeenLastCalledWith('ABCD');
    expect(app.location()).toBe('/r/ABCD');
  });

  test('going Back from a room leaves it', async () => {
    const app = onlineApp();
    const session = app.online.session();
    session.welcome();
    session.room(lobby());
    act(() => app.navigate('/online'));
    expect(session.leaveRoom).toHaveBeenCalledOnce();
    expect(playOnline()).toBeInTheDocument();
  });
});

describe('the lobby, in the app', () => {
  test('Esc leaves the room for /online', async () => {
    const app = onlineApp();
    const session = app.online.session();
    session.welcome();
    session.room(lobby());
    await userEvent.keyboard('{Escape}');
    expect(session.leaveRoom).toHaveBeenCalledOnce();
    expect(app.location()).toBe('/online');
  });

  test('N changes the nickname, in the room and in the settings', async () => {
    const app = onlineApp();
    const session = app.online.session();
    session.welcome();
    session.room(lobby({ players: [seated('me', 0, { nickname: 'Or' })] }));
    await userEvent.keyboard('n');
    const field = screen.getByRole('textbox', { name: 'Nickname' });
    expect(field).toHaveValue('Or');
    // The lobby's keys are the dialog's while it's open.
    await userEvent.clear(field);
    await userEvent.type(field, 'Orrs');
    expect(session.spectate).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(session.setNickname).toHaveBeenCalledWith('Orrs');
    expect(app.stores.settings.getState().nickname).toBe('Orrs');
    expect(screen.queryByRole('textbox', { name: 'Nickname' })).not.toBeInTheDocument();
    expect(session.setReady).not.toHaveBeenCalled();
    expect(session.startMatch).not.toHaveBeenCalled();
  });

  test('the server’s errors show as toasts', async () => {
    const { online } = onlineApp();
    const session = online.session();
    session.welcome();
    session.room(lobby({ spectators: [watching('tal')] }));
    session.error('no_free_seat', 'Every seat is taken.');
    expect(await screen.findByText('Every seat is taken.')).toBeInTheDocument();
  });

  test('a match on is the match screen’s, not the lobby’s', () => {
    const { online } = onlineApp();
    online.session().welcome();
    online.session().room(lobby({ phase: 'playing' }));
    expect(screen.queryByRole('heading', { name: 'Room K7QX' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Match in progress');
    expect(within(document.body).queryByRole('list', { name: 'Seats' })).not.toBeInTheDocument();
  });
});
