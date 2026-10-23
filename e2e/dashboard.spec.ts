// The M4 dashboard end to end: signing in lands on /dashboard; an agent moves a task to In review and
// mentions its person from the CLI; both show in the person's Mine queue and the rail count matches; the
// person answers the mention from the side panel with the keyboard and it leaves the queue; E switches to
// Everyone; `pm dashboard --json` with the agent's key agrees with the API. The tests build on each other, so
// they share one page and run in order. The spec sets the server up when it runs first (it sorts first in file
// order), else it signs in as the admin from the other specs.
import { type BrowserContext, expect, type Page, request, test } from '@playwright/test';
import { createCli, parseJson } from './cli';
import { addAgent, admin, api, collectPageErrors, settle, signInAsAdmin } from './session';
import { baseURL } from './stack';

const project = { name: 'Billing', key: 'BIL' };
const reviewTask = { key: 'BIL-1', title: 'Retry failed refund webhooks' };
const mentionTask = { key: 'BIL-2', title: 'Write the invoice email copy' };
const agentName = 'dash-agent';

type GroupName = 'review' | 'mentions' | 'stalled' | 'deadlines';
type Totals = Record<GroupName, number>;

interface DashboardTask {
  key: string;
  title: string;
  status: string;
}
/** The parts of pm.v1.dashboard (GET /api/v1/dashboard) the spec reads. */
interface Dashboard {
  scope: 'mine' | 'everyone';
  generatedAt: string;
  groups: Record<GroupName, { total: number; items: { task?: DashboardTask }[] }>;
  projects: { key: string }[];
  agents: { agent: { name: string } }[];
}

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
const pageErrors: string[] = [];
const cli = createCli();
let agentKey = '';
let mineBefore = 0;

function totalsOf(dashboard: Dashboard): Totals {
  const { review, mentions, stalled, deadlines } = dashboard.groups;
  return {
    review: review.total,
    mentions: mentions.total,
    stalled: stalled.total,
    deadlines: deadlines.total,
  };
}

function sum(totals: Totals): number {
  return totals.review + totals.mentions + totals.stalled + totals.deadlines;
}

/** The person's dashboard through the API, with the page's session. */
async function personDashboard(scope: 'mine' | 'everyone' = 'mine'): Promise<Dashboard> {
  return api<Dashboard>(page.request, 'GET', `/dashboard?scope=${scope}`);
}

/** The "Dashboard" link in the rail; its accessible name carries the count when there is one. */
function railLink() {
  return page.getByRole('link', { name: /^Dashboard(,|$)/ });
}

/** Rail count as shown: data-count on the link, absent at 0. */
async function railCount(): Promise<number> {
  const value = await railLink().getAttribute('data-count');
  return value == null ? 0 : Number(value);
}

/** The queue surface: "Needs you" (Mine) or "Needs someone" (Everyone). */
function queue(title: 'Needs you' | 'Needs someone') {
  return page.getByRole('region', { name: title, exact: true });
}

/** Total after the queue title (the first count in the surface; group headers follow it). */
async function queueTotal(title: 'Needs you' | 'Needs someone'): Promise<number> {
  return Number(await queue(title).locator('[data-part="count"]').first().textContent());
}

/** Count on a group header: data-group is review, mention, stalled or deadline. */
function groupCount(group: 'review' | 'mention' | 'stalled' | 'deadline') {
  return page.locator(`[data-group="${group}"] [data-part="count"]`);
}

function reviewRow() {
  return page.getByRole('button', { name: `${reviewTask.key} ${reviewTask.title}, in review` });
}

function mentionRow() {
  return page.getByRole('button', { name: new RegExp(`^${agentName} on ${mentionTask.key} `) });
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  page = await context.newPage();
  collectPageErrors(page, pageErrors);
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires an object pattern as the first argument.
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach('page at failure', { body: await page.screenshot(), contentType: 'image/png' });
  }
});

