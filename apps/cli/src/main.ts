import { parseCommand } from './app/args';
import { runCommand } from './app/commands';
import { runApp } from './app/run';

process.exitCode = await runCommand(parseCommand(process.argv.slice(2)), {
  out: (text) => console.log(text),
  err: (text) => console.error(text),
  play: runApp,
});
