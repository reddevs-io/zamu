// pm commands end to end, in-process: the real /api/v1 handler from apps/web on a throwaway Postgres
// database with the dev seed (PAY with 11 tasks, WEB with 4). Every --json result is checked against
// the contract's CLI output schemas, and every failure against its exit code.
//
// The server code is imported by relative path (apps/web/src/server uses relative imports for this).
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CliResultName, parseCliOutput } from '@pm/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Actor, createApiKey, revokeApiKey } from '../../../packages/core/src/index';
import { createTestDatabase, type TestDatabase } from '../../../packages/db/test/index';
import { createApiFetchHandler } from '../../web/src/server/api/handler';
import { createServerContext, type ServerContext } from '../../web/src/server/context';
import { seedDevData } from '../../web/src/server/seed';
import type { CliIo, FetchLike } from '../src/io';
import { main } from '../src/main';

const URL = 'http://pm.test';
const SECRET = 'test-secret-test-secret-test-secret-0123';

let database: TestDatabase;
let server: ServerContext;
let handle: FetchLike;
let home: string;
let configHome: string;
const keys = {} as { agent: string; admin: string; adminRead: string; revoked: string };
let agentName: string;
let adminName: string;

interface RunOptions {
  env?: Record<string, string | undefined>;
  stdin?: string;
  fetch?: FetchLike;
  tty?: boolean;
  columns?: number;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function pm(args: string[], options: RunOptions = {}): Promise<RunResult> {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    readStdin: async () => options.stdin ?? '',
    env: { XDG_CONFIG_HOME: configHome, ...options.env },
    homeDir: home,
    isTTY: options.tty ?? false,
    ...(options.columns ? { columns: options.columns } : {}),
    fetch: options.fetch ?? handle,
  };
  const code = await main(args, io);
  return { code, stdout: out.join(''), stderr: err.join('') };
}

/** Runs with PM_URL and PM_KEY set (the way agents in CI call pm). */
function as(key: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return pm(args, { ...options, env: { PM_URL: URL, PM_KEY: key, ...options.env } });
}

function parsed<N extends CliResultName>(result: RunResult, name: N) {
  expect(result.stdout.trim().split('\n'), 'one JSON line when piped').toHaveLength(1);
  return parseCliOutput(JSON.parse(result.stdout), name);
}

function expectFailure(result: RunResult, exitCode: number, code: string) {
  expect(result.code, result.stdout + result.stderr).toBe(exitCode);
  const error = parsed(result, 'error');
  expect(error.data.code).toBe(code);
  return error.data;
}

beforeAll(async () => {
  database = await createTestDatabase({ prefix: 'pm_cli' });
  database.pool.on('error', () => {});
  server = createServerContext({
    DATABASE_URL: database.url,
    BETTER_AUTH_SECRET: SECRET,
    BETTER_AUTH_URL: URL,
    PUBLIC_URL: URL,
  });
  handle = createApiFetchHandler(server);
  const seeded = await seedDevData(server);
  keys.agent = seeded.agentKey;
  keys.admin = seeded.adminKey;
  agentName = seeded.agent.name;
  adminName = seeded.admin.name;

  const admin: Actor = {
    userId: seeded.admin.id,
    kind: 'person',
    workspaceId: seeded.workspaceId,
    role: 'owner',
    onBehalfOfId: null,
  };
  keys.adminRead = (
    await createApiKey(server, admin, { name: 'read only', scope: { projects: 'all', access: 'read' } })
  ).key;
  const revoked = await createApiKey(server, admin, {
    name: 'revoked',
    scope: { projects: 'all', access: 'write' },
  });
  await revokeApiKey(server, admin, { id: revoked.id });
  keys.revoked = revoked.key;
}, 60_000);

afterAll(async () => {
  await server?.pool.end();
  await database?.drop();
});

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'pm-cli-home-'));
  configHome = join(home, 'xdg');
  return () => rm(home, { recursive: true, force: true });
});

