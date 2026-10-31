/**
 * How a bot plays (design §13.4): how long it thinks, how fast it goes, how often it fumbles and
 * how far it looks ahead. Difficulty levels for PvE would be more of these (§16).
 */
export interface BotProfile {
  /** Thinking time before each piece, in ms: near `min` on a low stack, near `max` on a high one. */
  readonly thinkMs: { readonly min: number; readonly max: number };
  /** The pieces per second it aims for. A bot's `pps` overrides it. */
  readonly pps: number;
  /** How far its pace drifts either way from the target, as a share of it. */
  readonly drift: number;
  /** The chance, each piece, that it fumbles: a wrong tap, then a correction. */
  readonly mistakeRate: number;
  /** How many pieces of the queue it looks ahead to when it scores a placement. */
  readonly lookahead: number;
  /** How many of its best placements it picks among, the better ones more often. */
  readonly bestOf: number;
  /** The chance, each piece, that it considers holding. */
  readonly holdChance: number;
  /** The chance, each T, that it looks for a T-spin. */
  readonly tSpinChance: number;
  /** The chance, each piece, that it soft-drops it to the stack before the hard drop. */
  readonly softDropChance: number;
}

export type BotProfileName = 'casual';

/** v1's one profile: `casual`, about a piece a second, a beatable opponent. */
export const BOT_PROFILES: Readonly<Record<BotProfileName, BotProfile>> = {
  casual: {
    thinkMs: { min: 250, max: 700 },
    pps: 1,
    drift: 0.2,
    mistakeRate: 0.1,
    lookahead: 1,
    bestOf: 3,
    holdChance: 0.3,
    tSpinChance: 0.4,
    softDropChance: 0.15,
  },
};

export const BOT_PROFILE_NAMES = Object.keys(BOT_PROFILES) as BotProfileName[];
