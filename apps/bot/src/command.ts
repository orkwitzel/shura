import { parseArgs } from 'node:util';
import { parseRoomCode } from '@shura/protocol';

export const USAGE = `Testing tool only: asks the bot tool (pnpm dev:bot) for bots.

  pnpm bot join <CODE> [--count N] [--profile casual] [--pps N]   bots join room CODE
  pnpm bot quick [--count N] [--profile casual] [--pps N]         bots quick-match
  pnpm bot leave <CODE>                                           removes room CODE's bots
  pnpm bot list                                                   lists the bots

The tool's address is BOT_URL (default http://localhost:8090).
`;

export interface CommandContext {
  /** The bot tool's base URL. */
  readonly url: string;
  readonly fetch: typeof fetch;
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

interface BotListing {
  name: string;
  profile?: string;
  room?: string;
  quickMatch?: boolean;
}

/** Thrown for arguments that don't make a command. */
class UsageError extends Error {}

/**
 * `pnpm bot`: a small client of the bot tool's HTTP API (design §13.4). Returns the exit code: 0
 * done, 1 the tool refused or couldn't be reached, 2 bad arguments.
 */
export async function runCommand(
  argv: readonly string[],
  context: CommandContext,
): Promise<number> {
  let request: { path: string; method: string; body?: unknown; done: (answer: never) => string };
  try {
    request = parse(argv);
  } catch (error) {
    if (!(error instanceof UsageError || error instanceof TypeError)) throw error;
    context.err(`${error.message}\n\n${USAGE}`);
    return 2;
  }
  let res: Response;
  try {
    res = await context.fetch(`${context.url}${request.path}`, {
      method: request.method,
      headers: { 'content-type': 'application/json' },
      ...(request.body !== undefined && { body: JSON.stringify(request.body) }),
    });
  } catch {
    context.err(`Can't reach the bot tool at ${context.url}. Start it with pnpm dev:bot.\n`);
    return 1;
  }
  const answer = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    context.err(`The bot tool refused (${res.status}): ${answer.error ?? 'no reason given'}\n`);
    return 1;
  }
  context.out(request.done(answer as never));
  return 0;
}

function parse(argv: readonly string[]) {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      count: { type: 'string', default: '1' },
      profile: { type: 'string', default: 'casual' },
      pps: { type: 'string' },
    },
  });
  const [command, code, ...rest] = positionals;
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1) throw new UsageError('--count must be a whole number');
  const pps = values.pps === undefined ? undefined : Number(values.pps);
  if (pps !== undefined && !(pps > 0)) throw new UsageError('--pps must be a positive number');
  const bots = { count, profile: values.profile, ...(pps !== undefined && { pps }) };
  const room = () => {
    const parsed = parseRoomCode(code ?? '');
    if (parsed === undefined || rest.length > 0)
      throw new UsageError(`${command} needs one room code`);
    return parsed;
  };
  switch (command) {
    case 'join': {
      const parsed = room();
      return {
        path: '/bots',
        method: 'POST',
        body: { room: parsed, ...bots },
        done: ({ bots: added }: { bots: BotListing[] }) =>
          `${names(added)} ${added.length === 1 ? 'is' : 'are'} joining ${parsed}.\n`,
      };
    }
    case 'quick':
      if (code !== undefined) throw new UsageError('quick takes no room code');
      return {
        path: '/bots',
        method: 'POST',
        body: { quickMatch: true, ...bots },
        done: ({ bots: added }: { bots: BotListing[] }) =>
          `${names(added)} ${added.length === 1 ? 'is' : 'are'} quick-matching.\n`,
      };
    case 'leave': {
      const parsed = room();
      return {
        path: `/bots?room=${parsed}`,
        method: 'DELETE',
        done: ({ removed }: { removed: number }) =>
          `Removed ${removed} bot${removed === 1 ? '' : 's'} from ${parsed}.\n`,
      };
    }
    case 'list':
      return {
        path: '/bots',
        method: 'GET',
        done: ({ bots: listed }: { bots: BotListing[] }) =>
          listed.length === 0
            ? 'No bots.\n'
            : listed
                .map(({ name, profile, room: at, quickMatch }) =>
                  [name, profile, quickMatch ? 'quick-match' : at].join('  '),
                )
                .map((line) => `${line}\n`)
                .join(''),
      };
    default:
      throw new UsageError(command ? `unknown command ${command}` : 'no command given');
  }
}

/** `Ada`, `Ada and Turing`, `Ada, Turing and Hopper`. */
function names(bots: readonly BotListing[]): string {
  const all = bots.map(({ name }) => name);
  const last = all.pop();
  return all.length === 0 ? (last ?? 'No bots') : `${all.join(', ')} and ${last}`;
}
