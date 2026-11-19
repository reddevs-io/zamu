// M5 task fields from the CLI: labels (zamu labels and --label), due dates, subtasks and blockers, in
// process against the real /api/v1 handler on a throwaway database with the dev seed (PAY with 11
// tasks, WEB with 4). Each test makes its own tasks so the order of tests doesn't matter. Every
// --json result is checked against the contract's CLI output schemas.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CliData, type CliResultName, parseCliOutput } from '@zamu/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../../../packages/db/test/index';
import { createApiFetchHandler } from '../../web/src/server/api/handler';
import { createServerContext, type ServerContext } from '../../web/src/server/context';
import { seedDevData } from '../../web/src/server/seed';
import type { CliIo, FetchLike } from '../src/io';
import { main } from '../src/main';

const URL = 'http://zamu.test';
const SECRET = 'test-secret-test-secret-test-secret-0123';

let database: TestDatabase;
let server: ServerContext;
let handle: FetchLike;
let home: string;
let key: string;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function zamu(args: string[], options: { fetch?: FetchLike } = {}): Promise<RunResult> {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    readStdin: async () => '',
    env: { XDG_CONFIG_HOME: join(home, 'xdg'), ZAMU_URL: URL, ZAMU_KEY: key },
    homeDir: home,
    cwd: home,
    isTTY: false,
    fetch: options.fetch ?? handle,
  };
  const code = await main(args, io);
  return { code, stdout: out.join(''), stderr: err.join('') };
}

function parsed<N extends CliResultName>(result: RunResult, name: N): CliData<N> {
  expect(result.code, result.stdout + result.stderr).toBe(name === 'error' ? result.code : 0);
  expect(result.stdout.trim().split('\n'), 'one JSON line when piped').toHaveLength(1);
  return (parseCliOutput(JSON.parse(result.stdout), name) as { data: CliData<N> }).data;
}

function expectFailure(result: RunResult, exitCode: number, code: string) {
  expect(result.code, result.stdout + result.stderr).toBe(exitCode);
  const error = parsed(result, 'error');
  expect(error.code).toBe(code);
  return error;
}

/** Fails the test if zamu calls the server. */
const offline: FetchLike = () => {
  throw new Error('must not be called');
};

async function createTask(title: string, ...flags: string[]) {
  return parsed(
    await zamu(['tasks', 'create', '--project', 'PAY', title, ...flags, '--json']),
    'tasks.create',
  );
}

beforeAll(async () => {
  database = await createTestDatabase({ prefix: 'pm_cli_fields' });
  database.pool.on('error', () => {});
  server = createServerContext({
    DATABASE_URL: database.url,
    BETTER_AUTH_SECRET: SECRET,
    BETTER_AUTH_URL: URL,
    PUBLIC_URL: URL,
  });
  handle = createApiFetchHandler(server);
  key = (await seedDevData(server, { planning: true })).agentKey;
}, 60_000);

afterAll(async () => {
  await server?.pool.end();
  await database?.drop();
});

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'zamu-cli-fields-'));
  return () => rm(home, { recursive: true, force: true });
});

