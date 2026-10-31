import { assertInteger } from './assert';
import { applyMarginTime } from './attack';
import { BOARD_WIDTH, type Board, insertGarbage } from './board';
import type { GarbageRules } from './modes';
import { nextRandom } from './random';

/**
 * One attack waiting in a garbage meter (design §8.5): `garbageQueued{id, lines, holeSeed}` as the
 * server sends it. `lines` is what is still to land.
 */
export interface GarbageEntry {
  id: number;
  lines: number;
  /** Picks the column of the hole every line of this attack shares. */
  holeSeed: number;
}

/** The last attack that landed lines, and the column of its hole. */
export interface LastHole {
  id: number;
  column: number;
}

/** The fields of `EngineState` that sending and landing garbage read and write. */
export interface GarbageState {
  frame: number;
  board: Board;
  toppedOut: boolean;
  garbageMeter: GarbageEntry[];
  marginCarry: number;
  lastHole: LastHole | null;
}

/**
 * The column of the hole in every line of the attack with `holeSeed` (design §3), from one draw of
 * the engine's PRNG seeded with it, so any seed, even one of a run of consecutive seeds, gives a
 * random column. After an attack with its hole in column `previous`, it is one of the other 9
 * columns, so the hole always moves between attacks. With no `previous`, it is any of the 10.
 */
export function holeColumn(holeSeed: number, previous: number | null): number {
  const [value] = nextRandom(holeSeed);
  if (previous === null) return value % BOARD_WIDTH;
  return (previous + 1 + (value % (BOARD_WIDTH - 1))) % BOARD_WIDTH;
}

/**
 * Cancels `attack` lines against a garbage meter (design §3): they take lines off the oldest entry
 * first, removing each entry they empty, and only the remainder is sent on. Returns the new meter
 * and the remainder, leaving `meter` as it was.
 */
export function cancelGarbage(
  meter: readonly Readonly<GarbageEntry>[],
  attack: number,
): { meter: GarbageEntry[]; remainder: number } {
  assertInteger('attack', attack, 0);
  let remainder = attack;
  const left: GarbageEntry[] = [];
  for (const entry of meter) {
    const cancelled = Math.min(remainder, entry.lines);
    remainder -= cancelled;
    if (cancelled < entry.lines) left.push({ ...entry, lines: entry.lines - cancelled });
  }
  return { meter: left, remainder };
}

/**
 * Adds an attack to the end of a garbage meter. The id must not already be in the meter, the
 * attack must have lines, and its hole seed must be a 32-bit unsigned integer.
 */
export function addToMeter(
  meter: GarbageEntry[],
  { id, lines, holeSeed }: Readonly<GarbageEntry>,
): void {
  assertInteger('garbage id', id, 0);
  if (meter.some((entry) => entry.id === id)) {
    throw new RangeError(`garbage ${id} is already in the meter`);
  }
  assertInteger('garbage lines', lines, 1);
  assertInteger('holeSeed', holeSeed, 0, 0xffffffff);
  meter.push({ id, lines, holeSeed });
}

/**
 * Sends a lock's attack (design §3): multiplies it for margin time, adding the carry from the last
 * attack's rounding, then cancels the whole lines against the garbage meter there and then, so a
 * later lock in the same frame can't land what it cancelled. Returns the lines left to send on.
 */
export function sendAttack(s: GarbageState, { marginTime }: GarbageRules, attack: number): number {
  const multiplied = applyMarginTime(attack, s.frame, marginTime, s.marginCarry);
  s.marginCarry = multiplied.carry;
  const { meter, remainder } = cancelGarbage(s.garbageMeter, multiplied.lines);
  s.garbageMeter = meter;
  return remainder;
}

/**
 * Lands garbage at a lock that cleared nothing (design §3, §8.5): the oldest attacks in the meter,
 * one after another while `lands` says the lock lands lines of the oldest, up to the garbage cap,
 * splitting an attack the cap cuts short. Garbage that pushes the stack past the top of the board
 * tops the player out. Returns the lines that landed.
 */
export function landGarbage(
  s: GarbageState,
  { cap }: GarbageRules,
  lands: (oldest: GarbageEntry | undefined) => oldest is GarbageEntry,
): number {
  let room = cap;
  while (room > 0 && !s.toppedOut) {
    const entry = s.garbageMeter[0];
    if (!lands(entry)) break;
    const lines = Math.min(room, entry.lines);
    room -= lines;
    entry.lines -= lines;
    if (entry.lines === 0) s.garbageMeter.shift();
    if (insertGarbage(s.board, lines, landingHole(s, entry))) s.toppedOut = true;
  }
  return cap - room;
}

/**
 * The column of the hole in the lines of `entry` landing now: the column it started landing in if
 * the garbage cap cut it short, or else a new column its hole seed picks away from the last hole.
 */
function landingHole(s: GarbageState, entry: Readonly<GarbageEntry>): number {
  if (s.lastHole?.id !== entry.id) {
    s.lastHole = { id: entry.id, column: holeColumn(entry.holeSeed, s.lastHole?.column ?? null) };
  }
  return s.lastHole.column;
}