test.afterAll(async () => {
  await context?.close();
  cli.dispose();
});

test('signing in lands on the dashboard', async () => {
  await signInAsAdmin(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await settle(page);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(railLink()).toHaveAttribute('aria-current', 'page');
});

test('seed a project and add an agent with a key for it', async () => {
  await api(page.request, 'POST', '/projects', project);
  for (const task of [reviewTask, mentionTask]) {
    await api(page.request, 'POST', '/tasks', { project: project.key, title: task.title });
  }
  agentKey = await addAgent(page, agentName, [project.key]);
  const login = cli.run(['login', '--key', agentKey, '--url', baseURL, '--json']);
  expect(login.code, login.stdout + login.stderr).toBe(0);
  mineBefore = sum(totalsOf(await personDashboard()));
});

test('the agent moves a task to In review and mentions its person from the CLI', async () => {
  const update = cli.run([
    'tasks',
    'update',
    reviewTask.key,
    '--assignee',
    'me',
    '--status',
    'in_review',
    '--json',
  ]);
  expect(update.code, update.stdout + update.stderr).toBe(0);
  expect(parseJson<{ key: string; status: string }>(update, 'pm.v1.tasks.update')).toMatchObject({
    key: reviewTask.key,
    status: 'in_review',
  });

  const add = cli.run([
    'comments',
    'add',
    mentionTask.key,
    `Which tone should the email use, formal or friendly? @${admin.email}`,
    '--json',
  ]);
  expect(add.code, add.stdout + add.stderr).toBe(0);
  const comment = parseJson<{ body: string }>(add, 'pm.v1.comments.add');
  expect(comment.body).toMatch(new RegExp(`\\[@${admin.name}\\]\\(mention:[^)]+\\)$`));
});

test('after a reload both items show in Mine and the rail count matches the queue', async () => {
  await page.goto('/dashboard');
  await settle(page);
  await expect(queue('Needs you')).toBeVisible();
  await expect(reviewRow()).toBeVisible();
  await expect(reviewRow()).toContainText(`${agentName}`);
  await expect(reviewRow()).toContainText(`for ${admin.name}`);
  await expect(mentionRow()).toBeVisible();
  await expect(mentionRow()).toContainText('Agent asks');

  const totals = totalsOf(await personDashboard());
  expect(totals.review).toBeGreaterThanOrEqual(1);
  expect(totals.mentions).toBeGreaterThanOrEqual(1);
  const total = sum(totals);
  expect(total).toBe(mineBefore + 2);

  await expect(groupCount('review')).toHaveText(String(totals.review));
  await expect(groupCount('mention')).toHaveText(String(totals.mentions));
  expect(await queueTotal('Needs you')).toBe(total);
  await expect(railLink()).toHaveAttribute('data-count', String(total));
  await expect(railLink()).toHaveAccessibleName(
    `Dashboard, ${total} ${total === 1 ? 'item needs' : 'items need'} you`,
  );
});

test('the person answers the mention from the panel and it leaves the queue', async () => {
  const before = await railCount();
  const mentionsBefore = Number(await groupCount('mention').textContent());

  // 2 focuses the first mention: the newest, the agent's.
  await page.keyboard.press('2');
  await expect(mentionRow()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => new URL(page.url()).searchParams.get('task')).toBe(mentionTask.key);
  const pane = page.getByRole('region', { name: 'Task detail' }).first();
  await expect(pane.getByText(mentionTask.key, { exact: true }).first()).toBeVisible();
  const history = pane.getByRole('region', { name: 'Activity and comments' });
  await expect(history.getByRole('article', { name: `Comment by ${agentName}` })).toBeVisible();

  // M focuses the reply box, Ctrl+Enter sends.
  await page.keyboard.press('m');
  const composer = page.getByRole('textbox', { name: 'Comment' });
  await expect(composer).toBeFocused();
  await page.keyboard.type('Friendly, but keep the legal footer.');
  await page.keyboard.press('Control+Enter');
  await expect(composer).toHaveValue('');
  await expect(history.getByRole('article', { name: `Comment by ${admin.name}` })).toContainText(
    'Friendly, but keep the legal footer.',
  );

  // The reply refreshes the dashboard at once: the totals and the rail drop by one. The row itself stays,
  // faded, while the panel is on it.
  await expect(groupCount('mention')).toHaveText(String(mentionsBefore - 1));
  await expect.poll(railCount).toBe(before - 1);
  await expect(mentionRow()).toHaveAttribute('data-gone', 'true');

  // Esc leaves the reply box, a second Esc closes the panel.
  await page.keyboard.press('Escape');
  await expect(composer).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect.poll(() => new URL(page.url()).searchParams.get('task')).toBeNull();

  // Moving focus off the row drops it.
  await page.keyboard.press('1');
  await expect(reviewRow()).toBeFocused();
  await expect(mentionRow()).toHaveCount(0);

  await page.reload();
  await settle(page);
  await expect(reviewRow()).toBeVisible();
  await expect(mentionRow()).toHaveCount(0);
  expect(await railCount()).toBe(before - 1);
  expect(await queueTotal('Needs you')).toBe(before - 1);
  expect(sum(totalsOf(await personDashboard()))).toBe(before - 1);
});

test('E switches to Everyone and back', async () => {
  await page.keyboard.press('e');
  await expect.poll(() => new URL(page.url()).searchParams.get('scope')).toBe('everyone');
  await expect(page.getByRole('heading', { name: 'Needs someone', level: 2 })).toBeVisible();
  const everyone = sum(totalsOf(await personDashboard('everyone')));
  await expect.poll(() => queueTotal('Needs someone')).toBe(everyone);
  // The rail keeps the Mine total.
  expect(await railCount()).toBe(sum(totalsOf(await personDashboard())));

  await page.keyboard.press('e');
  await expect.poll(() => new URL(page.url()).searchParams.get('scope')).toBeNull();
  await expect(page.getByRole('heading', { name: 'Needs you', level: 2 })).toBeVisible();
});

test('pm dashboard --json with the agent key matches the API for that key', async () => {
  const agentApi = await request.newContext({
    baseURL,
    extraHTTPHeaders: { authorization: `Bearer ${agentKey}` },
  });
  try {
    for (const scope of ['mine', 'everyone'] as const) {
      const args = scope === 'everyone' ? ['dashboard', '--everyone', '--json'] : ['dashboard', '--json'];
      const result = cli.run(args);
      expect(result.code, result.stdout + result.stderr).toBe(0);
      const fromCli = parseJson<Dashboard>(result, 'pm.v1.dashboard');
      expect(fromCli.scope).toBe(scope);

      const fromApi = await api<Dashboard>(agentApi, 'GET', `/dashboard?scope=${scope}`);
      expect(totalsOf(fromCli)).toEqual(totalsOf(fromApi));
      // The key is scoped to one project.
      expect(fromCli.projects.map((row) => row.key)).toEqual([project.key]);
    }

    // For an agent's key, Mine is the agent's own tasks: its task in review is there.
    const mine = parseJson<Dashboard>(cli.run(['dashboard', '--json']), 'pm.v1.dashboard');
    expect(mine.groups.review.items.map((item) => item.task?.key)).toContain(reviewTask.key);

    const text = cli.run(['dashboard']);
    expect(text.code, text.stdout + text.stderr).toBe(0);
    expect(text.stdout).toMatch(new RegExp(`^Needs you · ${sum(totalsOf(mine))}$`, 'm'));
    expect(text.stdout).toContain(`In review · ${mine.groups.review.total}`);
    expect(text.stdout).toContain(reviewTask.key);
  } finally {
    await agentApi.dispose();
  }
});

test('no page errors during the flow', () => {
  expect(pageErrors).toEqual([]);
});
