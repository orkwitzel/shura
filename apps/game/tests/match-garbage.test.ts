import { ActionType } from '@shura/engine';
import { GARBAGE_ACK_TIMEOUT } from '@shura/protocol';
import { describe, expect, test } from 'vitest';
import { lockstepMatch, recordedPlayers, type SimPlayer } from './support/lockstep';
import {
  RECORDED_ACTIONS,
  RECORDED_HASHES,
  RECORDED_LAST_FRAME,
  RECORDED_PIECE_ACTIONS,
} from './support/recorded-1v1';

/** The `garbageReceived` actions of a recorded player's log: what the harness sent them. */
function recordedReceived(index: number) {
  return (RECORDED_ACTIONS[index] ?? []).flatMap((action) =>
    action.type === ActionType.GarbageReceived ? [action] : [],
  );
}

describe('garbage routing', () => {
  test('in a 1v1, each attack goes to the opponent, and both games end as recorded', async () => {
    const lockstep = lockstepMatch({ players: recordedPlayers() });
    await lockstep.play(RECORDED_LAST_FRAME);

    // The server sent each player exactly the attacks the engine's harness did, in order.
    for (const index of [0, 1]) {
      const toThem = lockstep
        .messages('garbageQueued')
        .filter(({ to }) => to === `p${index}`)
        .map(({ id, lines, holeSeed, from }) => ({ id, lines, holeSeed, from }));
      expect(toThem).toEqual(
        recordedReceived(index).map(({ id, lines, holeSeed }) => ({
          id,
          lines,
          holeSeed,
          from: `p${1 - index}`,
        })),
      );
    }
    // Each client's log is the recorded one, and the server verified each game to its hash.
    lockstep.clients.forEach((client, index) => {
      expect(client.log).toEqual(RECORDED_ACTIONS[index]);
    });
    expect(lockstep.match.verifiedGames().map(({ hash }) => hash)).toEqual(RECORDED_HASHES);
    expect(lockstep.messages('playerOut')).toEqual([
      { type: 'playerOut', playerId: 'p0', reason: 'toppedOut', frame: RECORDED_LAST_FRAME },
    ]);
    expect(lockstep.match.ended).toBe(true);
  });

  test('an FFA down to two plays exactly as a 1v1', async () => {
    const players = [...recordedPlayers(), { id: 'p2', actions: [] }];
    const lockstep = lockstepMatch({ mode: 'ffa', players });
    lockstep.match.goOut('p2', 'left', 0);
    await lockstep.play(RECORDED_LAST_FRAME);

    expect(lockstep.messages('garbageQueued').some(({ to }) => to === 'p2')).toBe(false);
    lockstep.clients.slice(0, 2).forEach((client, index) => {
      expect(client.log).toEqual(RECORDED_ACTIONS[index]);
    });
    expect(
      lockstep.match
        .verifiedGames()
        .slice(0, 2)
        .map(({ hash }) => hash),
    ).toEqual(RECORDED_HASHES);
  });

  test('in an FFA, each attack goes to a random player still in, never back to the attacker', async () => {
    // Three players, the third playing the first one's moves: all three send attacks.
    const [first, second] = RECORDED_PIECE_ACTIONS;
    const players = [
      { id: 'p0', actions: first ?? [] },
      { id: 'p1', actions: second ?? [] },
      { id: 'p2', actions: first ?? [] },
    ];
    const lockstep = lockstepMatch({ mode: 'ffa', players });
    await lockstep.play(3000);

    const attacks = lockstep.messages('garbageQueued');
    expect(attacks.length).toBeGreaterThan(10);
    for (const { from, to } of attacks) expect(to).not.toBe(from);
    // The draws spread over both possible targets of each attacker.
    for (const attacker of ['p0', 'p1', 'p2']) {
      const targets = new Set(attacks.filter(({ from }) => from === attacker).map(({ to }) => to));
      expect(targets.size).toBe(2);
    }
    // Every client received what it was sent, and the server's games are the clients'.
    expect(lockstep.messages('playerOut')).toEqual([]);
    const verified = lockstep.match.verifiedGames();
    lockstep.clients.forEach((client, index) => {
      expect(verified[index]?.hash).toBe(client.engine.hash());
    });
  });

  test('garbage aimed at a player who is out is dropped, not aimed at someone else', async () => {
    const lockstep = lockstepMatch({ players: recordedPlayers() });
    await lockstep.play(1000);
    const before = lockstep.messages('garbageQueued').length;
    expect(before).toBeGreaterThan(0);

    // p1 leaves, out at a frame p0 hasn't been verified to yet: p0 plays on to it.
    lockstep.match.goOut('p1', 'left', 3000);
    await lockstep.play(3000);
    expect(lockstep.messages('garbageQueued')).toHaveLength(before);
    expect(lockstep.match.ended).toBe(true);
  });
});

describe('garbageReceived checks', () => {
  test.each([
    ['the wrong lines', { lines: 9 }],
    ['the wrong hole seed', { holeSeed: 12345 }],
    ['an attack never sent', { id: 999 }],
  ])('a garbageReceived with %s removes the player', async (_, change) => {
    let tampered = false;
    const [first, second] = recordedPlayers();
    const cheat: SimPlayer = {
      ...(second as SimPlayer),
      receive: (attack) => {
        if (tampered) return attack;
        tampered = true;
        return { ...attack, ...change };
      },
    };
    const lockstep = lockstepMatch({ players: [first as SimPlayer, cheat] });
    await lockstep.play(RECORDED_LAST_FRAME);

    const receivedAt = lockstep.clients[1]?.log.find(
      ({ type }) => type === ActionType.GarbageReceived,
    )?.frame;
    expect(lockstep.messages('playerOut')[0]).toEqual({
      type: 'playerOut',
      playerId: 'p1',
      reason: 'removed',
      frame: receivedAt,
    });
  });
});

describe('GARBAGE_ACK_TIMEOUT', () => {
  test('a client that never receives an attack is lagged out once its timeout runs out', async () => {
    const [first, second] = recordedPlayers();
    const stalling: SimPlayer = { ...(second as SimPlayer), receive: () => null };
    const lockstep = lockstepMatch({ players: [first as SimPlayer, stalling] });
    await lockstep.play(RECORDED_LAST_FRAME);

    const firstAttack = lockstep.routed.find(({ attack }) => attack.to === 'p1');
    if (!firstAttack) throw new Error('p0 sent no attack');
    const deadline = firstAttack.targetFrame + GARBAGE_ACK_TIMEOUT;
    expect(lockstep.messages('playerOut')[0]).toEqual({
      type: 'playerOut',
      playerId: 'p1',
      reason: 'laggedOut',
      frame: deadline,
    });
    // The server verified p1 up to the timeout and no further.
    expect(lockstep.match.verifiedGames()[1]?.frame).toBe(deadline);
  });

  test('a client that receives and accepts every attack in time is never lagged out', async () => {
    const lockstep = lockstepMatch({ players: recordedPlayers() });
    await lockstep.play(RECORDED_LAST_FRAME);
    expect(lockstep.messages('playerOut').map(({ reason }) => reason)).toEqual(['toppedOut']);
  });
});
