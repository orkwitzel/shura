import type { KeyEvent } from '@shura/client-core';
import { type KeyName, keyName, type TerminalInput } from './terminal-input';

/**
 * How long a key may stay silent after its press before it counts as let go (ms), until a hold has
 * shown the OS delay before the first repeat: "about 500 ms" (design §7.3), with a margin, since
 * 500 ms is a common OS delay (GNOME).
 */
export const FIRST_REPEAT_WAIT = 550;

/**
 * The earliest a first repeat is believed to come after its press (ms), until a hold has shown the
 * OS delay: a second byte of the key sooner than this is a new tap. OS delays go down to about
 * 200 ms when people shorten them for games.
 */
const SHORTEST_REPEAT_DELAY = 150;

/** How far a first repeat may land from the learned OS delay, either way (ms): timer jitter. */
const DELAY_MARGIN = 50;

/**
 * The shortest gap between two taps of one key (ms). A byte sooner than this after the last is the
 * OS key repeat, or bytes read together, never a new tap.
 */
const FASTEST_TAP = 60;

/** The longest OS delay before the first repeat believed (ms). */
const LONGEST_REPEAT_DELAY = 1_000;

/** How many repeat intervals of silence count as a release once a key repeats (design §7.3). */
const INTERVALS_TO_RELEASE = 2;

/** The repeat intervals the estimate averages: the OS repeat rate is the same for every key. */
const INTERVALS_KEPT = 8;

/** The first-repeat delays the estimate averages: the OS delay is the same for every key too. */
const DELAYS_KEPT = 4;

/**
 * The shortest repeat interval believed (ms): bytes read together arrive at the same time, which
 * isn't the OS repeat rate, so shorter gaps aren't learned.
 */
const MIN_INTERVAL = 10;

/** A press, repeat or release of a terminal key, by its name: what its bytes say it did. */
export interface KeyChange {
  readonly name: KeyName;
  readonly kind: KeyEvent['kind'];
  readonly time: number;
}

/** A key taken to be held. */
interface HeldKey {
  /** When the hold started (ms): its press, or an earlier byte found to have started it. */
  pressed: number;
  /** When the key was pressed before this press, if recently: the hold may have started there. */
  previous: number | null;
  /** When its first repeat arrived, or `null` while it hasn't repeated. */
  firstRepeat: number | null;
  /** When its last byte arrived (ms). */
  last: number;
  /** When its release falls due if nothing more arrives for it (ms). */
  deadline: number;
}

export interface KeyRepeatOptions {
  /**
   * The least time a key pressed now may stay silent before its first repeat (ms): the auto adapter
   * waits longer while it is still choosing.
   */
  readonly minFirstRepeatWait?: () => number;
}

/**
 * Reads presses, repeats and releases from a terminal that reports no releases (design §7.3): the
 * OS key-repeat stream. Pure apart from what it learns, and driven by the keys' times.
 */
export interface KeyRepeatReader {
  /** What a terminal key did, in order: releases that fell due before it come first. */
  feed(raw: TerminalInput): KeyChange[];
  /** The releases inferred by `time`, in time order. */
  poll(time: number): KeyChange[];
  /** When the next inferred release falls due, or `null` when no key is held. */
  readonly deadline: number | null;
  /** Whether the key named `name` is taken to be held. */
  holds(name: KeyName): boolean;
}

/**
 * A key-repeat reader (design §7.3). The first byte of a key is a press, and each byte after it
 * while the key is held a repeat, except that a byte sooner than the OS delay before the first
 * repeat is a new tap: a release, then a press. A release is assumed once the key goes silent: a
 * little past the OS delay before its first repeat, then 2× the OS repeat interval. It learns both
 * from the holds it sees: the delay from each hold's first repeat, once the next repeat shows it
 * was one, and the interval from the gaps between repeats. A real release, or a repeat or press
 * event, from a terminal that sends them, counts as it says.
 */
