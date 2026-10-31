import { createEngine, ONE_VS_ONE } from '@shura/engine';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MatchHud } from '@/features/hud/components/match-hud';
import { fakeOnlineSession, matchState, playerGame } from '../../../support/fake-online-session';

/** A HUD value, found by its label. */
const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling;

/** Your engine, `frame` frames in with `pieces` locked. */
function engineAt(frame: number, pieces: number) {
  const state = createEngine(ONE_VS_ONE, 7, 0).serialize();
  state.frame = frame;
  state.piecesPlaced = pieces;
  return state;
}

describe('the match HUD (design §13.2, Match)', () => {
  test('shows the lines you sent, your pieces per second and your ping', () => {
    const session = fakeOnlineSession({ nickname: 'Or' });
    session.welcome();
    session.set({
      match: matchState([
        playerGame('me', 0, { engine: engineAt(600, 17), linesSent: 6 }),
        playerGame('bo', 1, { linesSent: 9 }),
      ]),
    });
    render(<MatchHud session={session} />);
    expect(stat('Sent')).toHaveTextContent('6');
    // 17 pieces in 10 s.
    expect(stat('PPS')).toHaveTextContent('1.70');
    expect(screen.getByText(/42 ms/)).toBeInTheDocument();
    expect(screen.queryByText('Alive')).not.toBeInTheDocument();
  });

  test('in an FFA, shows the players still in', () => {
    const session = fakeOnlineSession({ nickname: 'Or' });
    session.welcome();
    const out = { reason: 'toppedOut' as const, frame: 300 };
    session.set({
      match: matchState([
        playerGame('me', 0),
        playerGame('bo', 1, { out }),
        playerGame('cy', 2),
        playerGame('dan', 3),
      ]),
    });
    render(<MatchHud session={session} />);
    expect(stat('Alive')).toHaveTextContent('3/4');
  });
});