describe('pm login, whoami, logout', () => {
  it('validates the key with GET /me and stores url and key with mode 0600', async () => {
    const login = await pm(['login', '--key', keys.agent, '--url', `${URL}/`, '--json']);
    expect(login.code, login.stderr).toBe(0);
    const out = parsed(login, 'login');
    expect(out.data.url).toBe(URL);
    expect(out.data.me.user).toMatchObject({ name: agentName, kind: 'agent', email: null });
    expect(out.data.me.user.responsible?.name).toBe(adminName);

    const path = join(configHome, 'pm', 'config.json');
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ url: URL, key: keys.agent });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(configHome, 'pm'))).mode & 0o777).toBe(0o700);

    const whoami = await pm(['whoami', '--json']);
    expect(whoami.code, whoami.stderr).toBe(0);
    const me = parsed(whoami, 'whoami');
    expect(me.data.auth).toEqual({ method: 'api_key', scope: { projects: 'all', access: 'write' } });

    const human = await pm(['whoami']);
    expect(human.stdout).toContain(`${agentName} for ${adminName} (agent)`);
    expect(human.stdout).toMatch(/Access\s+API key: all projects, write/);
    expect(human.stdout).toMatch(new RegExp(`Server\\s+${URL}`));

    const logout = await pm(['logout', '--json']);
    expect(logout.code).toBe(0);
    expect(parsed(logout, 'logout').data).toEqual({ url: URL });
    await expect(stat(path)).rejects.toThrow();

    const again = await pm(['logout', '--json']);
    expect(parsed(again, 'logout').data).toEqual({ url: null });
  });

  it('falls back to ~/.config when XDG_CONFIG_HOME is unset, and reads the key from stdin', async () => {
    const login = await pm(['login', '--key', '-', '--url', URL], {
      env: { XDG_CONFIG_HOME: undefined },
      stdin: `${keys.admin}\n`,
    });
    expect(login.code, login.stderr).toBe(0);
    expect(login.stdout).toContain(`Logged in as ${adminName}`);
    const path = join(home, '.config', 'pm', 'config.json');
    expect(JSON.parse(await readFile(path, 'utf8')).key).toBe(keys.admin);
  });

  it('refuses a revoked key with exit code 2 and stores nothing', async () => {
    const result = await pm(['login', '--key', keys.revoked, '--url', URL, '--json']);
    const error = expectFailure(result, 2, 'UNAUTHORIZED');
    expect(error.status).toBe(401);
    expect(error.requestId).toEqual(expect.any(String));
    await expect(stat(join(configHome, 'pm', 'config.json'))).rejects.toThrow();
  });

  it('rejects a malformed key before calling the server (exit 1)', async () => {
    const result = await pm(['login', '--key', 'not-a-key', '--json'], {
      fetch: () => {
        throw new Error('must not be called');
      },
    });
    expectFailure(result, 1, 'BAD_REQUEST');
  });

  it('exits 2 when no credentials exist', async () => {
    const result = await pm(['whoami']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Not logged in');
    expect(result.stdout).toBe('');
  });

  it('lets PM_URL and PM_KEY override the stored config', async () => {
    expect((await pm(['login', '--key', keys.agent, '--url', URL])).code).toBe(0);
    const result = await as(keys.admin, ['whoami', '--json']);
    expect(parsed(result, 'whoami').data.user.name).toBe(adminName);
    // PM_API_KEY (what the dev seed prints) works too.
    const seedStyle = await pm(['whoami', '--json'], { env: { PM_URL: URL, PM_API_KEY: keys.admin } });
    expect(parsed(seedStyle, 'whoami').data.user.name).toBe(adminName);
  });
});

describe('pm projects list', () => {
  it('lists projects with open counts', async () => {
    const result = await as(keys.agent, ['projects', 'list', '--json']);
    expect(result.code, result.stderr).toBe(0);
    const keysListed = parsed(result, 'projects.list').data.items.map((p) => p.key);
    expect(keysListed.sort()).toEqual(['PAY', 'WEB']);

    const human = await as(keys.agent, ['projects', 'list']);
    const lines = human.stdout.trimEnd().split('\n');
    expect(lines[0]).toMatch(/^KEY\s+OPEN\s+BACKLOG\s+TODO\s+IN PROGRESS\s+IN REVIEW\s+ACTIVE\s+NAME$/);
    expect(lines.some((line) => /^PAY\s+\d+/.test(line) && line.endsWith('Payments'))).toBe(true);
    // Not a terminal: no ANSI colour.
    expect(human.stdout).not.toContain('\u001b[');
  });
});