describe('zamu labels', () => {
  it('creates, lists, renames, recolours and deletes a label', async () => {
    const created = parsed(
      await zamu(['labels', 'create', '--project', 'pay', 'Needs', 'design', '--color', '4', '--json']),
      'labels.create',
    );
    expect(created).toMatchObject({ name: 'Needs design', color: 4, source: 'app', usageCount: 0 });

    const human = await zamu(['labels', 'create', '--project', 'PAY', 'infra']);
    expect(human.code, human.stderr).toBe(0);
    expect(human.stdout).toContain('Created label infra in PAY');
    expect(human.stdout).toMatch(/Usage\s+Not used/);

    await createTask('Label me', '--label', 'needs design');
    const list = parsed(await zamu(['labels', 'list', '--project', 'PAY', '--json']), 'labels.list');
    expect(list.items.map((l) => [l.name, l.usageCount])).toEqual(
      expect.arrayContaining([
        ['Needs design', 1],
        ['infra', 0],
      ]),
    );
    const table = await zamu(['labels', 'list', '--project', 'PAY']);
    expect(table.stdout.split('\n')[0]).toMatch(/^NAME\s+COLOUR\s+TASKS\s+SOURCE$/);
    expect(table.stdout).toMatch(/Needs design\s+4\s+1\s+App/);

    // By name, ignoring case; then by id.
    const renamed = parsed(
      await zamu(['labels', 'update', 'NEEDS DESIGN', '--project', 'PAY', '--name', 'design', '--json']),
      'labels.update',
    );
    expect(renamed).toMatchObject({ id: created.id, name: 'design', color: 4, usageCount: 1 });
    const recoloured = parsed(
      await zamu(['labels', 'update', created.id, '--project', 'PAY', '--color', '7', '--json']),
      'labels.update',
    );
    expect(recoloured.color).toBe(7);

    const deleted = parsed(
      await zamu(['labels', 'delete', 'design', '--project', 'PAY', '--confirm', 'Design', '--json']),
      'labels.delete',
    );
    expect(deleted).toEqual({
      deleted: { id: created.id, name: 'design', color: 7, source: 'app' },
      usageCount: 1,
    });
    const after = parsed(await zamu(['labels', 'list', '--project', 'PAY', '--json']), 'labels.list');
    expect(after.items.map((l) => l.name)).not.toContain('design');

    const humanDelete = await zamu(['labels', 'delete', 'infra', '--project', 'PAY', '--confirm', 'infra']);
    expect(humanDelete.stdout).toBe('Deleted label infra from PAY\n');
  });

  it('deletes nothing without --confirm or with another name (exit 1)', async () => {
    await zamu(['labels', 'create', '--project', 'PAY', 'keep', 'me']);
    const missing = await zamu(['labels', 'delete', 'keep me', '--project', 'PAY']);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('zamu: Pass --confirm "keep me" to delete label keep me from PAY.');
    expect(missing.stderr).toContain('Not used; deleting takes it off every task.');
    const wrong = await zamu([
      'labels',
      'delete',
      'keep me',
      '--project',
      'PAY',
      '--confirm',
      'keep',
      '--json',
    ]);
    expect(expectFailure(wrong, 1, 'BAD_REQUEST').issues).toEqual([
      { path: 'confirm', message: 'Type the label name to confirm' },
    ]);
    const list = parsed(await zamu(['labels', 'list', '--project', 'PAY', '--json']), 'labels.list');
    expect(list.items.map((l) => l.name)).toContain('keep me');
  });

  it('fails on a name the project has (exit 1), an unknown label (exit 3) and a bad colour (exit 1)', async () => {
    await zamu(['labels', 'create', '--project', 'PAY', 'dupe']);
    expectFailure(await zamu(['labels', 'create', '--project', 'PAY', 'DUPE', '--json']), 1, 'LABEL_EXISTS');

    const unknown = await zamu(['labels', 'update', 'nope', '--project', 'PAY', '--color', '2']);
    expect(unknown.code).toBe(3);
    expect(unknown.stderr).toContain('zamu: No label named "nope" in PAY.');
    expect(unknown.stderr).toMatch(/Labels in PAY: .*"dupe"/);

    const color = await zamu(['labels', 'create', '--project', 'PAY', 'hue', '--color', 'red', '--json'], {
      fetch: offline,
    });
    expect(expectFailure(color, 1, 'BAD_REQUEST').issues?.[0]?.path).toBe('color');
    const nothing = await zamu(['labels', 'update', 'dupe', '--project', 'PAY', '--json'], {
      fetch: offline,
    });
    expectFailure(nothing, 1, 'BAD_REQUEST');
  });

  it('keeps the name of a label from Backlog.md: exit 6 on rename, colour still changes', async () => {
    const label = parsed(
      await zamu(['labels', 'create', '--project', 'PAY', 'from-files', '--json']),
      'labels.create',
    );
    await database.pool.query(`update label set source = 'backlog' where id = $1`, [label.id]);

    const rename = await zamu([
      'labels',
      'update',
      'from-files',
      '--project',
      'PAY',
      '--name',
      'x',
      '--json',
    ]);
    expectFailure(rename, 6, 'LABEL_MIRRORED');
    const recolour = parsed(
      await zamu(['labels', 'update', 'from-files', '--project', 'PAY', '--color', '9', '--json']),
      'labels.update',
    );
    expect(recolour).toMatchObject({ color: 9, source: 'backlog' });
    const list = await zamu(['labels', 'list', '--project', 'PAY']);
    expect(list.stdout).toMatch(/from-files\s+9\s+0\s+Backlog\.md/);
  });
});

