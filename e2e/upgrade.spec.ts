// Upgrades on a second compose stack (project <E2E_COMPOSE_PROJECT>-upgrade, port 3101) next to the main one. The
// stack starts on M1 (release 0.1.1) and gets data through the M1 app, moves to M2.1 (0.3.0: the M2 and M2.1
// migrations run against the M1 data, which shows on the board in its M1 order, and gets M2 and M2.1 data),
// then moves to the image globalSetup built: the M3 migration runs, and every key and route still works.
//
// Older images, each used when it is already local:
//   M1    E2E_M1_IMAGE (pulled if it is not local, for example
//         registry.gitlab.com/reddevsdotio/tooling/project-management:0.1.1 after `docker login`), else
//         project-management:m1-0.1.1, built once from the git tag 0.1.1.
//   M2.1  E2E_M2_1_IMAGE (pulled likewise, for example …/project-management:0.3.0), else
//         project-management:m2.1-<ref>, built once from the git tag 0.3.0 when it exists, else from the M2.1
//         merge commit (E2E_M2_1_REF overrides).
// Builds use git archive, so the checkout is untouched. E2E_SKIP_UPGRADE=1 skips this spec.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { api, settle, setUpServer, signInAsAdmin } from './session';
import {
  composeProject,
  createStack,
  image as currentImage,
  downCommand,
  baseURL as mainURL,
  repoRoot,
} from './stack';

const M1_TAG = '0.1.1';
const m1Image = process.env.E2E_M1_IMAGE ?? `project-management:m1-${M1_TAG}`;
/** The M2.1 merge to main, released as 0.3.0. */
const M2_1_COMMIT = '7eb6b7e';
const m2_1Ref = process.env.E2E_M2_1_REF ?? (gitRefExists('0.3.0') ? '0.3.0' : M2_1_COMMIT);
const m2_1Image = process.env.E2E_M2_1_IMAGE ?? `project-management:m2.1-${m2_1Ref}`;
const upgradePort = process.env.E2E_UPGRADE_PORT ?? '3101';
// Same host as the main stack (localhost, or "docker" in CI), another port.
const upgradeURL = (() => {
  const url = new URL(mainURL);
  url.port = upgradePort;
  return url.origin;
})();

const stack = createStack({
  project: `${composeProject}-upgrade`,
  port: upgradePort,
  baseURL: upgradeURL,
  image: m1Image,
});

interface TaskRef {
  key: string;
  title: string;
  status: string;
}

test.describe.configure({ mode: 'serial' });
test.skip(process.env.E2E_SKIP_UPGRADE === '1', 'E2E_SKIP_UPGRADE=1');

let context: BrowserContext;
let page: Page;
/** Task keys per status in the M1 list order (priority, then most recently updated). */
let m1Order: Record<string, string[]> = {};
/** Every task after the M2.1 step. */
let m2_1Tasks: TaskRef[] = [];
const repository = 'https://gitlab.com/reddevs/operations.git';

const byKey = (a: { key: string }, b: { key: string }) => a.key.localeCompare(b.key);

function gitRefExists(ref: string): boolean {
  return (
    spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: repoRoot }).status === 0
  );
}

function hasImage(name: string): boolean {
  return spawnSync('docker', ['image', 'inspect', name], { stdio: 'ignore' }).status === 0;
}

/**
 * Makes sure an older image is local: pulls it when its name came from the environment, else builds `ref`
 * from git (once; later runs reuse the image).
 */