describe('pm tasks list', () => {
  it('lists a project with counts, task keys first', async () => {
    const result = await as(keys.agent, ['tasks', 'list', '--project', 'pay', '--json']);
    expect(result.code, result.stderr).toBe(0);
    const page = parsed(result, 'tasks.list').data;
    expect(page.items).toHaveLength(11);
    expect(Object.values(page.counts).reduce((a, b) => a + b, 0)).toBe(11);

    const human = await as(keys.agent, ['tasks', 'list', '--project', 'PAY']);
    const lines = human.stdout.trimEnd().split('\n');
    expect(lines[0]).toMatch(/^KEY\s+STATUS\s+PRIORITY\s+ASSIGNEE\s+TITLE$/);
    expect(lines.slice(1, 12).every((line) => /^PAY-\d+\s/.test(line))).toBe(true);
    expect(human.stdout).toContain(`${agentName} for ${adminName}`);
    expect(human.stdout).toMatch(/11 shown · /);
  });

  it('filters by status (repeatable and comma-separated) and assignee', async () => {
    const byStatus = await as(keys.agent, [
      'tasks',
      'list',
      '--project',
      'PAY',
      '--status',
      'todo,in-progress',
      '--status',
      'In review',
      '--json',
    ]);
    const statuses = new Set(parsed(byStatus, 'tasks.list').data.items.map((t) => t.status));
    expect([...statuses].sort()).toEqual(['in_progress', 'in_review', 'todo']);

    const mine = parsed(
      await as(keys.agent, ['tasks', 'list', '--project', 'PAY', '--assignee', 'me', '--json']),
      'tasks.list',
    ).data.items;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((t) => t.assignee?.name === agentName)).toBe(true);

    const agents = parsed(
      await as(keys.admin, ['tasks', 'list', '--project', 'PAY', '--assignee', 'agents', '--json']),
      'tasks.list',
    ).data.items;
    expect(agents.map((t) => t.key).sort()).toEqual(mine.map((t) => t.key).sort());

    const byName = parsed(
      await as(keys.agent, [
        'tasks',
        'list',
        '--project',
        'PAY',
        '--assignee',
        adminName.toLowerCase(),
        '--json',
      ]),
      'tasks.list',
    ).data.items;
    expect(byName.length).toBeGreaterThan(0);
    expect(byName.every((t) => t.assignee?.name === adminName)).toBe(true);
  });

  it('pages with --limit and --cursor', async () => {
    const first = parsed(
      await as(keys.agent, ['tasks', 'list', '--project', 'PAY', '--limit', '4', '--json']),
      'tasks.list',
    ).data;
    expect(first.items).toHaveLength(4);
    expect(first.nextCursor).toEqual(expect.any(String));
    const human = await as(keys.agent, ['tasks', 'list', '--project', 'PAY', '--limit', '4']);
    expect(human.stdout).toContain(`More: add --cursor ${first.nextCursor}`);
    const second = parsed(
      await as(keys.agent, [
        'tasks',
        'list',
        '--project',
        'PAY',
        '--limit',
        '4',
        '--cursor',
        first.nextCursor as string,
        '--json',
      ]),
      'tasks.list',
    ).data;
    expect(second.items.map((t) => t.key)).not.toContain(first.items[0]?.key);
  });

  it('maps errors to exit codes', async () => {
    expectFailure(await as(keys.agent, ['tasks', 'list', '--project', 'NOPE', '--json']), 3, 'NOT_FOUND');
    expectFailure(
      await as(keys.agent, ['tasks', 'list', '--project', 'PAY', '--status', 'started', '--json']),
      1,
      'BAD_REQUEST',
    );
    expectFailure(
      await as(keys.agent, ['tasks', 'list', '--project', 'PAY', '--limit', '500', '--json']),
      1,
      'BAD_REQUEST',
    );
    expectFailure(
      await as(keys.agent, ['tasks', 'list', '--project', 'PAY', '--assignee', 'nobody-here', '--json']),
      3,
      'NOT_FOUND',
    );
    const missing = await as(keys.agent, ['tasks', 'list', '--json']);
    expect(expectFailure(missing, 1, 'BAD_REQUEST').detail).toContain('--project');
    expect(missing.stderr).toBe('');
    expectFailure(await as(keys.revoked, ['tasks', 'list', '--project', 'PAY', '--json']), 2, 'UNAUTHORIZED');
  });
});