describe('zamu tasks with labels and due dates', () => {
  it('creates a task with labels and a due date, then adds, removes and clears them', async () => {
    const task = await createTask('Rotate signing keys', '--label', 'security,Ops', '--due', '2031-03-01');
    expect(task.labels?.map((l) => l.name)).toEqual(['Ops', 'security']);
    expect(task.dueDate).toBe('2031-03-01');

    const updated = parsed(
      await zamu([
        'tasks',
        'update',
        task.key,
        '--label',
        'ui',
        '--remove-label',
        'OPS',
        '--due',
        '2031-03-05',
        '--json',
      ]),
      'tasks.update',
    );
    expect(updated.labels?.map((l) => l.name).sort()).toEqual(['security', 'ui']);
    expect(updated.dueDate).toBe('2031-03-05');

    const human = await zamu(['tasks', 'update', task.key, '--due', 'none']);
    expect(human.code, human.stderr).toBe(0);
    expect(human.stdout).toMatch(/Labels\s+security, ui/);
    expect(human.stdout).not.toMatch(/^Due/m);

    const show = await zamu(['tasks', 'show', task.key]);
    expect(show.stdout).toContain('created the task');
    expect(show.stdout).toContain('added label ui and removed label Ops');
    expect(show.stdout).toContain('moved the due date from 2031-03-01 to 2031-03-05');
    expect(show.stdout).toContain('cleared the due date');
  });

  it('filters by label name (any of), due state and sort order', async () => {
    const a = await createTask('Filter A', '--label', 'f-one', '--due', '2020-01-01');
    const b = await createTask('Filter B', '--label', 'f-two', '--due', '2032-01-01');
    const c = await createTask('Filter C');

    const any = parsed(
      await zamu(['tasks', 'list', '--project', 'PAY', '--label', 'F-ONE', '--label', 'f-two', '--json']),
      'tasks.list',
    );
    expect(any.items.map((t) => t.key).sort()).toEqual([a.key, b.key].sort());

    const overdue = parsed(
      await zamu(['tasks', 'list', '--project', 'PAY', '--due', 'overdue', '--json']),
      'tasks.list',
    );
    expect(overdue.items.map((t) => t.key)).toContain(a.key);
    expect(overdue.items.map((t) => t.key)).not.toContain(b.key);

    const none = parsed(
      await zamu(['tasks', 'list', '--project', 'PAY', '--due', 'none', '--json']),
      'tasks.list',
    );
    expect(none.items.map((t) => t.key)).toContain(c.key);
    expect(none.items.every((t) => !t.dueDate)).toBe(true);

    const byDue = parsed(
      await zamu(['tasks', 'list', '--project', 'PAY', '--due', 'set', '--sort', 'due', '--json']),
      'tasks.list',
    );
    const dates = byDue.items.map((t) => t.dueDate ?? '');
    expect(dates).toEqual([...dates].sort());

    const table = await zamu([
      'tasks',
      'list',
      '--project',
      'PAY',
      '--label',
      'f-one,f-two',
      '--sort',
      'due',
    ]);
    expect(table.code, table.stderr).toBe(0);
    expect(table.stdout.split('\n')[0]).toMatch(/\bDUE\s+LABELS\s+TITLE$/);
    expect(table.stdout).toMatch(new RegExp(`${a.key}\\s.*2020-01-01\\s+f-one\\s+Filter A`));
  });

  it('fails clearly on an unknown label name, and on a label name without a project', async () => {
    await createTask('Known label', '--label', 'known');
    const unknown = await zamu(['tasks', 'list', '--project', 'PAY', '--label', 'known,unknwn']);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('zamu: No label named "unknwn" in PAY.');
    expect(unknown.stderr).toMatch(/Labels in PAY: .*"known"/);

    const two = await zamu(['tasks', 'list', '--project', 'PAY,WEB', '--label', 'unknwn', '--json']);
    expect(expectFailure(two, 1, 'BAD_REQUEST').detail).toBe('No label named "unknwn" in PAY or WEB.');

    const noProject = await zamu(['tasks', 'list', '--label', 'known', '--json'], { fetch: offline });
    expect(expectFailure(noProject, 1, 'BAD_REQUEST').detail).toContain('--label "known" needs --project');
  });

  it('checks --due, --sort and dates before calling the server', async () => {
    const bad = [
      ['tasks', 'list', '--due', 'later'],
      ['tasks', 'list', '--sort', 'random'],
      ['tasks', 'create', '--project', 'PAY', 'x', '--due', 'tomorrow'],
      ['tasks', 'update', 'PAY-1', '--due', '2031-02-30'],
      ['tasks', 'update', 'PAY-1', '--blocked-by', 'not a key'],
    ];
    for (const args of bad) {
      expectFailure(await zamu([...args, '--json'], { fetch: offline }), 1, 'BAD_REQUEST');
    }
  });
});

