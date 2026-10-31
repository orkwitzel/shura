import type { KeyEvent } from '@shura/client-core';
import { actionsByKey, type Bindings, MENU_KEYS } from './bindings';
import {
  type InputAdapter,
  type InputSignal,
  type KeyName,
  keyName,
  type TerminalInput,
} from './terminal-input';

/**
 * How long a key may stay silent after its press before it counts as let go (ms): "about 500 ms"
 * (design §7.3), with a margin, since 500 ms is a common OS delay before the first repeat (GNOME).
 */
export const FIRST_REPEAT_WAIT = 550;

/** How many repeat intervals of silence count as a release once a key repeats (design §7.3). */
const INTERVALS_TO_RELEASE = 2;

/** The repeat intervals the estimate averages: the OS repeat rate is the same for every key. */
const INTERVALS_KEPT = 8;

/**
 * The shortest repeat interval believed (ms): bytes read together arrive at the same time, which
 * isn't the OS repeat rate.
 */
const MIN_INTERVAL = 10;

/** A key the basic adapter takes to be held. */
interface HeldKey {
  /** When its last byte arrived (ms). */
  last: number;
  /** Whether it has repeated since its press. */
  repeating: boolean;
  /** When its release falls due if nothing more arrives for it (ms). */
  deadline: number;
}

export interface BasicAdapterOptions {
  /**
   * How long a key pressed now may stay silent before its first repeat (ms), if not
   * `FIRST_REPEAT_WAIT`: the auto adapter waits longer while it is still choosing.
   */
  readonly firstRepeatWait?: () => number;
}

/**
 * The basic adapter (design §7.3), for terminals that report no releases: the first byte of a key
 * is a press, each byte while it is held is a repeat, and a release is assumed once the key goes
 * silent: about 500 ms before its first repeat, then 2× the OS repeat interval, which it learns
 * from the repeats it sees. A real release, from a terminal that sends them anyway, counts too.
 */
export function createBasicAdapter(
  bindings: Bindings,
  { firstRepeatWait = () => FIRST_REPEAT_WAIT }: BasicAdapterOptions = {},
): InputAdapter {
  const byKey = actionsByKey(bindings);
  const held = new Map<KeyName, HeldKey>();
  const intervals: number[] = [];

  const silence = (): number => {
    if (intervals.length === 0) return FIRST_REPEAT_WAIT;
    const mean = intervals.reduce((sum, gap) => sum + gap, 0) / intervals.length;
    return INTERVALS_TO_RELEASE * Math.max(MIN_INTERVAL, mean);
  };

  /** What `name` doing `kind` makes: a key event if bound, the menu if pressed, else nothing. */
  const signal = (name: KeyName, kind: KeyEvent['kind'], time: number): InputSignal[] => {
    const action = byKey.get(name);
    if (action) return [{ kind: 'key', event: { action, kind, time } }];
    if (MENU_KEYS.includes(name) && kind === 'press') return [{ kind: 'menu' }];
    return [];
  };

  const poll = (time: number): InputSignal[] => {
    const due = [...held].filter(([, key]) => key.deadline <= time);
    due.sort(([, a], [, b]) => a.deadline - b.deadline);
    return due.flatMap(([name, key]) => {
      held.delete(name);
      return signal(name, 'release', key.deadline);
    });
  };

  const repeat = (name: KeyName, key: HeldKey, time: number): InputSignal[] => {
    if (key.repeating) {
      intervals.push(time - key.last);
      if (intervals.length > INTERVALS_KEPT) intervals.shift();
    }
    key.repeating = true;
    key.last = time;
    key.deadline = time + silence();
    return signal(name, 'repeat', time);
  };

  return {
    name: 'basic',
    autoShift: 'keyRepeat',
    poll,
    get deadline() {
      const deadlines = [...held.values()].map((key) => key.deadline);
      return deadlines.length > 0 ? Math.min(...deadlines) : null;
    },
    feed(raw: TerminalInput): InputSignal[] {
      const out = poll(raw.time);
      const name = keyName(raw);
      if (name === null) return out;
      const key = held.get(name);
      if (raw.key.eventType === 'release') {
        if (!key) return out;
        held.delete(name);
        out.push(...signal(name, 'release', raw.time));
      } else if (key) {
        out.push(...repeat(name, key, raw.time));
      } else {
        held.set(name, {
          last: raw.time,
          repeating: false,
          deadline: raw.time + firstRepeatWait(),
        });
        out.push(...signal(name, 'press', raw.time));
      }
      return out;
    },
  };
}
