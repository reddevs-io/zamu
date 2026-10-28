// The M2 work views end to end: the board (keyboard moves, undo, drag and drop), milestones, cycles with an
// early end and rollover, comments with mentions from the web and from the CLI, My tasks across two projects,
// and the theme choice. Like the M1 flow, the tests build on each other, so they share one page and run in
// order. The spec signs in as the admin from the M1 flow, or sets the server up itself when it runs alone.
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createCli, parseJson } from './cli';
import { addAgent, admin, api, collectPageErrors, settle, signInAsAdmin } from './session';
import { baseURL } from './stack';

const checkout = { name: 'Checkout', key: 'CHK' };
const website = { name: 'Website', key: 'WEB' };
const agentName = 'claude-dev';

/** Created in this order, so the board's Todo column lists them newest first: CHK-5 at the top. */
const checkoutTitles = [
  'Validate the card form',
  'Add the Apple Pay button',
  'Autocomplete addresses',
  'Show the order summary',
  'Accept coupon codes',
];

interface TaskRef {
  key: string;
  status: string;
  rank?: number;
  milestone: { id: string; name: string } | null;
  cycle: { number: number } | null;
}
interface Me {
  user: { id: string; theme: string };
}

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
const pageErrors: string[] = [];
const cli = createCli();
let me: Me['user'];

/** Today in UTC, as the server sees it: compose sets no APP_TIME_ZONE, so cycles use UTC. */
const todayUtc = () => new Date().toISOString().slice(0, 10);

/** Task keys of a board column, top to bottom. */
async function columnKeys(status: string): Promise<string[]> {
  const grid = page.getByRole('grid', { name: status, exact: true });
  return grid
    .locator('[data-card-key]')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-card-key') ?? ''));
}

async function boardOrder(status: string): Promise<string[]> {
  const list = await api<{ items: TaskRef[] }>(
    page.request,
    'GET',
    `/tasks?project=${checkout.key}&status=${status}&order=board`,
  );
  return list.items.map((task) => task.key);
}

async function taskOf(key: string): Promise<TaskRef> {
  return api<TaskRef>(page.request, 'GET', `/tasks/${key}`);
}

/** A row of the milestones list. */
function milestoneRow(name: string) {
  return page
    .getByRole('list', { name: `Milestones of ${checkout.name}` })
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name, exact: true }) });
}

/** Focuses a card the way a keyboard user lands on it, so the board's Shift+H/J/K/L act on it. */
async function focusCard(key: string): Promise<void> {
  const card = page.locator(`[data-card-key="${key}"]`);
  await card.focus();
  await expect(card).toBeFocused();
}

test.beforeAll(async ({ browser }) => {
  // UTC like the server, so "today" in the date pickers is the server's today.
  context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
    timezoneId: 'UTC',
  });
  page = await context.newPage();
  collectPageErrors(page, pageErrors, [
    // A board move that loses a race is retried by design; the 409 shows as a resource error.
    /status of 409\b/,
  ]);
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

test('seed two projects through the API and add an agent', async () => {
  await signInAsAdmin(page);
  me = (await api<Me>(page.request, 'GET', '/me')).user;

  for (const project of [checkout, website]) {
    await api(page.request, 'POST', '/projects', project);
  }
  for (const title of checkoutTitles) {
    await api(page.request, 'POST', '/tasks', { project: checkout.key, title });
  }
  await api(page.request, 'PATCH', '/tasks/CHK-1', { assignee: 'me' });
  await api(page.request, 'POST', '/tasks', {
    project: website.key,
    title: 'Rewrite the pricing page',
    assignee: 'me',
  });
  await api(page.request, 'POST', '/tasks', { project: website.key, title: 'Add an RSS feed to the blog' });

  const key = await addAgent(page, agentName, [checkout.key, website.key]);
  const login = cli.run(['login', '--key', key, '--url', baseURL, '--json']);
  expect(login.code, login.stdout + login.stderr).toBe(0);
});

