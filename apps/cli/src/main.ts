// Command tree and the run loop. main() never exits the process: it returns the exit code, so tests
// can run any command in-process with a fake CliIo and the API handler as fetch.
import { Command, CommanderError } from 'commander';
import pkg from '../package.json' with { type: 'json' };
import { agents } from './commands/agents';
import { login, logout, whoami } from './commands/auth';
import { addComment, deleteComment, editComment, listComments } from './commands/comments';
import { createCycle, currentCycle, endCycle, listCycles } from './commands/cycles';
import { showDashboard } from './commands/dashboard';
import { link } from './commands/link';
import { createMilestone, listMilestones, updateMilestone } from './commands/milestones';
import { listProjects } from './commands/projects';
import { collectKeys, collectList } from './commands/shared';
import { createTask, listTasks, showTask, updateTask } from './commands/tasks';
import { type CommandContext, createContext, reportError } from './context';
import { EXIT, toCliError, usageError } from './errors';
import type { CliIo } from './io';

const STATUS_HELP = 'backlog, todo, in_progress, in_review, done, canceled';
const PRIORITY_HELP = 'none, low, medium, high, urgent';
const MILESTONE_STATUS_HELP = 'planned, active, completed';
const PROJECT_HELP = "project key, e.g. PAY (default: PM_PROJECT, .pm.json or this clone's linked project)";

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

