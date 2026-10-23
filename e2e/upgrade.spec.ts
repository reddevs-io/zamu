// Upgrade from M1 (release 0.1.1) to this checkout, on a second compose stack (project pm-e2e-upgrade, port
// 3101) next to the main one: the stack starts on the M1 image, gets data through the M1 app, then switches
// to the image globalSetup built. The migrate service must run the M2 migrations against the M1 data, and the
// data must show on the board in its M1 order.
//
// The M1 image: E2E_M1_IMAGE when set (pulled if it is not local, for example
// registry.gitlab.com/reddevsdotio/tooling/project-management:0.1.1 after `docker login`), else
// project-management:m1-0.1.1, built once from the git tag 0.1.1 (git archive, so the checkout is untouched)
// and reused from the local image store afterwards. E2E_SKIP_UPGRADE=1 skips this spec.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { api, settle, setUpServer, signInAsAdmin } from './session';
import { createStack, image as m2Image, baseURL as mainURL, repoRoot } from './stack';

const M1_TAG = '0.1.1';
const m1Image = process.env.E2E_M1_IMAGE ?? `project-management:m1-${M1_TAG}`;
const upgradePort = process.env.E2E_UPGRADE_PORT ?? '3101';
// Same host as the main stack (localhost, or "docker" in CI), another port.
const upgradeURL = (() => {
  const url = new URL(mainURL);
  url.port = upgradePort;
  return url.origin;
})();

const stack = createStack({
  project: 'pm-e2e-upgrade',
  port: upgradePort,
  baseURL: upgradeURL,
  image: m1Image,
});

interface TaskRef {
  key: string;
  status: string;
}

test.describe.configure({ mode: 'serial' });
test.skip(process.env.E2E_SKIP_UPGRADE === '1', 'E2E_SKIP_UPGRADE=1');

let context: BrowserContext;
let page: Page;
/** Task keys per status in the M1 list order (priority, then most recently updated). */
let m1Order: Record<string, string[]> = {};

function hasImage(name: string): boolean {
  return spawnSync('docker', ['image', 'inspect', name], { stdio: 'ignore' }).status === 0;
}

/** Makes sure the M1 image is local: pulls E2E_M1_IMAGE, or builds the 0.1.1 tag from git. */
function ensureM1Image(): void {
  if (hasImage(m1Image)) return;
  if (process.env.E2E_M1_IMAGE) {
    console.log(`[e2e] pulling ${m1Image}`);
    execFileSync('docker', ['pull', m1Image], { stdio: ['ignore', 'ignore', 'inherit'] });
    return;
  }
  console.log(`[e2e] building ${m1Image} from the git tag ${M1_TAG} (once; later runs reuse it)`);
  const dir = mkdtempSync(join(tmpdir(), 'pm-e2e-m1-'));
  try {
    const archive = join(dir, 'source.tar');
    const source = join(dir, 'source');
    execFileSync('git', ['archive', '--format=tar', '-o', archive, M1_TAG], { cwd: repoRoot });
    execFileSync('mkdir', [source]);
    execFileSync('tar', ['-xf', archive, '-C', source]);
    execFileSync('docker', ['build', '-t', m1Image, source], { stdio: ['ignore', 'ignore', 'inherit'] });
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
  // Building the M1 image from source takes a few minutes the first time.
  test.setTimeout(20 * 60_000);
  ensureM1Image();
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
    console.log(`  docker compose -p ${stack.project} -f docker-compose.yml down -v`);
    return;
  }
  stack.compose(['down', '-v', '--remove-orphans'], { quiet: true });
});

test('M1 0.1.1: set up the server and add a project with tasks', async () => {
  await page.goto('/');
  // M1 has no dashboard: "/" opens the projects page.
  await setUpServer(page, /\/projects$/);

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

test('switch to this build: migrations run and the M1 data shows on the board', async () => {
  test.setTimeout(5 * 60_000);
  expect(migrateState()).toBe('exited 0');

  stack.image = m2Image;
  console.log(`[e2e] switching ${stack.project} to ${m2Image}`);
  await startStack();
  expect(migrateState()).toBe('exited 0');
  const images = stack.compose(['ps', '--format', '{{.Service}} {{.Image}}'], { quiet: true });
  expect(images).toContain(`web ${m2Image}`);

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
});