test('board: Shift+L moves a card, Ctrl+Z undoes it, Shift+J reorders', async () => {
  await page.goto(`/p/${checkout.key}?view=board`);
  await settle(page);
  await expect(page.getByRole('region', { name: 'Todo, 5 tasks' })).toBeVisible();
  expect(await columnKeys('Todo')).toEqual(['CHK-5', 'CHK-4', 'CHK-3', 'CHK-2', 'CHK-1']);

  await focusCard('CHK-3');
  await page.keyboard.press('Shift+L');
  await expect(
    page.getByRole('grid', { name: 'In progress', exact: true }).locator('[data-card-key="CHK-3"]'),
  ).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'CHK-3 moved to In progress' })).toBeVisible();
  await expect.poll(async () => (await taskOf('CHK-3')).status).toBe('in_progress');

  await page.keyboard.press('Control+z');
  await expect(page.getByText('CHK-3 moved back to Todo')).toBeVisible();
  await expect.poll(async () => (await taskOf('CHK-3')).status).toBe('todo');
  await expect.poll(() => columnKeys('Todo')).toEqual(['CHK-5', 'CHK-4', 'CHK-3', 'CHK-2', 'CHK-1']);
  expect(await boardOrder('todo')).toEqual(['CHK-5', 'CHK-4', 'CHK-3', 'CHK-2', 'CHK-1']);

  await focusCard('CHK-3');
  await page.keyboard.press('Shift+J');
  await expect.poll(() => columnKeys('Todo')).toEqual(['CHK-5', 'CHK-4', 'CHK-2', 'CHK-3', 'CHK-1']);
  await expect.poll(() => boardOrder('todo')).toEqual(['CHK-5', 'CHK-4', 'CHK-2', 'CHK-3', 'CHK-1']);

  // The order is stored: it survives a reload.
  await page.reload();
  await settle(page);
  expect(await columnKeys('Todo')).toEqual(['CHK-5', 'CHK-4', 'CHK-2', 'CHK-3', 'CHK-1']);

  // V switches to the list and back; the project remembers the last view.
  await page.keyboard.press('v');
  await expect(page.getByRole('region', { name: /^Todo, / })).toBeHidden();
  await expect(page.getByRole('row', { name: /\bCHK-3\b/ })).toBeVisible();
  await settle(page);
  await page.keyboard.press('v');
  await expect(page.getByRole('region', { name: /^Todo, / })).toBeVisible();
  await page.goto(`/p/${checkout.key}`);
  await settle(page);
  await expect(page.getByRole('region', { name: /^Todo, / })).toBeVisible();
});

test('board: drag a card to In review', async () => {
  const card = page.locator('[data-card-key="CHK-5"]');
  const target = page.getByRole('grid', { name: 'In review', exact: true });
  await card.dragTo(target);
  await expect(target.locator('[data-card-key="CHK-5"]')).toBeVisible();
  await expect.poll(async () => (await taskOf('CHK-5')).status).toBe('in_review');

  await page.reload();
  await settle(page);
  expect(await columnKeys('In review')).toEqual(['CHK-5']);
});

