// The M1 flow end to end, on a fresh database: a person sets up the server, creates a project and tasks, adds
// an agent with a scoped key, the agent works on a task through the CLI, and the person sees it and revokes
// the key. Each test builds on the previous one, so they share one page and run in order.
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createCli, parseJson } from './cli';
import { admin, workspaceName } from './session';
import { baseURL } from './stack';

const project = { name: 'Payments', key: 'PAY' };
const taskTitles = [
  'Match Stripe payouts to invoices',
  'Flag payouts with no invoice',
  'Export reconciliation report',
];
const agentName = 'e2e-agent';

interface TaskSummary {
  key: string;
  status: string;
}

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
const pageErrors: string[] = [];
const cli = createCli();
let apiKey = '';
let paneTask = '';
let agentTask = '';

/** Waits until the page has loaded and hydrated, so keyboard shortcuts and inputs are live. */
async function settle(target: Page = page): Promise<void> {
  await target.waitForLoadState('networkidle');
  await target.waitForTimeout(500);
}

function selectedTask(): string | null {
  return new URL(page.url()).searchParams.get('task');
}

/**
 * Presses J or K and waits until the list has rendered the new selection, so the next key press starts from
 * it. (Waiting for the URL alone is not enough: the URL changes before the list re-renders.)
 */
async function moveSelection(key: 'j' | 'k'): Promise<string> {
  const before = selectedTask();
  await page.keyboard.press(key);
  await expect.poll(selectedTask).not.toBe(before);
  const now = selectedTask() ?? '';
  expect(now).toMatch(/^PAY-\d+$/);
  await expect(page.getByRole('row', { selected: true })).toContainText(now);
  return now;
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    // The wrong password attempt logs a "status of 401" resource error on purpose.
    if (message.type() === 'error' && !/status of 401\b/.test(message.text())) {
      pageErrors.push(`console: ${message.text()}`);
    }
  });
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

test('first run: set up the admin account and the workspace', async () => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await settle();
  await expect(page.getByRole('heading', { name: 'Set up this server' })).toBeVisible();

  await page.getByLabel('Your name').fill(admin.name);
  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Name your workspace' })).toBeVisible();
  await page.getByLabel('Workspace name').fill(workspaceName);
  await page.getByRole('button', { name: 'Create workspace' }).click();

  // No projects yet, so "/" lands on the projects page.
  await expect(page).toHaveURL(/\/projects$/, { timeout: 15_000 });
  await settle();
  await expect(page.getByRole('button', { name: `${admin.name}: account menu` })).toBeVisible();

  // Setup is one-time: the page now sends visitors elsewhere.
  await page.goto('/setup');
  await expect(page).not.toHaveURL(/\/setup$/);
});

test('sign out, wrong password banner, sign in', async () => {
  await page.goto('/projects');
  await settle();
  await page.getByRole('button', { name: `${admin.name}: account menu` }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/signin/, { timeout: 15_000 });
  await settle();

  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Password').fill('not-the-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Wrong email or password. Check both and try again.');
  await expect(page).toHaveURL(/\/signin/);

  await page.getByLabel('Password').fill(admin.password);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/projects$/, { timeout: 15_000 });
  await settle();
});

test('create project PAY with P', async () => {
  await page.keyboard.press('p');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'New project' })).toBeVisible();
  await dialog.getByLabel('Name', { exact: true }).fill(project.name);
  await expect(dialog.getByLabel('Key', { exact: true })).toHaveValue(project.key);
  await dialog.getByRole('button', { name: /Create project/ }).click();

  await expect(page).toHaveURL(new RegExp(`/p/${project.key}$`), { timeout: 15_000 });
  await settle();
  await expect(page.getByText('No tasks yet').first()).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(project.name) }).first()).toBeVisible();
});

test('quick create three tasks with C and Create more', async () => {
  await page.keyboard.press('c');
  const dialog = page.getByRole('dialog', { name: 'New task' });
  await expect(dialog).toBeVisible();
  const createMore = dialog.getByRole('switch', { name: 'Create more' });
  if (!(await createMore.isChecked())) await createMore.click({ force: true });
  await expect(createMore).toBeChecked();

  const title = dialog.getByRole('textbox', { name: 'Title' });
  for (const text of taskTitles) {
    await title.fill(text);
    await page.keyboard.press('Control+Enter');
    // Create more keeps the dialog open and clears the title for the next task.
    await expect(title).toHaveValue('');
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await settle();

  for (const key of ['PAY-1', 'PAY-2', 'PAY-3']) {
    await expect(page.getByText(key, { exact: true }).first()).toBeVisible();
  }
  for (const text of taskTitles) await expect(page.getByText(text).first()).toBeVisible();
});

test('J and K move the selection; status changes in the pane', async () => {
  await page
    .locator('main')
    .first()
    .click({ position: { x: 5, y: 5 } });
  const first = await moveSelection('j');
  const second = await moveSelection('j');
  expect(second).not.toBe(first);
  expect(await moveSelection('k')).toBe(first);
  paneTask = first;

  // The pane shows the selected task; change its status there.
  const pane = page.getByRole('region', { name: 'Task detail' });
  await expect(pane.getByText(first, { exact: true })).toBeVisible();
  const status = pane.getByRole('button', { name: /Status/ });
  await expect(status).toContainText('Todo');
  await status.click();
  await page.getByRole('option', { name: 'In review' }).click();
  await expect(status).toContainText('In review');

  // The change is saved: it survives a reload and shows in the activity.
  await page.reload();
  await settle();
  await expect(status).toContainText('In review');
  await expect(pane.getByText(`${admin.name} moved it from Todo to In review`)).toBeVisible();
});

test('Enter opens the task page, Esc goes back to the list with the task selected', async () => {
  await page
    .locator('main')
    .first()
    .click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/p/${project.key}/${paneTask}$`), { timeout: 10_000 });
  await settle();
  await expect(page.getByText(paneTask, { exact: true }).first()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/p/${project.key}`);
  await expect.poll(selectedTask).toBe(paneTask);
  await settle();
});