describe('pm tasks show', () => {
  it('shows a task with its activity, agents "for" their human', async () => {
    const list = parsed(
      await as(keys.agent, ['tasks', 'list', '--project', 'PAY', '--status', 'in_review', '--json']),
      'tasks.list',
    ).data.items;
    const webhook = list.find((t) => t.title.startsWith('Webhook signature'));
    if (!webhook) throw new Error('seed task missing');

    const result = await as(keys.agent, ['tasks', 'show', webhook.key.toLowerCase(), '--json']);
    expect(result.code, result.stderr).toBe(0);
    const shown = parsed(result, 'tasks.show').data;
    expect(shown.task.key).toBe(webhook.key);
    expect(shown.task.description).toContain('Reject timestamps');
    expect(shown.activity.length).toBeGreaterThanOrEqual(2);

    const human = await as(keys.agent, ['tasks', 'show', webhook.key]);
    expect(human.stdout.split('\n')[0]).toBe(`${webhook.key}  ${webhook.title}`);
    expect(human.stdout).toMatch(new RegExp(`Assignee\\s+${agentName} for ${adminName}`));
    expect(human.stdout).toContain('Reject timestamps older than 5 minutes');
    expect(human.stdout).toContain(`${agentName} for ${adminName} moved it from In progress to In review`);
  });

  it('exits 3 for a missing task and 1 for a malformed key', async () => {
    expectFailure(await as(keys.agent, ['tasks', 'show', 'PAY-9999', '--json']), 3, 'NOT_FOUND');
    const human = await as(keys.agent, ['tasks', 'show', 'PAY-9999']);
    expect(human.code).toBe(3);
    expect(human.stderr).toMatch(/^pm: /);
    expectFailure(await as(keys.agent, ['tasks', 'show', 'PAY142', '--json']), 1, 'BAD_REQUEST');
  });
});

describe('pm tasks create and update', () => {
  it('creates a task with a description from stdin, assigned by name', async () => {
    const result = await as(
      keys.agent,
      [
        'tasks',
        'create',
        '--project',
        'web',
        'Fix',
        'the',
        'footer',
        '--description',
        '-',
        '--priority',
        'High',
        '--assignee',
        agentName,
        '--status',
        'in-progress',
        '--json',
      ],
      { stdin: '## Notes\n\nFrom stdin.\n' },
    );
    expect(result.code, result.stdout + result.stderr).toBe(0);
    const task = parsed(result, 'tasks.create').data;
    expect(task).toMatchObject({
      title: 'Fix the footer',
      description: '## Notes\n\nFrom stdin.\n',
      priority: 'high',
      status: 'in_progress',
      project: { key: 'WEB' },
    });
    expect(task.assignee?.name).toBe(agentName);
    expect(task.createdOnBehalfOf?.name).toBe(adminName);

    const human = await as(keys.agent, ['tasks', 'create', '--project', 'WEB', 'Plain task']);
    expect(human.code, human.stderr).toBe(0);
    expect(human.stdout).toMatch(/^Created WEB-\d+ {2}Plain task\n/);
    expect(human.stdout).toMatch(/Status\s+Todo/);
    expect(human.stdout).toMatch(/Assignee\s+Unassigned/);
  });

  it('updates status, priority, title and assignee, then unassigns', async () => {
    const created = parsed(
      await as(keys.agent, ['tasks', 'create', '--project', 'PAY', 'Update me', '--json']),
      'tasks.create',
    ).data;

    const moved = await as(keys.agent, [
      'tasks',
      'update',
      created.key,
      '--status',
      'in_progress',
      '--priority',
      'urgent',
      '--title',
      'Updated title',
      '--assignee',
      'me',
      '--json',
    ]);
    expect(moved.code, moved.stdout + moved.stderr).toBe(0);
    expect(parsed(moved, 'tasks.update').data).toMatchObject({
      status: 'in_progress',
      priority: 'urgent',
      title: 'Updated title',
      assignee: { name: agentName, responsible: { name: adminName } },
    });

    const human = await as(keys.agent, ['tasks', 'update', created.key, '--unassign']);
    expect(human.code, human.stderr).toBe(0);
    expect(human.stdout).toMatch(new RegExp(`^Updated ${created.key} {2}Updated title\\n`));
    expect(human.stdout).toMatch(/Assignee\s+Unassigned/);

    const show = await as(keys.agent, ['tasks', 'show', created.key]);
    expect(show.stdout).toMatch(/ {2}claude-dev for Ana Ruiz created the task\n/);
    expect(show.stdout).toMatch(
      / {2}claude-dev for Ana Ruiz renamed it to "Updated title", moved it from Todo to In progress, changed the priority from No priority to Urgent, assigned it to claude-dev\n/,
    );
    expect(show.stdout).toMatch(/ {2}claude-dev for Ana Ruiz unassigned claude-dev\n/);
  });

  it('maps write errors to exit codes', async () => {
    // Read-only key: forbidden.
    expectFailure(
      await as(keys.adminRead, ['tasks', 'update', 'PAY-1', '--status', 'done', '--json']),
      4,
      'FORBIDDEN',
    );
    expectFailure(
      await as(keys.adminRead, ['tasks', 'create', '--project', 'PAY', 'Nope', '--json']),
      4,
      'FORBIDDEN',
    );
    // Nothing to change, both assignee flags, bad values: usage, before the request.
    expectFailure(await as(keys.agent, ['tasks', 'update', 'PAY-1', '--json']), 1, 'BAD_REQUEST');
    expectFailure(
      await as(keys.agent, ['tasks', 'update', 'PAY-1', '--assignee', 'me', '--unassign', '--json']),
      1,
      'BAD_REQUEST',
    );
    expectFailure(
      await as(keys.agent, ['tasks', 'create', '--project', 'PAY', 'X', '--priority', 'p1', '--json']),
      1,
      'BAD_REQUEST',
    );
    expectFailure(
      await as(keys.agent, ['tasks', 'create', '--project', 'PAY', 'X', '--assignee', 'agents', '--json']),
      1,
      'BAD_REQUEST',
    );
    expectFailure(
      await as(keys.agent, ['tasks', 'update', 'PAY-9999', '--status', 'done', '--json']),
      3,
      'NOT_FOUND',
    );
  });
});

