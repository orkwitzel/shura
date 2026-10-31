import { parseCommand } from './args';
import { runCommand } from './commands';
import { runApp } from './run';

process.exitCode = await runCommand(parseCommand(process.argv.slice(2)), {
  out: (text) => console.log(text),
  err: (text) => console.error(text),
  play: runApp,
});
