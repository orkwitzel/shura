import { type LockEvent, TSpin } from '@shura/engine';
import { describe, expect, it } from 'vitest';
import { type Callout, createSoloSession, lockCallouts, onCallouts } from '../src/index';
import { fakeEngineEvents, lockEvent } from './support/engine-events';
import { fakeClock } from './support/fake-clock';

const lock = lockEvent;

/** The callouts' text alone. */
const texts = (event: LockEvent, backToBackBefore = false) =>
  lockCallouts(event, backToBackBefore).map(({ text }) => text);

describe('a lock’s callouts', () => {
  it('are none for a lock that clears nothing', () => {
    expect(lockCallouts(lock(), false)).toEqual([]);
    expect(lockCallouts(lock(), true)).toEqual([]);
  });

  it('name each line count', () => {
    expect(texts(lock({ lines: 1 }))).toEqual(['SINGLE']);
    expect(texts(lock({ lines: 2 }))).toEqual(['DOUBLE']);
    expect(texts(lock({ lines: 3 }))).toEqual(['TRIPLE']);
    expect(texts(lock({ lines: 4 }))).toEqual(['TETRIS']);
  });

  it('put "T-SPIN" in front for a T-spin, alone when it clears nothing', () => {
    expect(texts(lock({ tSpin: TSpin.Full }))).toEqual(['T-SPIN']);
    expect(texts(lock({ lines: 1, tSpin: TSpin.Full }))).toEqual(['T-SPIN SINGLE']);
    expect(texts(lock({ lines: 2, tSpin: TSpin.Full }))).toEqual(['T-SPIN DOUBLE']);
    expect(texts(lock({ lines: 3, tSpin: TSpin.Full }))).toEqual(['T-SPIN TRIPLE']);
  });

  it('put "T-SPIN MINI" in front for a mini, alone when it clears nothing', () => {
    expect(texts(lock({ tSpin: TSpin.Mini }))).toEqual(['T-SPIN MINI']);
    expect(texts(lock({ lines: 1, tSpin: TSpin.Mini }))).toEqual(['T-SPIN MINI SINGLE']);
    expect(texts(lock({ lines: 2, tSpin: TSpin.Mini }))).toEqual(['T-SPIN MINI DOUBLE']);
  });

  it('say "BACK-TO-BACK" for a difficult clear after a difficult clear', () => {
    expect(texts(lock({ lines: 4 }), true)).toEqual(['TETRIS', 'BACK-TO-BACK']);
    expect(texts(lock({ lines: 1, tSpin: TSpin.Full }), true)).toEqual([
      'T-SPIN SINGLE',
      'BACK-TO-BACK',
    ]);
    expect(texts(lock({ lines: 1, tSpin: TSpin.Mini }), true)).toEqual([
      'T-SPIN MINI SINGLE',
      'BACK-TO-BACK',
    ]);
  });

  it('don’t say "BACK-TO-BACK" for the first difficult clear, or for one that isn’t difficult', () => {
    expect(texts(lock({ lines: 4 }), false)).toEqual(['TETRIS']);
    expect(texts(lock({ lines: 3 }), true)).toEqual(['TRIPLE']);
    // A T-spin that clears nothing keeps the status, but it isn't a back-to-back clear.
    expect(texts(lock({ tSpin: TSpin.Full }), true)).toEqual(['T-SPIN']);
  });

  it('count the combo from its first step: combo 0 is the first clear in a row', () => {
    expect(texts(lock({ lines: 1, combo: 0 }))).toEqual(['SINGLE']);
    expect(texts(lock({ lines: 1, combo: 1 }))).toEqual(['SINGLE', 'COMBO 1']);
    expect(texts(lock({ lines: 2, combo: 7 }))).toEqual(['DOUBLE', 'COMBO 7']);
  });

  it('say "PERFECT CLEAR" for a clear that empties the board', () => {
    expect(texts(lock({ lines: 2, perfectClear: true }))).toEqual(['DOUBLE', 'PERFECT CLEAR']);
  });

  it('come in order when a lock earns several, each with its kind', () => {
    expect(lockCallouts(lock({ lines: 4, combo: 3, perfectClear: true }), true)).toEqual([
      { kind: 'clear', text: 'TETRIS' },
      { kind: 'backToBack', text: 'BACK-TO-BACK' },
      { kind: 'combo', text: 'COMBO 3' },
      { kind: 'perfectClear', text: 'PERFECT CLEAR' },
    ]);
    expect(texts(lock({ lines: 2, tSpin: TSpin.Full, combo: 2 }), true)).toEqual([
      'T-SPIN DOUBLE',
      'BACK-TO-BACK',
      'COMBO 2',
    ]);
  });
});

describe('a session’s callouts', () => {
  /** A Sprint session whose engine events the test makes up, and the callouts it heard. */
  function listening() {
    const clock = fakeClock();
    const session = createSoloSession({ mode: 'sprint', clock, seed: 7 });
    const { emit } = fakeEngineEvents(session);
    const heard: string[][] = [];
    const stop = onCallouts(session, (callouts: readonly Callout[]) =>
      heard.push(callouts.map(({ text }) => text)),
    );
    return { clock, session, emit, heard, stop };
  }

  it('reach the listener once for each lock that earns any, in order', () => {
    const { emit, heard } = listening();
    emit(
      { type: 'hardDrop', frame: 10, rows: 15 },
      lockEvent({ frame: 10 }),
      lockEvent({ frame: 20, lines: 1 }),
      { type: 'levelUp', frame: 20, level: 2 },
      lockEvent({ frame: 30, lines: 2, combo: 1 }),
    );
    expect(heard).toEqual([['SINGLE'], ['DOUBLE', 'COMBO 1']]);
  });

  it('say "BACK-TO-BACK" from the back-to-back status before the lock', () => {
    const { emit, heard } = listening();
    emit(lockEvent({ lines: 4, backToBack: true }));
    // A lock that clears nothing, and a lock out, leave the status as it was.
    emit(lockEvent({ backToBack: true }));
    emit(lockEvent({ lines: 2, tSpin: TSpin.Full, backToBack: true }));
    emit(lockEvent({ lines: 1, backToBack: false }));
    emit(lockEvent({ lines: 4, backToBack: true }));
    expect(heard).toEqual([['TETRIS'], ['T-SPIN DOUBLE', 'BACK-TO-BACK'], ['SINGLE'], ['TETRIS']]);
  });

  it('start again with no back-to-back when the session restarts', () => {
    const { session, emit, heard } = listening();
    emit(lockEvent({ lines: 4, backToBack: true }));
    session.restart();
    emit(lockEvent({ lines: 4, backToBack: true }));
    expect(heard).toEqual([['TETRIS'], ['TETRIS']]);
  });

  it('carry the back-to-back status through a pause', () => {
    const { clock, session, emit, heard } = listening();
    clock.run(2_000);
    emit(lockEvent({ lines: 4, backToBack: true }));
    session.pause();
    session.resume();
    clock.run(2_000);
    emit(lockEvent({ lines: 4, backToBack: true }));
    expect(heard).toEqual([['TETRIS'], ['TETRIS', 'BACK-TO-BACK']]);
  });

  it('stop once the listener is removed', () => {
    const { emit, heard, stop } = listening();
    stop();
    emit(lockEvent({ lines: 4 }));
    expect(heard).toEqual([]);
  });
});
