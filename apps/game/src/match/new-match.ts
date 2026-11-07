import { randomInt, randomUUID } from 'node:crypto';

/** A new match's identity: its id and the seed its engines are dealt from. */
export interface MatchIdentity {
  readonly matchId: string;
  /** A 32-bit unsigned seed. */
  readonly seed: number;
}

/** Makes the identity of each new match. */
export type NewMatch = () => MatchIdentity;

/**
 * The injection token of `NewMatch`. The service draws a fresh id and a random seed; tests give a
 * fixed seed, so a scripted match deals the same pieces every run.
 */
export const NEW_MATCH = Symbol('NewMatch');

/**
 * A random seed and a fresh id. The match is deterministic from its seed (design §5.1); choosing
 * the seed needn't be.
 */
export const randomMatch: NewMatch = () => ({ matchId: randomUUID(), seed: randomInt(2 ** 32) });
