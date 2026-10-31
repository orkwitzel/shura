import { runCommand } from './app/commands';

process.exitCode = await runCommand(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  // Loaded only to play, so the help, the version and a mistake don't wait for React and Ink.
  play: async (options) => (await import('./app/run')).runApp(options),
});
