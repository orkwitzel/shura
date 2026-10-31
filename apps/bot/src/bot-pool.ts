import { type Connect, createOnlineSession, type TimerClock } from '@shura/client-core';
import type { Logger } from 'pino';
import { type Bot, type BotTarget, startBot } from './bot';
import { BOT_PROFILES, type BotProfileName } from './profile';
import { seededRandom } from './random';

/** Bots' names, given in order to the bots alive (design §13.4). */
export const BOT_NAMES = [
  'Ada',
  'Turing',
  'Hopper',
  'Lovelace',
  'Knuth',
  'Dijkstra',
  'Liskov',
  'Hamilton',
  'Babbage',
  'Shannon',
  'Ritchie',
  'Thompson',
  'Kay',
  'Wirth',
  'Backus',
  'Perlis',
] as const;

/** Bots to add: `count` of them in one room, or each in quick-match. */
export interface BotRequest {
  readonly target: BotTarget;
  readonly count: number;
  readonly profile: BotProfileName;
  readonly pps?: number;
}

/** A bot as the API lists it. */
export interface BotInfo {
  readonly name: string;
  readonly profile: BotProfileName;
  readonly room?: string;
  readonly quickMatch?: true;
  readonly pps?: number;
}

/** The bot tool's bots: added and removed through its HTTP API. */
export interface BotPool {
  add(request: BotRequest): BotInfo[];
  /** Removes every bot in the room with `code`. Returns how many. */
  remove(code: string): number;
  list(): BotInfo[];
  /** Stops every bot. */
  close(): void;
}

export interface BotPoolOptions {
  /** The gateway's public WebSocket URL. */
  readonly url: string;
  readonly connect: Connect;
  readonly clock: TimerClock;
  readonly logger: Logger;
  /** Seeds the bots' seeds. */
  readonly seed: number;
  readonly clientVersion: string;
}

interface Entry {
  readonly bot: Bot;
  readonly info: BotInfo;
}

export function createBotPool(options: BotPoolOptions): BotPool {
  const random = seededRandom(options.seed);
  const entries = new Set<Entry>();

  const nameFree = (name: string) => ![...entries].some(({ info }) => info.name === name);
  const nextName = (): string => {
    for (let round = 1; ; round++) {
      for (const base of BOT_NAMES) {
        const name = round === 1 ? base : `${base} ${round}`;
        if (nameFree(name)) return name;
      }
    }
  };

  const addOne = ({ target, profile, pps }: BotRequest): BotInfo => {
    const name = nextName();
    const info: BotInfo = {
      name,
      profile,
      ...target,
      ...(pps !== undefined && { pps }),
    };
    const session = createOnlineSession({
      url: options.url,
      connect: options.connect,
      clock: options.clock,
      nickname: name,
      clientVersion: options.clientVersion,
      kind: 'bot',
    });
    const seed = Math.floor(random() * 2 ** 32);
    const log = options.logger.child({ bot: name, ...target });
    const entry: Entry = {
      info,
      bot: startBot({
        session,
        clock: options.clock,
        profile: BOT_PROFILES[profile],
        seed,
        target,
        ...(pps !== undefined && { pps }),
        ended(end, message) {
          entries.delete(entry);
          log.warn({ end, message }, 'bot stopped');
        },
      }),
    };
    entries.add(entry);
    log.info({ seed, profile, pps }, 'bot started');
    return info;
  };

  return {
    add: (request) => Array.from({ length: request.count }, () => addOne(request)),
    remove(code) {
      let removed = 0;
      for (const entry of [...entries]) {
        if (entry.info.room !== code) continue;
        entries.delete(entry);
        entry.bot.stop();
        removed++;
      }
      if (removed > 0) options.logger.info({ room: code, removed }, 'bots removed');
      return removed;
    },
    list: () => [...entries].map(({ info }) => info),
    close() {
      for (const { bot } of entries) bot.stop();
      entries.clear();
    },
  };
}
