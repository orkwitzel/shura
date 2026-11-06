import type { OnlinePlayerGame } from '@shura/client-core';
import { afterEach, expect, it, vi } from 'vitest';
import { lookOf } from '../../../src/board/look';
import { MatchView } from '../../../src/screens/online/match-view';
import { fakeClock } from '../../support/fake-clock';
import {
  fakeOnlineSession,
  freshEngine,
  lobbyRoom,
  matchState,
  renderScreen,
} from '../../support/fake-online-session';
import { settle } from '../../support/ink';

// The flash is inverse video, which only shows in a frame drawn with colour: Ink fixes its colour
// level as it loads, so this file turns colour on before anything imports it.
vi.hoisted(() => {
  process.env.FORCE_COLOR = '1';
});

let unmount: (() => void) | undefined;
afterEach(() => unmount?.());

const INVERSE_ON = '\x1b[7m';
const INVERSE_OFF = '\x1b[27m';
// biome-ignore lint/suspicious/noControlCharactersInRegex: a frame's colour codes
const COLOUR_CODE = /\x1b\[[0-9;]*m/g;

const game = (playerId: string, index: number): OnlinePlayerGame => ({
  playerId,
  index,
  engine: freshEngine(index).state,
  out: null,
  linesSent: 0,
});

/** The text drawn inverted in `frame`, its colour codes stripped. */
function invertedText(frame: string): string {
  return frame
    .split(INVERSE_ON)
    .slice(1)
    .map((part) => (part.split(INVERSE_OFF)[0] ?? '').replace(COLOUR_CODE, ''))
    .join('|');
}

it("an attack flashes its target's name for a moment (design §13.3)", async () => {
  const clock = fakeClock(1_000);
  const match = matchState({
    matchId: 'm1',
    seed: 7,
    mode: '1v1',
    phase: 'playing',
    countdown: 0,
    playerId: 'me',
    players: [game('me', 0), game('bo', 1)],
    result: null,
  });
  const session = fakeOnlineSession({ room: lobbyRoom({ phase: 'playing' }), match });
  const names = new Map([
    ['me', 'Ada'],
    ['bo', 'Bo'],
  ]);
  const screen = await renderScreen(
    <MatchView
      session={session}
      look={lookOf('none')}
      ghost
      clock={clock}
      input={{ choice: 'precise' }}
      size={{ columns: 80, rows: 24 }}
      names={names}
      active
      onLeave={vi.fn()}
    />,
  );
  unmount = screen.app.unmount;
  expect(invertedText(screen.frame())).not.toContain('Bo');

  session.emitRouting({ id: 1, from: 'me', to: 'bo', lines: 4, holeSeed: 3 });
  await settle();
  expect(invertedText(screen.frame())).toContain('Bo');
  expect(invertedText(screen.frame())).not.toContain('Ada');

  // The match draws every frame: once the moment has passed, the name is back to normal.
  clock.run(700);
  session.set({ match: { ...match } });
  await settle();
  expect(invertedText(screen.frame())).not.toContain('Bo');
});
