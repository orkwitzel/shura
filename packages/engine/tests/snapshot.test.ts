import { describe, expect, test } from 'vitest';
import {
  type Action,
  ActionType,
  createEngine,
  DEFAULT_MODE_SETTINGS,
  type Engine,
  type EngineState,
  restoreEngine,
} from '../src/index';
import { loadRecordedMatches, replay } from './support/recorded-matches';

const SEED = 77;

function newEngine(): Engine {
  return createEngine(DEFAULT_MODE_SETTINGS, SEED, 0);
}

/**
 * A full game played by a fixed script: each piece is shifted to a column that cycles across the
 * board and hard-dropped, a few frames apart, until the stack tops out.
 */
function scriptedGame(): { actions: Action[]; lastFrame: number } {
  const engine = newEngine();
  const actions: Action[] = [];
  let frame = 0;
  for (let piece = 0; !engine.state.toppedOut; piece++) {
    const shift = (piece % 9) - 4;
    const placement: Action[] = [];
    for (let i = 0; i < Math.abs(shift); i++) {
      placement.push({
        frame: ++frame,
        type: shift < 0 ? ActionType.MoveLeft : ActionType.MoveRight,
      });
    }
    frame += 1 + (piece % 5) * 13;
    placement.push({ frame, type: ActionType.HardDrop });
    engine.step(frame, placement);
    actions.push(...placement);
  }
  return { actions, lastFrame: frame + 30 };
}

const game = scriptedGame();

/** Steps `engine` from frame `from` to `to` with the actions that fall in between. */
function play(engine: Engine, actions: readonly Action[], from: number, to: number): Engine {
  engine.step(
    to,
    actions.filter((action) => action.frame > from && action.frame <= to),
  );
  return engine;
}

describe('serialize and restore', () => {
  const uninterrupted = play(newEngine(), game.actions, 0, game.lastFrame);
  const finalHash = uninterrupted.hash();

  test('the scripted game is long enough to mean something', () => {
    expect(game.actions.length).toBeGreaterThan(50);
    expect(uninterrupted.state.toppedOut).toBe(true);
  });

  test('restoring at any frame and continuing gives the same final hash', () => {
    for (let frame = 0; frame <= game.lastFrame; frame++) {
      const first = play(newEngine(), game.actions, 0, frame);
      const resumed = play(restoreEngine(first.serialize()), game.actions, frame, game.lastFrame);
      if (resumed.hash() !== finalHash) {
        expect.fail(`restoring at frame ${frame} changed the outcome`);
      }
    }
  });

  test.each(loadRecordedMatches())(
    'restoring partway through $file gives the same hash',
    ({ match }) => {
      const { actions, lastFrame } = match;
      const expected = replay(match);
      // Every 97th frame: the gravity-only match is too long to restore at every frame.
      for (let frame = 0; frame <= lastFrame; frame += 97) {
        const first = createEngine(match.settings, match.seed, match.playerIndex);
        play(first, actions, 0, frame);
        const resumed = play(restoreEngine(first.serialize()), actions, frame, lastFrame);
        if (resumed.hash() !== expected) {
          expect.fail(`restoring at frame ${frame} changed the outcome`);
        }
      }
    },
  );

  test('a state that went through JSON restores to the same game', () => {
    const engine = play(newEngine(), game.actions, 0, 400);
    const wire: EngineState = JSON.parse(JSON.stringify(engine.serialize()));
    expect(wire).toEqual(engine.serialize());
    expect(play(restoreEngine(wire), game.actions, 400, game.lastFrame).hash()).toBe(finalHash);
  });

  test('serialize returns a copy', () => {
    const engine = newEngine();
    const before = engine.hash();
    const copy = engine.serialize();
    copy.board[0]?.fill('I');
    copy.queue.length = 0;
    copy.randomizer.bag.length = 0;
    copy.active.col = 0;
    copy.settings.gravity = 1;
    expect(engine.hash()).toBe(before);
  });

  test('restore copies its input', () => {
    const state = newEngine().serialize();
    const engine = restoreEngine(state);
    const before = engine.hash();
    state.board[0]?.fill('I');
    state.queue.length = 0;
    expect(engine.hash()).toBe(before);
  });
});

describe('hash', () => {
  const state = play(newEngine(), game.actions, 0, 300).serialize();

  test('is a 64-bit hex string', () => {
    expect(restoreEngine(state).hash()).toMatch(/^[0-9a-f]{16}$/);
  });

  test('is equal for equal states', () => {
    expect(restoreEngine(state).hash()).toBe(restoreEngine(structuredClone(state)).hash());
  });

  test("doesn't depend on object key order", () => {
    const reordered = Object.fromEntries(Object.entries(state).reverse()) as EngineState;
    reordered.randomizer = { bag: state.randomizer.bag, rng: state.randomizer.rng };
    expect(restoreEngine(reordered).hash()).toBe(restoreEngine(state).hash());
  });

  test('ignores fields that are not part of the engine state', () => {
    const extra = { ...state, note: 'from the wire' } as EngineState;
    expect(restoreEngine(extra).hash()).toBe(restoreEngine(state).hash());
  });

  const changes: Record<string, (s: EngineState) => void> = {
    'a board cell': (s) => {
      const row = s.board[0] as (string | null)[];
      row[9] = row[9] === null ? 'I' : null;
    },
    'the frame': (s) => {
      s.frame++;
    },
    'the active piece': (s) => {
      s.active.col++;
    },
    "the active piece's rotation": (s) => {
      s.active.rotation = s.active.rotation === 2 ? 0 : 2;
    },
    'the queue': (s) => {
      s.queue.reverse();
    },
    'the bag RNG': (s) => {
      s.randomizer.rng ^= 1;
    },
    'the gravity counter': (s) => {
      s.gravityCounter++;
    },
    'the lock timer': (s) => {
      s.lockTimer++;
    },
    'the lock resets': (s) => {
      s.lockResets++;
    },
    'the lowest row': (s) => {
      s.lowestRow--;
    },
    'the hold': (s) => {
      s.hold = s.hold === 'T' ? 'I' : 'T';
    },
    'the hold-used flag': (s) => {
      s.holdUsed = !s.holdUsed;
    },
    'the top-out flag': (s) => {
      s.toppedOut = !s.toppedOut;
    },
    'the level': (s) => {
      s.level++;
    },
    'the score': (s) => {
      s.score++;
    },
    'the lines cleared': (s) => {
      s.linesCleared++;
    },
    'the pieces placed': (s) => {
      s.piecesPlaced++;
    },
    'the combo': (s) => {
      s.combo++;
    },
    'the back-to-back status': (s) => {
      s.backToBack = !s.backToBack;
    },
    'the player index': (s) => {
      s.playerIndex++;
    },
    'the mode settings': (s) => {
      s.settings.gravity++;
    },
  };

  test.each(Object.keys(changes))('changes when %s changes', (name) => {
    const changed = structuredClone(state);
    changes[name]?.(changed);
    expect(restoreEngine(changed).hash()).not.toBe(restoreEngine(state).hash());
  });
});