test('add agent e2e-agent with a read-write key scoped to PAY and copy the key', async () => {
  await page.goto('/settings/members');
  await settle();
  await page.getByRole('button', { name: 'Add agent' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add agent' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name', { exact: true }).fill(agentName);
  await dialog.getByRole('radio', { name: /Selected projects/ }).check({ force: true });
  await dialog.getByRole('checkbox', { name: new RegExp(project.key) }).check({ force: true });
  await dialog.getByRole('radio', { name: /Read and write/ }).check({ force: true });
  await dialog.getByRole('button', { name: /Create agent/ }).click();

  const reveal = page.getByRole('alertdialog');
  await expect(reveal).toContainText(`Key created for ${agentName}`);
  await reveal.getByRole('button', { name: 'Copy API key' }).click();
  apiKey = await page.evaluate(() => navigator.clipboard.readText());
  expect(apiKey).toMatch(/^pm_live_\S{20,}$/);
  // The copied key is the one shown in the dialog.
  await expect(reveal).toContainText(apiKey);

  await reveal.getByRole('button', { name: 'I copied the key' }).click();
  await expect(reveal).toBeHidden();
  await expect(page.getByText(agentName).first()).toBeVisible();
});

test('the CLI lists and updates tasks with the agent key', async () => {
  const login = cli.run(['login', '--key', apiKey, '--url', baseURL, '--json']);
  expect(login.code, login.stdout + login.stderr).toBe(0);

  const projects = cli.run(['projects', 'list', '--json']);
  expect(projects.code, projects.stdout + projects.stderr).toBe(0);
  const projectKeys = parseJson<{ items: { key: string }[] }>(projects, 'pm.v1.projects.list').items.map(
    (item) => item.key,
  );
  expect(projectKeys).toEqual([project.key]);

  const list = cli.run(['tasks', 'list', '--project', project.key, '--json']);
  expect(list.code, list.stdout + list.stderr).toBe(0);
  const tasks = parseJson<{ items: TaskSummary[] }>(list, 'pm.v1.tasks.list').items;
  expect(tasks.map((task) => task.key).sort()).toEqual(['PAY-1', 'PAY-2', 'PAY-3']);

  const todo = tasks.find((task) => task.status === 'todo' && task.key !== paneTask);
  expect(todo, 'a task still in Todo').toBeTruthy();
  agentTask = todo?.key ?? '';

  const update = cli.run(['tasks', 'update', agentTask, '--status', 'in_progress', '--json']);
  expect(update.code, update.stdout + update.stderr).toBe(0);
  expect(parseJson<TaskSummary>(update, 'pm.v1.tasks.update')).toMatchObject({
    key: agentTask,
    status: 'in_progress',
  });
});

test('after a reload the pane shows the agent change as "<agent> for <person>"', async () => {
  await page.goto(`/p/${project.key}?task=${agentTask}`);
  await settle();
  const pane = page.getByRole('region', { name: 'Task detail' });
  await expect(pane.getByText(agentTask, { exact: true })).toBeVisible();
  await expect(
    pane.getByText(`${agentName} for ${admin.name} moved it from Todo to In progress`),
  ).toBeVisible();
});

test('a revoked key makes the CLI exit with code 2', async () => {
  await page.goto('/settings/api-keys');
  await settle();
  const row = page.getByRole('row').filter({ hasText: agentName }).first();
  await row.getByRole('button', { name: 'Revoke' }).click();
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog')).first();
  await confirm.getByRole('button', { name: /Revoke/ }).click();
  await expect(confirm).toBeHidden();
  await settle();

  const list = cli.run(['tasks', 'list', '--project', project.key]);
  expect(list.code, list.stdout + list.stderr).toBe(2);
});

test('task list screenshots in light and dark', async ({ browser }, testInfo) => {
  const storageState = await context.storageState();
  for (const colorScheme of ['light', 'dark'] as const) {
    const themed = await browser.newContext({ colorScheme, storageState });
    const themedPage = await themed.newPage();
    themedPage.on('pageerror', (error) => pageErrors.push(`pageerror (${colorScheme}): ${error.message}`));
    await themedPage.goto(`/p/${project.key}?task=${agentTask}`);
    await settle(themedPage);
    await expect(themedPage.getByText(taskTitles[0] ?? '').first()).toBeVisible();
    await testInfo.attach(`task-list-${colorScheme}`, {
      body: await themedPage.screenshot(),
      contentType: 'image/png',
    });
    await themedPage.screenshot({ path: testInfo.outputPath(`task-list-${colorScheme}.png`) });
    await themed.close();
  }
});

test('no page errors during the flow', () => {
  expect(pageErrors).toEqual([]);
});