test('milestone: create, assign from the panel, turns Active when its task starts', async () => {
  await page.goto(`/p/${checkout.key}/milestones`);
  await settle(page);
  await page.getByRole('button', { name: 'New milestone' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New milestone' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name').fill('Launch');
  await dialog.getByRole('button', { name: /^Create/ }).click();
  await expect(dialog).toBeHidden();
  await expect(milestoneRow('Launch')).toContainText('Planned');

  await page.goto(`/p/${checkout.key}?task=CHK-2`);
  await settle(page);
  const pane = page.getByRole('region', { name: 'Task detail' });
  await expect(pane.getByText('CHK-2', { exact: true })).toBeVisible();
  await pane.getByRole('button', { name: 'Milestone: none' }).click();
  await page
    .getByRole('menu', { name: /^Milestone/ })
    .getByRole('menuitemradio', { name: /Launch/ })
    .click();
  await expect(pane.getByRole('button', { name: 'Milestone: Launch' })).toBeVisible();

  const status = pane.getByRole('button', { name: /Status/ });
  await status.click();
  await page.getByRole('option', { name: 'In progress' }).click();
  await expect(status).toContainText('In progress');

  await page.goto(`/p/${checkout.key}/milestones`);
  await settle(page);
  await expect(milestoneRow('Launch')).toContainText('Active');
  const task = await taskOf('CHK-2');
  expect(task.milestone?.name).toBe('Launch');
});

test('cycle: create one starting today, end it early, unfinished tasks roll over', async () => {
  await page.goto(`/p/${checkout.key}/cycles`);
  await settle(page);
  await page.getByRole('button', { name: 'New cycle' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New cycle' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox').fill('Checkout polish');

  // The first cycle defaults to next Monday; start it today instead.
  await dialog.getByRole('button', { name: /Starts/ }).click();
  const today = todayUtc();
  const day = page.locator(`[data-date="${today}"]`);
  if (!(await day.isVisible())) await page.getByRole('button', { name: 'Previous month' }).click();
  await day.click();
  await dialog.getByRole('button', { name: /^Create/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('region', { name: 'Current cycle: Cycle 1' })).toBeVisible();

  // The agent puts three tasks in the current cycle from the CLI; one of them gets done.
  for (const key of ['CHK-1', 'CHK-3', 'CHK-4']) {
    const update = cli.run(['tasks', 'update', key, '--cycle', 'current', '--json']);
    expect(update.code, update.stdout + update.stderr).toBe(0);
    expect(parseJson<TaskRef>(update, 'pm.v1.tasks.update').cycle?.number).toBe(1);
  }
  const done = cli.run(['tasks', 'update', 'CHK-4', '--status', 'done', '--json']);
  expect(done.code, done.stdout + done.stderr).toBe(0);

  await page.goto(`/p/${checkout.key}/cycles/1`);
  await settle(page);
  await page.getByRole('button', { name: 'End cycle' }).click();
  const end = page.getByRole('dialog', { name: 'End Cycle 1 now?' });
  await expect(end).toBeVisible();
  await expect(end).toContainText('New Cycle 2');
  await end.getByRole('button', { name: 'End and move 2' }).click();
  await expect(end).toBeHidden();

  // The completed cycle page keeps the record of what moved.
  await page.goto(`/p/${checkout.key}/cycles/1`);
  await settle(page);
  const cycle = page.getByRole('region', { name: 'Cycle 1' });
  await expect(cycle.getByText('Completed', { exact: true }).first()).toBeVisible();
  const rolled = cycle.getByRole('list', { name: 'Rolled over' });
  await expect(rolled.getByRole('listitem')).toHaveCount(2);
  await expect(rolled.getByRole('listitem').filter({ hasText: 'CHK-1' })).toContainText('Cycle 2');
  await expect(rolled.getByRole('listitem').filter({ hasText: 'CHK-3' })).toContainText('Cycle 2');

  for (const key of ['CHK-1', 'CHK-3']) expect((await taskOf(key)).cycle?.number).toBe(2);
  expect((await taskOf('CHK-4')).cycle?.number).toBe(1);

  const current = cli.run(['cycles', 'current', '--project', checkout.key, '--json']);
  expect(current.code, current.stdout + current.stderr).toBe(0);
});

test('comments: mention from the web, from the CLI as the agent, edit and delete', async () => {
  await page.goto(`/p/${checkout.key}?task=CHK-1`);
  await settle(page);
  const pane = page.getByRole('region', { name: 'Task detail' });
  await expect(pane.getByText('CHK-1', { exact: true })).toBeVisible();
  const history = pane.getByRole('region', { name: 'Activity and comments' });

  // M focuses the composer, @ opens the picker, Enter inserts the mention, Ctrl+Enter sends.
  await page.locator('body').click({ position: { x: 600, y: 5 } });
  await page.keyboard.press('m');
  const composer = page.getByRole('textbox', { name: 'Comment' });
  await expect(composer).toBeFocused();
  await page.keyboard.type('Can you take this @clau');
  const picker = page.getByRole('listbox', { name: 'Mention' });
  await expect(picker.getByRole('option', { name: new RegExp(agentName) })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(picker).toBeHidden();
  await page.keyboard.type('please');
  await page.keyboard.press('Control+Enter');
  await expect(composer).toHaveValue('');

  const own = history.getByRole('article', { name: `Comment by ${admin.name}` });
  await expect(own).toHaveCount(1);
  await expect(own.locator('[data-mention="agent"]')).toHaveText(new RegExp(agentName));

  // The agent answers from the CLI with a plain @email; the server turns it into a mention.
  const add = cli.run(['comments', 'add', 'CHK-1', `On it. @${admin.email}`, '--json']);
  expect(add.code, add.stdout + add.stderr).toBe(0);
  const agentComment = parseJson<{ id: string; body: string }>(add, 'pm.v1.comments.add');
  expect(agentComment.body).toBe(`On it. [@${admin.name}](mention:${me.id})`);

  // Only authors edit or delete: the agent cannot delete Ana's comment (exit code 4).
  const list = cli.run(['comments', 'list', 'CHK-1', '--json']);
  expect(list.code, list.stdout + list.stderr).toBe(0);
  const comments = parseJson<{ items: { id: string; author: { name: string } }[] }>(
    list,
    'pm.v1.comments.list',
  );
  const anaComment = comments.items.find((comment) => comment.author.name === admin.name);
  expect(anaComment).toBeTruthy();
  const refused = cli.run(['comments', 'delete', anaComment?.id ?? '', '--json']);
  expect(refused.code, refused.stdout + refused.stderr).toBe(4);

  await page.reload();
  await settle(page);
  const fromAgent = history.getByRole('article', { name: `Comment by ${agentName}` });
  await expect(fromAgent).toContainText(`for ${admin.name}`);
  await expect(fromAgent.locator('[data-mention]')).toHaveText(new RegExp(admin.name));
  // Ana may not edit the agent's comment.
  await expect(fromAgent.getByRole('button', { name: 'Edit' })).toHaveCount(0);

  await own.getByRole('button', { name: 'Edit' }).click();
  const editor = page.getByRole('textbox', { name: 'Edit comment' });
  await editor.fill('Can you take this today?');
  await page.keyboard.press('Control+Enter');
  await expect(own).toContainText('Can you take this today?');
  await expect(own).toContainText('· edited');

  await own.getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete this comment?' });
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(history.getByText(`Comment deleted by ${admin.name}`)).toBeVisible();

  const show = cli.run(['tasks', 'show', 'CHK-1', '--json']);
  expect(show.code, show.stdout + show.stderr).toBe(0);
  const timeline = parseJson<{ timeline: { kind: string }[] }>(show, 'pm.v1.tasks.show').timeline;
  expect(timeline.filter((entry) => entry.kind === 'comment')).toHaveLength(2);
});

test('task list keys: Down skips a group row, Left collapses the group, Right expands it', async () => {
  // The board test left the board as the remembered view; open the list.
  await page.goto('/');
  await page.evaluate((key) => localStorage.removeItem(`pm:view:${key}`), checkout.key);
  await page.goto(`/p/${checkout.key}`);
  await settle(page);
  const grid = page.getByRole('grid', { name: `Tasks in ${checkout.name}` });
  await expect(grid.locator('[data-group-row]').first()).toBeVisible();
  const rows = await grid.locator('[role="row"][data-key]').evaluateAll((elements) =>
    elements.map((row) => ({
      key: row.getAttribute('data-key') ?? '',
      group: row.hasAttribute('data-group-row'),
    })),
  );
  // The last task of one group, the next group's row, and that group's first task.
  const at = rows.findIndex(
    (row, index) => !row.group && rows[index + 1]?.group && rows[index + 2] && !rows[index + 2]?.group,
  );
  expect(at, JSON.stringify(rows)).toBeGreaterThanOrEqual(0);
  const before = rows[at]?.key ?? '';
  const groupKey = rows[at + 1]?.key ?? '';
  const after = rows[at + 2]?.key ?? '';
  const row = (key: string) => grid.locator(`[role="row"][data-key="${key}"]`);
  // Group row keys start with a control character, so find the group row by position.
  const groupRow = grid.locator('[data-group-row]').nth(rows.slice(0, at + 1).filter((r) => r.group).length);
  const focusedRow = () =>
    page.evaluate(() => document.activeElement?.closest('[role="row"]')?.getAttribute('data-key') ?? null);

  await row(before).getByText(before, { exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('task')).toBe(before);
  await expect.poll(focusedRow).toBe(before);

  // Down lands on the next task, not on the group row between them.
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => new URL(page.url()).searchParams.get('task')).toBe(after);
  await expect.poll(focusedRow).toBe(after);
  await expect(row(after)).toHaveAttribute('aria-selected', 'true');

  // Left folds the task's group and puts focus on the group row; the task stays selected.
  await page.keyboard.press('ArrowLeft');
  await expect(row(after)).toHaveCount(0);
  await expect.poll(focusedRow).toBe(groupKey);
  await expect(groupRow).toContainText('collapsed');
  expect(new URL(page.url()).searchParams.get('task')).toBe(after);

  // Right opens it again and focuses its first task.
  await page.keyboard.press('ArrowRight');
  await expect(row(after)).toBeVisible();
  await expect(groupRow).toContainText('expanded');
  await expect.poll(focusedRow).toBe(after);

  // Up skips the group row too.
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => new URL(page.url()).searchParams.get('task')).toBe(before);
  await expect.poll(focusedRow).toBe(before);
});

test('My tasks lists tasks from both projects and opens them in the panel', async () => {
  // The agent takes WEB-2: it shows in the agent's --mine, not in Ana's My tasks.
  const assign = cli.run(['tasks', 'update', 'WEB-2', '--assignee', 'me', '--json']);
  expect(assign.code, assign.stdout + assign.stderr).toBe(0);
  const mine = cli.run(['tasks', 'list', '--mine', '--json']);
  expect(mine.code, mine.stdout + mine.stderr).toBe(0);
  expect(parseJson<{ items: TaskRef[] }>(mine, 'pm.v1.tasks.list').items.map((task) => task.key)).toEqual([
    'WEB-2',
  ]);

  await page.goto('/');
  await settle(page);
  await page.getByRole('link', { name: 'My tasks' }).click();
  await expect(page).toHaveURL(/\/my-tasks/);
  await settle(page);
  await expect(page.getByRole('row', { name: /\bCHK-1\b/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /\bWEB-1\b/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /\bWEB-2\b/ })).toHaveCount(0);

  await page.getByRole('row', { name: /\bWEB-1\b/ }).click();
  const pane = page.getByRole('region', { name: 'Task detail' });
  await expect(pane.getByText('WEB-1', { exact: true })).toBeVisible();
  await expect(pane).toContainText(`in ${website.name}`);
});

test('theme: Dark from the account menu survives a reload with no flash', async () => {
  await page.goto('/my-tasks');
  await settle(page);
  await page.getByRole('button', { name: `${admin.name}: account menu` }).click();
  const account = page.getByRole('dialog', { name: 'Account' });
  await account.getByRole('radio', { name: 'Dark' }).click({ force: true });
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expect.poll(async () => (await api<Me>(page.request, 'GET', '/me')).user.theme).toBe('dark');
  await page.keyboard.press('Escape');

  // The server renders the class, so the first HTML already has it: no light frame before hydration.
  const html = await (await page.request.get('/my-tasks')).text();
  expect(html).toMatch(/<html[^>]*class="[^"]*\bdark\b/);

  await page.reload();
  await settle(page);
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.goto('/settings/appearance');
  await settle(page);
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();

  // Back to System: no class, the page follows the browser.
  await page.getByRole('radio', { name: /System/ }).click({ force: true });
  await expect.poll(async () => (await api<Me>(page.request, 'GET', '/me')).user.theme).toBe('system');
  const after = await (await page.request.get('/my-tasks')).text();
  expect(after).not.toMatch(/<html[^>]*class="[^"]*\bdark\b/);
});

test('no page errors during the flow', () => {
  expect(pageErrors).toEqual([]);
});
