import { ActionType } from '@shura/engine';
import { GARBAGE_ACK_TIMEOUT } from '@shura/protocol';
import { createMemoryStores, type MatchLog } from '@shura/valkey';
import { describe, expect, test } from 'vitest';
import { lockstepMatch, type SimPlayer, settle } from './support/lockstep';
import {
  RECORDED_ACTIONS,
  RECORDED_HASHES,
  RECORDED_LAST_FRAME,
  RECORDED_PIECE_ACTIONS,
} from './support/recorded-1v1';

/** The recorded 1v1's two players, whose clients receive every attack as sent. */
function recordedPlayers(): SimPlayer[] {
  return RECORDED_PIECE_ACTIONS.map((actions, index) => ({ id: `p${index}`, actions }));
}

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

/** A match log whose appends each wait to be let through or failed, oldest first. */
function gatedLog() {
  const inner = createMemoryStores().matchLog;
  const waiting: { succeed: () => void; fail: () => void }[] = [];
  const gate = {
    appends: 0,
    /** Lets the oldest waiting append through. */
    succeed: () => waiting.shift()?.succeed(),
    /** Fails the oldest waiting append, as a Valkey that's down would. */
    fail: () => waiting.shift()?.fail(),
    succeedAll: () => {
      while (waiting.length > 0) waiting.shift()?.succeed();
    },
    failAll: () => {
      while (waiting.length > 0) waiting.shift()?.fail();
    },
  };
  const log: MatchLog = {
    ...inner,
    append: (matchId, entry) =>
      new Promise((resolve, reject) => {
        gate.appends++;
        waiting.push({
          succeed: () => resolve(inner.append(matchId, entry)),
          fail: () => reject(new Error('Valkey is down')),
        });
      }),
  };
  return { log, gate, inner };
}

describe('the match log', () => {
  test('a batch is acknowledged only once the append holding it has succeeded', async () => {
    const { log, gate } = gatedLog();
    const lockstep = lockstepMatch({ players: recordedPlayers(), log });
    await lockstep.play(60);
    expect(gate.appends).toBeGreaterThan(0);
    expect(lockstep.acks('p0')).toEqual([]);
    expect(lockstep.acks('p1')).toEqual([]);

    gate.succeedAll();
    await settle();
    // Every batch up to frame 60 is in the log now: one batch a frame, from seq 0.
    expect(lockstep.acks('p0').at(-1)).toBe(59);
    expect(lockstep.acks('p1').at(-1)).toBe(59);
  });

  test('while appends fail nothing is acknowledged, and once they succeed again everything is', async () => {
    const { log, gate, inner } = gatedLog();
    const lockstep = lockstepMatch({ players: recordedPlayers(), log });
    await lockstep.play(30);
    gate.failAll();
    await settle();
    expect(lockstep.acks('p0')).toEqual([]);

    await lockstep.play(60);
    gate.succeedAll();
    await settle();
    expect(lockstep.acks('p0').at(-1)).toBe(59);
    // The batches of the failed appends went again: the log holds every one.
    const record = await inner.read('match-1');
    const seqs = record?.entries.flatMap(({ batches }) =>
      (batches as { playerId: string; seq: number }[])
        .filter(({ playerId }) => playerId === 'p0')
        .map(({ seq }) => seq),
    );
    expect(seqs?.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 60 }, (_, seq) => seq));
  });

  test('a later batch logged before an earlier one waits for it to be acknowledged', async () => {
    const { log, gate } = gatedLog();
    const lockstep = lockstepMatch({ players: recordedPlayers(), log });
    await lockstep.play(12);
    // The append of frames 1 to 6 fails, after the one of frames 7 to 12 went out, which succeeds.
    gate.fail();
    await settle();
    gate.succeed();
    await settle();
    expect(lockstep.acks('p0')).toEqual([]);

    // Frames 1 to 6 go again with frame 13.
    await lockstep.play(13);
    gate.succeedAll();
    await settle();
    expect(lockstep.acks('p0').at(-1)).toBe(12);
  });

  test('holds the start, the verified batches and the routings, tagged with the epoch, and is deleted at match end', async () => {
    const stores = createMemoryStores();
    const reads: Awaited<ReturnType<MatchLog['read']>>[] = [];
    const log: MatchLog = {
      ...stores.matchLog,
      async delete(matchId) {
        reads.push(await stores.matchLog.read(matchId));
        await stores.matchLog.delete(matchId);
      },
    };
    const lockstep = lockstepMatch({ players: recordedPlayers(), log });
    await lockstep.play(RECORDED_LAST_FRAME);
    await settle();

    const record = reads[0];
    expect(record?.start).toMatchObject({
      seed: 9,
      players: [
        { id: 'p0', nickname: 'p0', index: 0 },
        { id: 'p1', nickname: 'p1', index: 1 },
      ],
    });
    expect(record?.entries.every(({ epoch }) => epoch === 1)).toBe(true);
    const routings = record?.entries.flatMap(({ routings }) => routings);
    expect(routings).toEqual(
      lockstep.routed.map(({ attack: { from, to, id, lines, holeSeed }, targetFrame }) => ({
        from,
        to,
        id,
        lines,
        holeSeed,
        frame: targetFrame,
      })),
    );
    expect(await stores.matchLog.read('match-1')).toBeUndefined();
  });
});