describe('zamu tasks with subtasks and blockers', () => {
  it('creates subtasks under a parent, lists them, and moves one back to the top level', async () => {
    const parent = await createTask('Ship refunds', '--assignee', 'me');
    const first = await createTask('Refund API', '--parent', parent.key);
    const second = await createTask('Refund email', '--parent', parent.key.toLowerCase());
    expect(first.parent?.key).toBe(parent.key);
    // A new subtask takes the parent's assignee.
    expect(first.assignee?.id).toBe(parent.assignee?.id);
    await zamu(['tasks', 'update', first.key, '--status', 'done']);

    const show = parsed(await zamu(['tasks', 'show', parent.key, '--json']), 'tasks.show');
    expect(show.task.subtasks?.map((t) => t.key)).toEqual([first.key, second.key]);
    expect(show.task.subtaskProgress).toEqual({ done: 1, total: 2 });
    const human = await zamu(['tasks', 'show', parent.key]);
    expect(human.stdout).toMatch(
      new RegExp(`Subtasks\\s+1 of 2 done\\n\\s+${first.key}  Refund API \\(Done\\)`),
    );
    expect(human.stdout).toMatch(new RegExp(`\\n\\s+${second.key}  Refund email \\(Todo\\)`));
    const child = await zamu(['tasks', 'show', second.key]);
    expect(child.stdout).toMatch(new RegExp(`Parent\\s+${parent.key}  Ship refunds \\(Todo\\)`));

    const subtasks = parsed(await zamu(['tasks', 'list', '--parent', parent.key, '--json']), 'tasks.list');
    expect(subtasks.items.map((t) => t.key).sort()).toEqual([first.key, second.key].sort());
    const topLevel = parsed(
      await zamu(['tasks', 'list', '--project', 'PAY', '--top-level', '--limit', '200', '--json']),
      'tasks.list',
    );
    const keys = topLevel.items.map((t) => t.key);
    expect(keys).toContain(parent.key);
    expect(keys).not.toContain(first.key);

    const table = await zamu(['tasks', 'list', '--project', 'PAY', '--parent', parent.key]);
    expect(table.stdout.split('\n')[0]).toMatch(/\bPARENT\s+TITLE$/);
    const parents = await zamu(['tasks', 'list', '--project', 'PAY', '--top-level', '--limit', '200']);
    expect(parents.stdout).toMatch(new RegExp(`${parent.key}\\s.*1/2\\s+Ship refunds`));

    const moved = parsed(
      await zamu(['tasks', 'update', second.key, '--parent', 'none', '--json']),
      'tasks.update',
    );
    expect(moved.parent).toBeNull();
    const history = await zamu(['tasks', 'show', second.key]);
    expect(history.stdout).toContain(`took it out of ${parent.key}`);
  });

  it('refuses a second subtask level (SUBTASK_DEPTH, exit 1)', async () => {
    const parent = await createTask('Top');
    const child = await createTask('Middle', '--parent', parent.key);
    const result = await zamu([
      'tasks',
      'create',
      '--project',
      'PAY',
      'Bottom',
      '--parent',
      child.key,
      '--json',
    ]);
    expectFailure(result, 1, 'SUBTASK_DEPTH');
  });

  it('adds and removes blockers, marks the task blocked, and refuses a loop', async () => {
    const blocker = await createTask('Settle refunds');
    const other = await createTask('Approve refunds');
    const task = await createTask('Send refund emails', '--blocked-by', `${blocker.key},${other.key}`);
    expect(task.blocked).toBe(true);
    expect(task.blockedBy?.map((t) => t?.key)).toEqual([blocker.key, other.key]);

    const human = await zamu(['tasks', 'show', task.key]);
    expect(human.stdout).toMatch(/Status\s+Todo · blocked/);
    expect(human.stdout).toMatch(
      new RegExp(
        `Blocked by\\s+${blocker.key}  Settle refunds \\(Todo\\)\\n\\s+${other.key}  Approve refunds`,
      ),
    );
    const reverse = await zamu(['tasks', 'show', blocker.key]);
    expect(reverse.stdout).toMatch(new RegExp(`Blocks\\s+${task.key}  Send refund emails \\(Todo\\)`));

    const blocked = parsed(
      await zamu(['tasks', 'list', '--project', 'PAY', '--blocked', '--json']),
      'tasks.list',
    );
    expect(blocked.items.map((t) => t.key)).toEqual([task.key]);
    const table = await zamu(['tasks', 'list', '--project', 'PAY', '--blocked']);
    expect(table.stdout).toMatch(new RegExp(`${task.key}\\s.*blocked\\s+Send refund emails`));
    const free = parsed(
      await zamu(['tasks', 'list', '--project', 'PAY', '--no-blocked', '--limit', '200', '--json']),
      'tasks.list',
    );
    expect(free.items.map((t) => t.key)).not.toContain(task.key);
    expect(free.items.map((t) => t.key)).toContain(blocker.key);

    // blocker waits on task would close the loop.
    const loop = await zamu(['tasks', 'update', blocker.key, '--blocked-by', task.key, '--json']);
    const problem = expectFailure(loop, 1, 'DEPENDENCY_LOOP');
    expect(problem.detail).toBe(`Can't add: ${task.key} already waits on ${blocker.key}.`);
    expect(problem.loop).toEqual({ task: blocker.key, blocker: task.key });
    const loopText = await zamu(['tasks', 'update', blocker.key, '--blocked-by', task.key]);
    expect(loopText.stderr).toMatch(
      new RegExp(`^zamu: Can't add: ${task.key} already waits on ${blocker.key}\\.\\n`),
    );

    await zamu(['tasks', 'update', blocker.key, '--status', 'done']);
    const unblocked = parsed(
      await zamu(['tasks', 'update', task.key, '--unblock', other.key, '--json']),
      'tasks.update',
    );
    expect(unblocked.blockedBy?.map((t) => t?.key)).toEqual([blocker.key]);
    expect(unblocked.blocked).toBe(false);
    const show = await zamu(['tasks', 'show', task.key]);
    expect(show.stdout).toContain(`removed blocker ${other.key}`);
  });

  it('refuses a blocker from another project (NOT_SAME_PROJECT, exit 1)', async () => {
    const task = await createTask('Same project only');
    expectFailure(
      await zamu(['tasks', 'update', task.key, '--blocked-by', 'WEB-1', '--json']),
      1,
      'NOT_SAME_PROJECT',
    );
  });
});