export function createKeyRepeatReader({
  minFirstRepeatWait = () => 0,
}: KeyRepeatOptions = {}): KeyRepeatReader {
  const held = new Map<KeyName, HeldKey>();
  /** When each key was last pressed, kept after its release. */
  const pressedAt = new Map<KeyName, number>();
  const intervals: number[] = [];
  const delays: number[] = [];

  const mean = (values: readonly number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const delay = (): number | null => (delays.length > 0 ? mean(delays) : null);
  const keep = (values: number[], value: number, most: number) => {
    values.push(value);
    if (values.length > most) values.shift();
  };

  /** How long a key may stay silent before its first repeat. */
  const firstWait = (): number => {
    const learned = delay();
    const wait = learned === null ? FIRST_REPEAT_WAIT : learned + DELAY_MARGIN;
    return Math.max(wait, minFirstRepeatWait());
  };

  /** The soonest a held key's first repeat can come after its last byte. */
  const earliestFirstRepeat = (): number => {
    const learned = delay();
    return learned === null ? SHORTEST_REPEAT_DELAY : Math.max(learned - DELAY_MARGIN, FASTEST_TAP);
  };

  /** How long a repeating key may stay silent. */
  const silence = (): number => {
    if (intervals.length === 0) return firstWait();
    return INTERVALS_TO_RELEASE * mean(intervals);
  };

  const learnDelay = (sample: number) => {
    if (sample >= FASTEST_TAP && sample <= LONGEST_REPEAT_DELAY) keep(delays, sample, DELAYS_KEPT);
  };

  /** Releases the key named `name` at `time` if it is held. */
  const letGo = (name: KeyName, time: number): KeyChange[] => {
    if (!held.delete(name)) return [];
    return [{ name, kind: 'release', time }];
  };

  const press = (name: KeyName, time: number): KeyChange => {
    const before = pressedAt.get(name);
    pressedAt.set(name, time);
    held.set(name, {
      pressed: time,
      previous: before !== undefined && time - before <= LONGEST_REPEAT_DELAY ? before : null,
      firstRepeat: null,
      last: time,
      deadline: time + firstWait(),
    });
    return { name, kind: 'press', time };
  };

  const repeat = (name: KeyName, key: HeldKey, time: number): KeyChange => {
    if (key.firstRepeat === null) {
      key.firstRepeat = time;
    } else {
      const gap = time - key.last;
      if (gap >= MIN_INTERVAL) keep(intervals, gap, INTERVALS_KEPT);
      // A second repeat soon after the first shows the first was the OS repeat, not a slow tap.
      if (key.last === key.firstRepeat && gap < SHORTEST_REPEAT_DELAY) {
        learnDelay(key.firstRepeat - key.pressed);
      }
    }
    key.last = time;
    key.deadline = time + silence();
    return { name, kind: 'repeat', time };
  };

  const poll = (time: number): KeyChange[] => {
    const due = [...held].filter(([, key]) => key.deadline <= time);
    due.sort(([, a], [, b]) => a.deadline - b.deadline);
    return due.map(([name, key]) => {
      held.delete(name);
      return { name, kind: 'release', time: key.deadline };
    });
  };

  /** A byte of a key that is held, with no event type: a repeat, or a new tap. */
  const again = (name: KeyName, key: HeldKey, time: number): KeyChange[] => {
    const gap = time - key.last;
    if (key.firstRepeat !== null || gap >= earliestFirstRepeat()) return [repeat(name, key, time)];
    if (gap < FASTEST_TAP) {
      // Too soon for a tap: so the press before was the first repeat of a hold that started at the
      // press before it, whose release was assumed too early.
      if (key.previous !== null) {
        key.firstRepeat = key.pressed;
        key.pressed = key.previous;
      }
      return [repeat(name, key, time)];
    }
    return [...letGo(name, time), press(name, time)];
  };

  return {
    poll,
    get deadline() {
      const deadlines = [...held.values()].map((key) => key.deadline);
      return deadlines.length > 0 ? Math.min(...deadlines) : null;
    },
    holds: (name) => held.has(name),
    feed(raw) {
      const out = poll(raw.time);
      const name = keyName(raw);
      if (name === null) return out;
      const { time } = raw;
      const key = held.get(name);
      switch (raw.key.eventType) {
        case 'release':
          out.push(...letGo(name, time));
          break;
        case 'repeat':
          out.push(key ? repeat(name, key, time) : { name, kind: 'repeat', time });
          break;
        case 'press':
          out.push(...letGo(name, time), press(name, time));
          break;
        default:
          out.push(...(key ? again(name, key, time) : [press(name, time)]));
      }
      return out;
    },
  };
}