describe('server failures', () => {
  it('exits 5 when the server is unreachable', async () => {
    const result = await as(keys.agent, ['projects', 'list', '--json'], {
      fetch: () =>
        Promise.reject(new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') })),
    });
    const error = expectFailure(result, 5, 'INTERNAL_SERVER_ERROR');
    expect(error.detail).toContain(`Could not reach ${URL}`);
  });

  it('exits 5 on a 500 and on a response outside the contract', async () => {
    const failing = await as(keys.agent, ['whoami', '--json'], {
      fetch: async () => new Response('upstream broke', { status: 502 }),
    });
    expect(failing.code).toBe(5);
    expect(parsed(failing, 'error').data.status).toBe(502);

    const wrongShape = await as(keys.agent, ['whoami', '--json'], {
      fetch: async () => Response.json({ hello: 'world' }),
    });
    expectFailure(wrongShape, 5, 'INTERNAL_SERVER_ERROR');
  });
});

describe('output conventions', () => {
  it('colours and indents only on a terminal; NO_COLOR wins', async () => {
    const tty = await as(keys.agent, ['tasks', 'list', '--project', 'PAY'], { tty: true, columns: 60 });
    expect(tty.stdout).toContain('\u001b[');
    // The title column is cut to the terminal width.
    expect(tty.stdout).toContain('…');

    const noColor = await as(keys.agent, ['tasks', 'list', '--project', 'PAY'], {
      tty: true,
      env: { NO_COLOR: '1' },
    });
    expect(noColor.stdout).not.toContain('\u001b[');

    const json = await as(keys.agent, ['whoami', '--json'], { tty: true });
    expect(json.stdout.split('\n').length).toBeGreaterThan(3);
    expect(parseCliOutput(JSON.parse(json.stdout), 'whoami').schema).toBe('pm.v1.whoami');
  });

  it('prints help and version with exit 0, unknown commands with exit 1', async () => {
    const help = await pm(['--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('Exit codes: 0 ok, 1 usage, 2 auth, 3 not found, 4 forbidden, 5 server.');
    const version = await pm(['--version']);
    expect(version.code).toBe(0);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    const unknown = await pm(['frobnicate']);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain("unknown command 'frobnicate'");
  });
});
