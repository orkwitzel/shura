import { parseRoomCode } from '@shura/protocol';
import { Command, CommanderError, InvalidArgumentError, Option } from 'commander';

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
}

/** One call to the bot tool's HTTP API, and what to print of its answer. */
interface ApiRequest {
  readonly path: string;
  readonly method: string;
  readonly body?: unknown;
  readonly done: (answer: never) => string;
}

/** The options every command that adds bots takes. */
interface BotOptions {
  readonly count: number;
  readonly profile: string;
  readonly pps?: number;
}

/** A room code as the protocol parses it, any case. */
function roomCode(text: string): string {
  const code = parseRoomCode(text);
  if (code === undefined) throw new InvalidArgumentError(`"${text}" isn't a room code.`);
  return code;
}

function wholeNumber(text: string): number {
  const count = Number(text);
  if (!Number.isInteger(count) || count < 1)
    throw new InvalidArgumentError('a whole number, 1 or more');
  return count;
}

function positiveNumber(text: string): number {
  const pps = Number(text);
  if (!(pps > 0)) throw new InvalidArgumentError('a positive number');
  return pps;
}

/** `Ada`, `Ada and Turing`, `Ada, Turing and Hopper`. */
const LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });

function names(bots: readonly BotListing[]): string {
  return bots.length === 0 ? 'No bots' : LIST.format(bots.map(({ name }) => name));
}

/** `--count`, `--profile` and `--pps`, on a command that adds bots. */
function addingBots(command: Command): Command {
  return command
    .addOption(new Option('--count <n>', 'how many bots').default(1).argParser(wholeNumber))
    .option('--profile <name>', 'how they play', 'casual')
    .addOption(new Option('--pps <n>', 'pieces per second to aim for').argParser(positiveNumber));
}

/** The body's bots: how many, how they play, and the pace if asked for. */
const botsOf = ({ count, profile, pps }: BotOptions) => ({
  count,
  profile,
  ...(pps !== undefined && { pps }),
});

/**
 * `pnpm bot`: a small client of the bot tool's HTTP API (design §13.4), on Commander. Returns the
 * exit code: 0 done (or the help), 1 the tool refused or couldn't be reached, 2 bad arguments, which
 * print what was wrong and the help.
 */
export async function runCommand(
  argv: readonly string[],
  context: CommandContext,
): Promise<number> {
  let request: ApiRequest | null = null;
  const program = new Command()
    .name('pnpm bot')
    .description('Testing tool only: asks the bot tool (pnpm dev:bot) for bots.')
    .configureOutput({ writeOut: context.out, writeErr: context.err })
    .exitOverride()
    .showHelpAfterError()
    .helpCommand(false)
    .addHelpText('after', '\nThe tool’s address is BOT_URL (default http://localhost:8090).');

  addingBots(program.command('join').description('bots join room CODE'))
    .argument('<CODE>', 'the room code', roomCode)
    .action((code: string, options: BotOptions) => {
      request = {
        path: '/bots',
        method: 'POST',
        body: { room: code, ...botsOf(options) },
        done: ({ bots: added }: { bots: BotListing[] }) =>
          `${names(added)} ${added.length === 1 ? 'is' : 'are'} joining ${code}.\n`,
      };
    });
  program
    .command('leave')
    .description("removes room CODE's bots")
    .argument('<CODE>', 'the room code', roomCode)
    .action((code: string) => {
      request = {
        path: `/bots?room=${code}`,
        method: 'DELETE',
        done: ({ removed }: { removed: number }) =>
          `Removed ${removed} bot${removed === 1 ? '' : 's'} from ${code}.\n`,
      };
    });
  program
    .command('list')
    .description('lists the bots')
    .action(() => {
      request = {
        path: '/bots',
        method: 'GET',
        done: ({ bots: listed }: { bots: BotListing[] }) =>
          listed.length === 0
            ? 'No bots.\n'
            : listed
                .map(({ name, profile, room }) => `${[name, profile, room].join('  ')}\n`)
                .join(''),
      };
    });

  try {
    await program.parseAsync([...argv], { from: 'user' });
  } catch (error) {
    if (!(error instanceof CommanderError)) throw error;
    return error.exitCode === 0 ? 0 : 2;
  }
  // Commander has printed the help and thrown for anything else, so a command has run.
  const asked = request as ApiRequest | null;
  if (!asked) return 2;
  return send(asked, context);
}

async function send(request: ApiRequest, context: CommandContext): Promise<number> {
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
