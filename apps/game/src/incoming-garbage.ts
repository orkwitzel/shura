import { type Action, ActionType, type GarbageEntry } from '@shura/engine';
import { GARBAGE_ACK_TIMEOUT } from '@shura/protocol';

/** An attack the server routed to a player (design §8.5, step 2). */
export interface SentAttack {
  readonly id: number;
  /** The attacker's player id. */
  readonly from: string;
  readonly lines: number;
  readonly holeSeed: number;
  /** The target's verified frame when the server sent it, which its timeout counts from. */
  readonly sentAt: number;
}

interface Tracked extends SentAttack {
  /** The frame of its `garbageReceived` action, once a verified batch holds it. */
  receivedAt: number | null;
}

/**
 * The attacks the server has sent one player and that their game hasn't yet received and accepted
 * (design §8.5): the **sent, not yet received** list that each `garbageReceived` is checked
 * against, and `GARBAGE_ACK_TIMEOUT` for each attack until it has left the player's garbage meter,
 * landed in full or cancelled.
 */
export class IncomingGarbage {
  /** Oldest first. */
  #attacks: Tracked[] = [];

  /** The server sent `attack` to the player. */
  send(attack: SentAttack): void {
    this.#attacks.push({ ...attack, receivedAt: null });
  }

  /**
   * The attacks sent and not yet received in a verified batch, oldest first: what a player who
   * comes back mid-match may have missed the `garbageQueued` of (design §10.2).
   */
  unreceived(): SentAttack[] {
    return this.#attacks
      .filter(({ receivedAt }) => receivedAt === null)
      .map(({ id, from, lines, holeSeed, sentAt }) => ({ id, from, lines, holeSeed, sentAt }));
  }

  /**
   * Whether every `garbageReceived` in `actions` names an attack sent to the player and not yet
   * received, with the lines and hole seed it was sent with. Those that do are received at their
   * frame. One that doesn't, or names an attack never sent, is a bad batch.
   */
  receive(actions: readonly Action[]): boolean {
    for (const action of actions) {
      if (action.type !== ActionType.GarbageReceived) continue;
      const attack = this.#attacks.find(({ id }) => id === action.id);
      if (
        !attack ||
        attack.receivedAt !== null ||
        attack.lines !== action.lines ||
        attack.holeSeed !== action.holeSeed
      ) {
        return false;
      }
      attack.receivedAt = action.frame;
    }
    return true;
  }

  /** The frames after `from`, up to `to`, at which an attack's timeout runs out, in order. */
  deadlines(from: number, to: number): number[] {
    const frames = this.#attacks
      .map(({ sentAt }) => sentAt + GARBAGE_ACK_TIMEOUT)
      .filter((frame) => frame > from && frame <= to);
    return [...new Set(frames)].sort((a, b) => a - b);
  }

  /**
   * The oldest attack whose timeout has run out by `frame`, the player's verified frame, without
   * being received and accepted, given their garbage meter at that frame. Attacks that have been
   * are forgotten.
   */
  overdue(frame: number, meter: readonly GarbageEntry[]): SentAttack | undefined {
    const inMeter = new Set(meter.map(({ id }) => id));
    this.#attacks = this.#attacks.filter(
      ({ id, receivedAt }) => receivedAt === null || receivedAt > frame || inMeter.has(id),
    );
    return this.#attacks.find(({ sentAt }) => sentAt + GARBAGE_ACK_TIMEOUT <= frame);
  }
}