function ensureImage(name: string, fromEnv: boolean, ref: string): void {
  if (hasImage(name)) return;
  if (fromEnv) {
    console.log(`[e2e] pulling ${name}`);
    execFileSync('docker', ['pull', name], { stdio: ['ignore', 'ignore', 'inherit'] });
    return;
  }
  console.log(`[e2e] building ${name} from git ${ref} (once; later runs reuse it)`);
  const dir = mkdtempSync(join(tmpdir(), 'pm-e2e-image-'));
  try {
    const archive = join(dir, 'source.tar');
    const source = join(dir, 'source');
    execFileSync('git', ['archive', '--format=tar', '-o', archive, ref], { cwd: repoRoot });
    execFileSync('mkdir', [source]);
    execFileSync('tar', ['-xf', archive, '-C', source]);
    execFileSync('docker', ['build', '-t', name, source], { stdio: ['ignore', 'ignore', 'inherit'] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** State and exit code of the migrate container, e.g. "exited 0". */
function migrateState(): string {
  return stack
    .compose(['ps', '-a', 'migrate', '--format', '{{.State}} {{.ExitCode}}'], { quiet: true })
    .trim();
}

/** Moves the stack to another image: compose recreates migrate, web and worker, and migrate runs first. */
async function switchTo(image: string): Promise<void> {
  stack.image = image;
  console.log(`[e2e] switching ${stack.project} to ${image}`);
  await startStack();
  expect(migrateState()).toBe('exited 0');
  const images = stack.compose(['ps', '--format', '{{.Service}} {{.Image}}'], { quiet: true });
  expect(images).toContain(`web ${image}`);
}

async function startStack(): Promise<void> {
  try {
    // Compose recreates migrate, web and worker when the image changes; migrate runs before web starts.
    stack.compose(['up', '-d', '--no-build'], { quiet: true });
    await stack.waitForHealthy();
  } catch (error) {
    console.error(stack.dumpState());
    throw error;
  }
}

test.beforeAll(async ({ browser }) => {
  // Building the older images from source takes a few minutes each the first time.
  test.setTimeout(30 * 60_000);
  ensureImage(m1Image, Boolean(process.env.E2E_M1_IMAGE), M1_TAG);
  ensureImage(m2_1Image, Boolean(process.env.E2E_M2_1_IMAGE), m2_1Ref);
  stack.compose(['down', '-v', '--remove-orphans'], { quiet: true });
  console.log(`[e2e] starting ${stack.project} on ${m1Image} at ${upgradeURL}`);
  await startStack();
  context = await browser.newContext({ baseURL: upgradeURL });
  page = await context.newPage();
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires an object pattern as the first argument.
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && page) {
    await testInfo.attach('page at failure', { body: await page.screenshot(), contentType: 'image/png' });
  }
});

test.afterAll(async () => {
  await context?.close();
  if (process.env.E2E_KEEP_STACK === '1') {
    console.log(`[e2e] leaving ${stack.project} running at ${upgradeURL}. Remove it with:`);
    console.log(`  ${downCommand(stack)}`);
    return;
  }
  stack.compose(['down', '-v', '--remove-orphans'], { quiet: true });
});

test('M1 0.1.1: set up the server and add a project with tasks', async () => {
  await page.goto('/');
  await setUpServer(page);

  // The M1 API: GET /me has no theme yet.
  const me = await api<{ user: Record<string, unknown> }>(page.request, 'GET', '/me');
  expect(me.user).not.toHaveProperty('theme');

  await api(page.request, 'POST', '/projects', { name: 'Operations', key: 'OPS' });
  const tasks = [
    { title: 'Rotate the database password', priority: 'high' },
    { title: 'Renew the TLS certificate', status: 'in_progress' },
    { title: 'Archive old logs', priority: 'low' },
    { title: 'Move backups to object storage', status: 'done' },
    { title: 'Document the restore drill', priority: 'urgent' },
  ];
  for (const task of tasks) await api(page.request, 'POST', '/tasks', { project: 'OPS', ...task });

  const list = await api<{ items: TaskRef[] }>(page.request, 'GET', '/tasks?project=OPS');
  m1Order = Object.fromEntries(
    Object.entries(Object.groupBy(list.items, (task) => task.status)).map(([status, items = []]) => [
      status,
      items.map((task) => task.key),
    ]),
  );
  expect(m1Order).toEqual({ todo: ['OPS-5', 'OPS-1', 'OPS-3'], in_progress: ['OPS-2'], done: ['OPS-4'] });
});

test('M2.1 (0.3.0): the M2 migrations keep the M1 data and its board order', async () => {
  test.setTimeout(5 * 60_000);
  expect(migrateState()).toBe('exited 0');

  await switchTo(m2_1Image);

  // The session from M1 may or may not survive; sign in again either way.
  await signInAsAdmin(page);
  const me = await api<{ user: { theme: string } }>(page.request, 'GET', '/me');
  expect(me.user.theme).toBe('system');
  const projects = await api<{ items: { key: string; usesMilestones: boolean; usesCycles: boolean }[] }>(
    page.request,
    'GET',
    '/projects',
  );
  const project = projects.items.find((item) => item.key === 'OPS');
  expect(project).toMatchObject({ usesMilestones: true, usesCycles: true, currentCycle: null });

  // The migration gave every task a rank that keeps the M1 order inside each status.
  for (const [status, keys] of Object.entries(m1Order)) {
    const board = await api<{ items: TaskRef[] }>(
      page.request,
      'GET',
      `/tasks?project=OPS&status=${status}&order=board`,
    );
    expect(board.items.map((task) => task.key)).toEqual(keys);
  }

  await page.goto('/p/OPS?view=board');
  await settle(page);
  const keysIn = (status: string) =>
    page
      .getByRole('grid', { name: status, exact: true })
      .locator('[data-card-key]')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-card-key') ?? ''));
  await expect(page.getByRole('region', { name: 'Todo, 3 tasks' })).toBeVisible();
  expect(await keysIn('Todo')).toEqual(m1Order.todo);
  expect(await keysIn('In progress')).toEqual(m1Order.in_progress);
  await expect(page.getByRole('button', { name: 'Expand Done, 1 tasks' })).toBeVisible();

  // M2 features work on the upgraded data.
  const milestone = await api<{ id: string }>(page.request, 'POST', '/projects/OPS/milestones', {
    name: 'Hardening',
  });
  await api(page.request, 'PATCH', '/tasks/OPS-1', { milestone: milestone.id, status: 'in_progress' });
  const milestones = await api<{ items: { name: string; status: string }[] }>(
    page.request,
    'GET',
    '/projects/OPS/milestones',
  );
  expect(milestones.items).toEqual([expect.objectContaining({ name: 'Hardening', status: 'active' })]);

  // M2 and M2.1 data for the next upgrade: a cycle, a comment, a linked repository and one more task.
  await api(page.request, 'POST', '/projects/OPS/cycles', {
    startsOn: new Date().toISOString().slice(0, 10),
  });
  await api(page.request, 'PATCH', '/tasks/OPS-2', { cycle: 'current' });
  await api(page.request, 'POST', '/tasks/OPS-1/comments', {
    body: 'Rotated on the primary; replicas next.',
  });
  await api(page.request, 'PATCH', '/projects/OPS', { repository: repository });
  await api(page.request, 'POST', '/tasks', { project: 'OPS', title: 'Test the failover' });
  m2_1Tasks = (await api<{ items: TaskRef[] }>(page.request, 'GET', '/tasks?project=OPS&limit=100')).items;
  expect(m2_1Tasks.map((task) => task.key).sort()).toEqual([
    'OPS-1',
    'OPS-2',
    'OPS-3',
    'OPS-4',
    'OPS-5',
    'OPS-6',
  ]);
});

test('this build: the M3 migration keeps every key, and every route still works', async () => {
  test.setTimeout(5 * 60_000);
  await switchTo(currentImage);
  await signInAsAdmin(page);

  // Every task keeps its key, title and status, and has no Backlog.md data.
  const list = await api<{ items: (TaskRef & { hidden?: boolean; backlogId?: string | null })[] }>(
    page.request,
    'GET',
    '/tasks?project=OPS&limit=100',
  );
  expect(list.items.map(({ key, title, status }) => ({ key, title, status })).sort(byKey)).toEqual(
    m2_1Tasks.map(({ key, title, status }) => ({ key, title, status })).sort(byKey),
  );
  for (const item of list.items) {
    const task = await api<{ key: string; backlog?: unknown; hidden?: boolean; locked?: string[] }>(
      page.request,
      'GET',
      `/tasks/${item.key}`,
    );
    expect(task).toMatchObject({ key: item.key, backlog: null, hidden: false, locked: [] });
  }
  const projects = await api<{ items: { key: string; repository: string | null; backlog?: unknown }[] }>(
    page.request,
    'GET',
    '/projects',
  );
  expect(projects.items.find((item) => item.key === 'OPS')).toMatchObject({ repository, backlog: null });

  // M2 and M2.1 data survive: the cycle, the comment (with its timeline entry), the milestone.
  expect(
    (await api<{ cycle: { number: number } | null }>(page.request, 'GET', '/tasks/OPS-2')).cycle?.number,
  ).toBe(1);
  const comments = await api<{ items: { body: string }[] }>(page.request, 'GET', '/tasks/OPS-1/comments');
  expect(comments.items.map((comment) => comment.body)).toEqual(['Rotated on the primary; replicas next.']);
  const timeline = await api<{ items: { kind: string; origin?: string }[] }>(
    page.request,
    'GET',
    '/tasks/OPS-1/timeline',
  );
  expect(
    timeline.items.filter((item) => item.kind === 'activity').every((item) => item.origin === 'app'),
  ).toBe(true);

  // The numbering continues, and the project stays editable (no Backlog.md source).
  const created = await api<TaskRef>(page.request, 'POST', '/tasks', {
    project: 'OPS',
    title: 'Drill the restore',
  });
  expect(created.key).toBe('OPS-7');
  await api(page.request, 'PATCH', '/tasks/OPS-3', { status: 'done' });

  // The screens render on the upgraded data.
  const pages: [string, RegExp | string][] = [
    ['/p/OPS', 'Rotate the database password'],
    ['/p/OPS?view=board', 'Renew the TLS certificate'],
    ['/p/OPS/OPS-1', 'Rotated on the primary; replicas next.'],
    ['/p/OPS/milestones', 'Hardening'],
    ['/settings/connections', 'No git connections yet'],
  ];
  for (const [path, text] of pages) {
    await page.goto(path);
    await settle(page);
    await expect(page.getByText(text).first(), path).toBeVisible();
  }
  await page.goto('/p/OPS/settings');
  await settle(page);
  await expect(page.getByLabel('Repository')).toHaveValue(repository);
});
