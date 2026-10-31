import pkg from '../package.json' with { type: 'json' };
import { HELP, parseCommand } from './args';
import { runSolo } from './run';

const command = parseCommand(process.argv.slice(2));

switch (command.kind) {
  case 'version':
    console.log(pkg.version);
    break;
  case 'help':
    console.log(HELP);
    break;
  case 'solo':
    process.exitCode = await runSolo(command);
    break;
  case 'error':
    console.error(`${command.message}\n\n${HELP}`);
    process.exitCode = 2;
    break;
}
