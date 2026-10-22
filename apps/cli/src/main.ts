// Command tree and the run loop. main() never exits the process: it returns the exit code, so tests
// can run any command in-process with a fake CliIo and the API handler as fetch.
import { Command, CommanderError } from 'commander';
import pkg from '../package.json' with { type: 'json' };
import { login, logout, whoami } from './commands/auth';
import { listProjects } from './commands/projects';
import { collectList, createTask, listTasks, showTask, updateTask } from './commands/tasks';
import { type CommandContext, createContext, reportError } from './context';
import { EXIT, toCliError, usageError } from './errors';
import type { CliIo } from './io';

const STATUS_HELP = 'backlog, todo, in_progress, in_review, done, canceled';
const PRIORITY_HELP = 'none, low, medium, high, urgent';

/** True when --json appears before a `--` separator. */
function wantsJson(argv: readonly string[]): boolean {
  const end = argv.indexOf('--');
  return (end === -1 ? argv : argv.slice(0, end)).includes('--json');
}

export function buildProgram(context: CommandContext): Command {
  const { io } = context;
  const program = new Command('pm');

  // Settings set here are copied to every subcommand created afterwards.
  program
    .description('Command-line client for project-management. Every command takes --json.')
    .version(pkg.version, '-v, --version')
    .exitOverride()
    .showHelpAfterError(context.json ? false : '(add --help for usage)')
    .configureOutput({
      writeOut: (text) => io.stdout(text),
      writeErr: (text) => io.stderr(text),
      // With --json the error goes to stdout as pm.v1.error instead.
      outputError: (text, write) => {
        if (!context.json) write(text);
      },
      getOutHelpWidth: () => io.columns ?? 100,
      getErrHelpWidth: () => io.columns ?? 100,
      getOutHasColors: () => false,
      getErrHasColors: () => false,
    })
    .addHelpText(
      'after',
      `
Credentials: pm login stores the server URL and key in $XDG_CONFIG_HOME/pm/config.json
(~/.config/pm/config.json). PM_URL and PM_KEY override it.

Exit codes: 0 ok, 1 usage, 2 auth, 3 not found, 4 forbidden, 5 server.`,
    );

  const leaf = (command: Command) => command.option('--json', 'print the versioned JSON result (pm.v1.*)');

  leaf(
    program
      .command('login')
      .description('check an API key against the server and store it')
      .requiredOption('--key <key>', 'API key (pm_live_...); "-" reads it from stdin')
      .option('--url <server>', 'server URL (default: PM_URL, the stored URL, or http://localhost:3000)'),
  ).action((options: { key: string; url?: string }) => login(context, options));

  leaf(program.command('logout').description('remove the stored URL and key')).action(() => logout(context));

  leaf(program.command('whoami').description('show the user, workspace and key scope')).action(() =>
    whoami(context),
  );

  const projects = program.command('projects').description('list projects');
  leaf(projects.command('list').description('list projects with open task counts')).action(() =>
    listProjects(context),
  );

  const tasks = program.command('tasks').description('list, show, create and update tasks');
  leaf(
    tasks
      .command('list')
      .description('list tasks of a project')
      .requiredOption('--project <KEY>', 'project key, e.g. PAY')
      .option(
        '--status <status>',
        `filter by status, repeatable or comma-separated: ${STATUS_HELP}`,
        collectList,
      )
      .option('--assignee <who>', 'me, agents, or a member name, email or id')
      .option('--limit <n>', 'tasks per page, 1 to 200 (default 50)')
      .option('--cursor <cursor>', 'next page, from the previous result'),
  ).action((options) => listTasks(context, options));

  leaf(
    tasks.command('show').description('show a task with its activity').argument('<TASK-KEY>', 'e.g. PAY-142'),
  ).action((key: string) => showTask(context, key));

  leaf(
    tasks
      .command('create')
      .description('create a task')
      .argument('<title...>', 'task title (quote it, or pass the words)')
      .requiredOption('--project <KEY>', 'project key, e.g. PAY')
      .option('--description <text>', 'Markdown description; "-" reads it from stdin')
      .option('--priority <priority>', PRIORITY_HELP)
      .option('--assignee <who>', 'me, or a member name, email or id')
      .option('--status <status>', `${STATUS_HELP} (default todo)`),
  ).action((title: string[], options) => createTask(context, title, options));

  leaf(
    tasks
      .command('update')
      .description('change a task; send only what changes')
      .argument('<TASK-KEY>', 'e.g. PAY-142')
      .option('--status <status>', STATUS_HELP)
      .option('--priority <priority>', PRIORITY_HELP)
      .option('--assignee <who>', 'me, or a member name, email or id')
      .option('--unassign', 'remove the assignee')
      .option('--title <title>', 'new title')
      .option('--description <text>', 'new Markdown description; "-" reads it from stdin'),
  ).action((key: string, options) => updateTask(context, key, options));

  return program;
}

/** Runs one pm invocation and returns its exit code. `argv` excludes node and the script path. */
export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  const context = createContext(io, wantsJson(argv));
  const program = buildProgram(context);
  try {
    await program.parseAsync([...argv], { from: 'user' });
    return EXIT.ok;
  } catch (error) {
    if (error instanceof CommanderError) {
      // --help and --version end here with exit code 0.
      if (error.exitCode === 0) return EXIT.ok;
      // Commander already printed the message (unless --json); with --json print the envelope.
      if (context.json) reportError(context, usageError(error.message.replace(/^error: /, '')));
      return EXIT.usage;
    }
    const failure = toCliError(error, context.url);
    reportError(context, failure);
    return failure.exitCode;
  }
}
