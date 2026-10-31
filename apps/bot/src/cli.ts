// `pnpm bot …`: asks the running bot tool (`pnpm dev:bot`) for bots. Testing only (design §13.4).
import { runCommand } from './command';

process.exitCode = await runCommand(process.argv.slice(2), {
  url: process.env.BOT_URL ?? 'http://localhost:8090',
  fetch,
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
});
