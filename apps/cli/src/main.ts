import { runCommand } from './app/commands';
import { runApp } from './app/run';

process.exitCode = await runCommand(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  play: runApp,
});