Project: commands that need one take --project, then PM_PROJECT, then the nearest .pm.json, then
the project linked to this clone's git remote (pm link). pm whoami shows which one applies here.

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

  leaf(
    program.command('whoami').description('show the user, workspace, key scope and the project used here'),
  ).action(() => whoami(context));

  leaf(
    program
      .command('link')
      .description("link a project to this clone's git remote, so pm picks it in every clone")
      .option('--project <KEY>', 'project to link (default: PM_PROJECT or .pm.json)')
      .option('--force', 'replace a different repository already linked to the project')
      .option('--clear', "unlink the project's repository (default project: this clone's)")
      .option('--file', 'write .pm.json at the repository root instead of linking on the server')
      .option('--here', 'with --file: write .pm.json in this folder (monorepo subprojects)'),
  ).action((options) => link(context, options));

  leaf(
    program
      .command('agents')
      .description('write pm usage instructions into AGENTS.md (or CLAUDE.md) between pm markers')
      .option('--file <path>', 'file to write (default: AGENTS.md, else CLAUDE.md, at the repository root)')
      .option('--project <KEY>', "project to name in the instructions (default: this clone's)")
      .option('--print', 'print the instructions instead of writing a file'),
  ).action((options) => agents(context, options));

  leaf(
    program
      .command('dashboard')
      .description(
        'what needs you now across every project: in review, mentions, stalled work and deadlines; ' +
          'then projects and agents',
      )
      .option('--everyone', 'the whole workspace instead of your tasks, your agents and mentions of you'),
  ).action((options: { everyone?: boolean }) => showDashboard(context, options));

  const projects = program.command('projects').description('list projects');
  leaf(projects.command('list').description('list projects with open task counts')).action(() =>
    listProjects(context),
  );

  const tasks = program.command('tasks').description('list, show, create and update tasks');
  leaf(
    tasks
      .command('list')
      .description('list tasks of one or more projects, or of every project you can read')
      .option(
        '--project <KEY>',
        'project key, e.g. PAY; repeatable or comma-separated (default: every project)',
        collectKeys,
      )
      .option('--mine', 'only tasks assigned to you (same as --assignee me)')
      .option(
        '--status <status>',
        `filter by status, repeatable or comma-separated: ${STATUS_HELP}`,
        collectList,
      )
      .option('--assignee <who>', 'me, agents, or a member name, email or id')
      .option(
        '--milestone <name>',
        "milestone name (in one --project, else this clone's project) or id; none for tasks without one",
      )
      .option('--cycle <cycle>', 'cycle number, current, next, or none for tasks without one')
      .option('--limit <n>', 'tasks per page, 1 to 200 (default 50)')
      .option('--cursor <cursor>', 'next page, from the previous result'),
  ).action((options) => listTasks(context, options));

  leaf(
    tasks
      .command('show')
      .description('show a task with its history: activity and comments, oldest first')
      .argument('<TASK-KEY>', 'e.g. PAY-142'),
  ).action((key: string) => showTask(context, key));

  leaf(
    tasks
      .command('create')
      .description('create a task')
      .argument('<title...>', 'task title (quote it, or pass the words)')
      .option('--project <KEY>', PROJECT_HELP)
      .option('--description <text>', 'Markdown description; "-" reads it from stdin')
      .option('--priority <priority>', PRIORITY_HELP)
      .option('--assignee <who>', 'me, or a member name, email or id')
      .option('--status <status>', `${STATUS_HELP} (default todo)`)
      .option('--milestone <name>', 'milestone of the project, by name or id')
      .option('--cycle <cycle>', 'cycle number, current or next'),
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
      .option('--description <text>', 'new Markdown description; "-" reads it from stdin')
      .option('--milestone <name>', "milestone of the task's project, by name or id; none clears it")
      .option('--cycle <cycle>', 'cycle number, current or next; none clears it'),
  ).action((key: string, options) => updateTask(context, key, options));

  const comments = program.command('comments').description('list, add, edit and delete task comments');
  leaf(
    comments
      .command('list')
      .description('list the comments of a task, oldest first')
      .argument('<TASK-KEY>', 'e.g. PAY-142'),
  ).action((key: string) => listComments(context, key));

  leaf(
    comments
      .command('add')
      .description('comment on a task; @agent-name and @email mention members')
      .argument('<TASK-KEY>', 'e.g. PAY-142')
      .argument('<body>', 'Markdown body (quote it); "-" reads it from stdin'),
  ).action((key: string, body: string) => addComment(context, key, body));

  leaf(
    comments
      .command('edit')
      .description('replace the body of your own comment')
      .argument('<comment-id>', 'id from pm comments list or pm tasks show')
      .argument('<body>', 'new Markdown body (quote it); "-" reads it from stdin'),
  ).action((id: string, body: string) => editComment(context, id, body));

  leaf(
    comments
      .command('delete')
      .description('delete your own comment (the timeline keeps a placeholder)')
      .argument('<comment-id>', 'id from pm comments list or pm tasks show'),
  ).action((id: string) => deleteComment(context, id));

  const milestones = program.command('milestones').description('list, create and update milestones');
  leaf(
    milestones
      .command('list')
      .description('list the milestones of a project with progress')
      .option('--project <KEY>', PROJECT_HELP),
  ).action((options) => listMilestones(context, options));

  leaf(
    milestones
      .command('create')
      .description('create a milestone (starts Planned)')
      .argument('<name...>', 'milestone name (quote it, or pass the words)')
      .option('--project <KEY>', PROJECT_HELP)
      .option('--target <date>', 'target date, YYYY-MM-DD')
      .option('--description <text>', 'Markdown description; "-" reads it from stdin'),
  ).action((name: string[], options) => createMilestone(context, name, options));

  leaf(
    milestones
      .command('update')
      .description('change a milestone; send only what changes')
      .argument('<id-or-name>', 'milestone id, or its name (case-insensitive) with --project')
      .option('--project <KEY>', "project to find the milestone name in (default: this clone's)")
      .option('--name <name>', 'new name')
      .option('--target <date>', 'target date, YYYY-MM-DD; none clears it')
      .option('--status <status>', `${MILESTONE_STATUS_HELP}; leaving completed reopens it as active`)
      .option('--description <text>', 'Markdown description; "-" reads it from stdin, "" clears it'),
  ).action((idOrName: string, options) => updateMilestone(context, idOrName, options));

  const cycles = program.command('cycles').description('list, create, show and end cycles');
  leaf(
    cycles
      .command('list')
      .description('list the cycles of a project, oldest first')
      .option('--project <KEY>', PROJECT_HELP),
  ).action((options) => listCycles(context, options));

  leaf(
    cycles
      .command('create')
      .description('create a cycle; dates default to the day after the last cycle, same length')
      .option('--project <KEY>', PROJECT_HELP)
      .option('--starts <date>', 'first day, YYYY-MM-DD')
      .option('--ends <date>', 'last day, YYYY-MM-DD (1 to 56 days in all)')
      .option('--name <name>', 'optional name'),
  ).action((options) => createCycle(context, options));

  leaf(
    cycles
      .command('current')
      .description("show the project's current cycle (null with --json when there is none)")
      .option('--project <KEY>', PROJECT_HELP),
  ).action((options) => currentCycle(context, options));

  leaf(
    cycles
      .command('end')
      .description('end a cycle now; unfinished tasks move to the next cycle')
      .argument('[number]', 'cycle number (default: the current cycle)')
      .option('--project <KEY>', PROJECT_HELP)
      .option(
        '--move-to <cycle>',
        'cycle number for unfinished tasks, or none (default: next upcoming cycle, else a new one)',
      ),
  ).action((number: string | undefined, options) => endCycle(context, number, options));

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
