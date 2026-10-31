import { type EngineEvent, type LockEvent, TSpin } from '@shura/engine';

/**
 * The game's sounds, each a file of the same name in `public/sounds/` (credited in its
 * CREDITS.md). Replacing a file changes the sound with no change here.
 */
export const SOUNDS = [
  'lock',
  'single',
  'double',
  'triple',
  'tetris',
  't-spin',
  'perfect-clear',
  'combo',
  'hold',
  'turn',
  'hard-drop',
  'garbage',
  'level-up',
  'top-out',
  'finish',
] as const;

export type Sound = (typeof SOUNDS)[number];

/** A sound to play, at `rate` times its speed. */
export interface SoundCue {
  readonly sound: Sound;
  readonly rate: number;
}

const CLEARS = ['lock', 'single', 'double', 'triple', 'tetris'] as const;

/** The lock's own sound: the biggest thing it did. */
function lockSound({ clear }: LockEvent): Sound {
  if (clear.perfectClear) return 'perfect-clear';
  if (clear.tSpin !== TSpin.None) return 't-spin';
  return CLEARS[clear.lines];
}

const OTHERS: Partial<Record<EngineEvent['type'], Sound>> = {
  hold: 'hold',
  turn: 'turn',
  hardDrop: 'hard-drop',
  garbageLanded: 'garbage',
  levelUp: 'level-up',
  topOut: 'top-out',
  finish: 'finish',
};

/**
 * Each combo step plays the combo sound a semitone higher, from an octave below the sample at combo
 * 1 to a semitone below it at combo 12. The sample's own pitch is too shrill to climb from.
 */
const HIGHEST_COMBO_STEP = 12;

const comboRate = (combo: number) => 2 ** ((Math.min(combo, HIGHEST_COMBO_STEP) - 13) / 12);

/** The sounds an engine event plays, in order (design §13.2, Sound). */
export function soundsForEvent(event: EngineEvent): SoundCue[] {
  if (event.type === 'lock') {
    const cues: SoundCue[] = [{ sound: lockSound(event), rate: 1 }];
    if (event.combo >= 1) cues.push({ sound: 'combo', rate: comboRate(event.combo) });
    return cues;
  }
  const sound = OTHERS[event.type];
  return sound ? [{ sound, rate: 1 }] : [];
}
