// Backlog.md mirror end to end, against a real Forgejo (e2e/forgejo.ts): a git connection, a project created from
// Backlog.md with a custom status mapped by hand, the mirrored tasks in the list, board and panel, a push that
// arrives through the webhook, a broken, a deleted and a restored file, the board refusing a status change,
// cycles and comments on a mirrored task, the agent's pm backlog commands and refused update, and detach.
//
// The tests build on each other, so they share one page and run in order. Forgejo starts in beforeAll and is
// removed in afterAll. E2E_SKIP_BACKLOG=1 skips the spec; so does a missing Docker daemon.
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createCli, parseJson } from './cli';
import { dockerAvailable, type Forgejo, fixtureFolder, readTree, startForgejo } from './forgejo';
import { addAgent, admin, api, collectPageErrors, settle, signInAsAdmin } from './session';
import { baseURL, forgejoAliases, mainStack } from './stack';

const repo = 'payments-api';
// The fixture's task prefix is PAY; the key differs so the spec never collides with the M1 flow's PAY project.
const project = { name: 'Payments API', key: 'API' };
const connectionName = 'Forgejo · e2e mirror';
const agentName = 'backlog-agent';

/** A task with a status the config adds ("QA"), which no app status matches by name. */
const qaTask = `---
id: PAY-20
title: Rate limit alerts
status: QA
assignee: []
created_date: '2025-09-06 09:00'
labels: []
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alert when a merchant hits the rate limit.
<!-- SECTION:DESCRIPTION:END -->
`;

const subtaskPath = 'backlog/tasks/pay-12.1 - Retry-backoff.md';
const nestedPath = 'backlog/tasks/pay-12.1.2 - Backoff-jitter.md';
const qaPath = 'backlog/tasks/pay-20 - Rate-limit-alerts.md';

interface TaskShape {
  key: string;
  title: string;
  status: string;
  priority: string;
  assignee: { name: string } | null;
  hidden?: boolean;
  locked?: string[];
  cycle: { number: number } | null;
  backlog: { id: string; file: string | null } | null;
}
interface SourceStatus {
  state: string;
  lastRead: { commit: string; trigger: string } | null;
  problems: { counts: { files: number; values: number } };
}

test.describe.configure({ mode: 'serial' });
test.skip(process.env.E2E_SKIP_BACKLOG === '1', 'E2E_SKIP_BACKLOG=1');
test.skip(!dockerAvailable(), 'Docker is not available: the Backlog.md specs need it to run Forgejo.');

let context: BrowserContext;
let page: Page;
let forgejo: Forgejo;
let files: Record<string, string>;
/** The webhook URL the settings dialog shows. */
let webhookUrl = '';
const pageErrors: string[] = [];
const cli = createCli();

async function taskOf(key: string): Promise<TaskShape> {
  return api<TaskShape>(page.request, 'GET', `/tasks/${key}`);
}

async function sourceStatus(): Promise<SourceStatus> {
  return api<SourceStatus>(page.request, 'GET', `/projects/${project.key}/backlog`);
}

/** The task list row of a task. */
function listRow(key: string) {
  return page
    .getByRole('grid', { name: `Tasks in ${project.name}` })
    .locator(`[role="row"][data-key="${key}"]`);
}

/** Reloads `path` until `check` passes: open pages only see a refresh on their next refetch. */
async function reloadUntil(path: string, check: () => Promise<void>, timeout: number): Promise<void> {
  await expect(async () => {
    await page.goto(path);
    await settle(page);
    await check();
  }).toPass({ timeout, intervals: [1_000, 2_000] });
}

/** Presses Refresh now in the project header's Backlog.md popover and waits for the read to finish. */
async function refreshNow(): Promise<void> {
  const before = (await sourceStatus()).lastRead?.commit;
  await page.goto(`/p/${project.key}`);
  await settle(page);
  await page.getByRole('button', { name: /^Backlog\.md: / }).click();
  const popover = page.getByRole('dialog', { name: 'Backlog.md mirror' });
  await popover.getByRole('button', { name: 'Refresh now' }).click();
  await expect
    .poll(async () => (await sourceStatus()).lastRead?.commit, { timeout: 90_000, intervals: [1_000] })
    .not.toBe(before);
  await page.keyboard.press('Escape');
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  forgejo = await startForgejo('mirror', mainStack.network, forgejoAliases.mirror);
  files = {
    'README.md': '# Payments API\n',
    ...Object.fromEntries(Object.entries(readTree(fixtureFolder)).map(([path, text]) => [path, text])),
    [qaPath]: qaTask,
  };
  files['backlog/config.yml'] = (files['backlog/config.yml'] as string).replace(
    'statuses: ["To Do", "In Progress", "In Review", "Done"]',
    'statuses: ["To Do", "In Progress", "QA", "In Review", "Done"]',
  );
  await forgejo.createRepository(repo, files);

  context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
    timezoneId: 'UTC',
  });
  page = await context.newPage();
  collectPageErrors(page, pageErrors, [
    // Refused writes (409) and the rejected token (422) show as resource errors on purpose.
    /status of 409\b/,
    /status of 422\b/,
  ]);
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires an object pattern as the first argument.
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && page) {
    await testInfo.attach('page at failure', { body: await page.screenshot(), contentType: 'image/png' });
  }
});

test.afterAll(async () => {
  await context?.close();
  cli.dispose();
  if (process.env.E2E_KEEP_STACK === '1') {
    console.log('[e2e] leaving the mirror spec Forgejo running; the next pnpm e2e run removes it');
    return;
  }
  forgejo?.stop();
});

test('git connection: a wrong token is rejected, the right one works', async () => {
  await signInAsAdmin(page);
  await page.goto('/settings/connections');
  await settle(page);
  await page.getByRole('button', { name: 'Add connection' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add git connection' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: 'Gitea / Forgejo' }).check({ force: true });
  await dialog.getByLabel('Host').fill(forgejo.host);
  await dialog.getByLabel('Name').fill(connectionName);
  await dialog.getByLabel('Access token').fill(`${forgejo.token.slice(0, -6)}000000`);
  await dialog.getByRole('button', { name: 'Test' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Token rejected.');

  await dialog.getByLabel('Access token').fill(forgejo.token);
  await dialog.getByRole('button', { name: 'Test' }).click();
  await expect(dialog.getByRole('status')).toContainText(`Working. Signed in as ${forgejo.user}`);
  await dialog.getByRole('button', { name: 'Save connection' }).click();
  await expect(dialog).toBeHidden();

  const table = page.getByRole('table', { name: 'Git connections' });
  const row = table.getByRole('row').filter({ hasText: connectionName });
  await expect(row).toContainText('Working');
  await expect(row).toContainText(forgejo.host);
});

test('new project from Backlog.md: map the custom status, preview, start mirroring', async () => {
  await page.goto('/projects');
  await settle(page);
  await page.getByRole('button', { name: 'New from Backlog.md' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project from Backlog.md' });
  await dialog.getByLabel('Repository').fill(forgejo.repositoryUrl(repo));
  // The connection is picked by host, and the detection reads project_name from config.yml.
  await expect(dialog.getByText('From project_name in config.yml.')).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByLabel('Name')).toHaveValue(project.name);
  await dialog.getByLabel('Key').fill(project.key);
  await dialog.getByRole('radio', { name: /Mirror/ }).check({ force: true });
  await dialog.getByRole('button', { name: 'Create and continue' }).click();

  // Setup opens at the mappings step.
  await expect(page).toHaveURL(new RegExp(`/p/${project.key}/backlog-setup`), { timeout: 20_000 });
  await settle(page);
  await expect(page.getByRole('heading', { name: `Mirror Backlog.md into ${project.name}` })).toBeVisible();
  // QA matches no app status by name, so it starts on the fallback (Todo).
  const statusMapping = page.getByRole('group', { name: 'Status mapping' });
  const qa = statusMapping.getByRole('button', { name: /QA maps to/ });
  await expect(qa).toHaveAccessibleName(/^Todo/);
  await qa.click();
  await page.getByRole('option', { name: /In review/ }).click();
  await expect(qa).toHaveAccessibleName(/^In review/);
  // @alex is nobody here until mapped by hand; @codex stays unassigned (a fallback with a warning).
  const alex = page
    .getByRole('group', { name: 'Assignee mapping' })
    .getByRole('button', { name: /@alex maps to/ });
  await alex.click();
  await page.getByRole('option', { name: new RegExp(admin.name) }).click();
  await expect(alex).toHaveAccessibleName(new RegExp(`^${admin.name}`));

  await page.getByRole('button', { name: 'Preview' }).click();
  // Six tasks: three in tasks/ (one with a nested subtask), the QA task, an archived one and a draft.
  await expect(page.getByRole('heading', { name: `Mirror 6 tasks into ${project.name}?` })).toBeVisible({
    timeout: 20_000,
  });
  const sample = page.getByRole('region', { name: 'Sample' });
  await expect(sample.getByRole('listitem').filter({ hasText: 'PAY-20' })).toContainText('In review');
  await expect(sample.getByRole('listitem').filter({ hasText: 'DRAFT-1' })).toContainText(
    `${project.key}-21`,
  );

  await page.getByRole('button', { name: 'Start mirroring' }).click();
  await expect(page.getByText(`${project.name} now mirrors`)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: `Open ${project.name}` }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${project.key}(\\?|$)`));

  // @codex has no match, so the mirror runs with one value warning.
  const status = await sourceStatus();
  expect(status).toMatchObject({ state: 'warnings', problems: { counts: { files: 0, values: 1 } } });
  expect(status.lastRead?.commit).toBe(await forgejo.head(repo));
});

test('list, board and panel show the mirrored tasks', async () => {
  // Backlog.md numbers become app keys; the draft takes the next number above the highest task.
  expect(await taskOf(`${project.key}-12`)).toMatchObject({
    title: 'Webhook retries',
    status: 'in_review',
    priority: 'high',
    assignee: { name: admin.name },
  });
  expect(await taskOf(`${project.key}-12.1`)).toMatchObject({
    title: 'Retry backoff',
    status: 'in_progress',
  });
  expect(await taskOf(`${project.key}-12.1.2`)).toMatchObject({ title: 'Backoff jitter', status: 'todo' });
  expect(await taskOf(`${project.key}-20`)).toMatchObject({
    title: 'Rate limit alerts',
    status: 'in_review',
  });
  expect(await taskOf(`${project.key}-21`)).toMatchObject({ title: 'Signed webhooks', status: 'backlog' });
  expect(await taskOf(`${project.key}-3`)).toMatchObject({ title: 'Legacy callbacks', status: 'done' });
  // Backlog.md IDs work wherever a key does.
  expect((await taskOf('PAY-12.1')).key).toBe(`${project.key}-12.1`);

  await page.goto(`/p/${project.key}`);
  await settle(page);
  await expect(page.getByRole('button', { name: 'Backlog.md: Mirroring, with problems' })).toBeVisible();
  // New explains instead of creating: tasks come from the files.
  await expect(page.getByRole('button', { name: /^New/ }).first()).toHaveAttribute('aria-disabled', 'true');
  // Backlog and Done start folded: the draft and the archived task sit there.
  for (const key of ['12', '12.1', '12.1.2', '20']) {
    await expect(listRow(`${project.key}-${key}`)).toBeVisible();
  }
  await expect(listRow(`${project.key}-12.1`)).toContainText(`sub of ${project.key}-12`);

  await page.goto(`/p/${project.key}?view=board`);
  await settle(page);
  await expect(
    page.getByRole('grid', { name: 'In review', exact: true }).locator(`[data-card-key="${project.key}-12"]`),
  ).toBeVisible();

  await page.goto(`/p/${project.key}?task=${project.key}-12`);
  await settle(page);
  const pane = page.getByRole('region', { name: 'Task detail' });
  await expect(pane.getByText('Webhook retries').first()).toBeVisible();
  await expect(pane.getByText('backlog/tasks/pay-12 - Webhook-retries.md').first()).toBeVisible();
  await expect(pane.getByText('PAY-12', { exact: true }).first()).toBeVisible();
  // The Backlog.md block keeps the fields the app has no place for.
  await expect(pane.getByText('webhooks', { exact: true }).first()).toBeVisible();
});

test('webhook: a push shows up within seconds', async () => {
  await page.goto(`/p/${project.key}/settings/backlog?webhook=1`);
  await settle(page);
  const dialog = page.getByRole('dialog', { name: 'Refresh on every push' });
  await expect(dialog).toBeVisible();
  const url =
    (await dialog.getByRole('group', { name: 'URL' }).locator('span.select-all').textContent()) ?? '';
  webhookUrl = url;
  expect(url).toMatch(new RegExp(`^${baseURL}/api/webhooks/backlog/\\S+$`));
  const secretField = dialog.getByRole('group', { name: 'Secret token' });
  await secretField.getByRole('button', { name: 'Show' }).click();
  const secret = ((await secretField.locator('span.select-all').textContent()) ?? '').trim();
  expect(secret.length).toBeGreaterThan(16);

  // Forgejo reaches the web container by its service name on the stack network.
  const hookUrl = `http://web:3000${new URL(url).pathname}`;
  const hook = await forgejo.api<{ id: number }>('POST', `/repos/${forgejo.user}/${repo}/hooks`, {
    type: 'forgejo',
    active: true,
    events: ['push'],
    branch_filter: 'main',
    config: { url: hookUrl, content_type: 'json', secret },
  });

  const commit = await forgejo.commit(repo, 'Rename the backoff subtask', {
    [subtaskPath]: (files[subtaskPath] as string).replace(
      'title: Retry backoff',
      'title: Retry with backoff',
    ),
  });
  // The dialog polls for the delivery and turns its last line green.
  await expect(dialog.getByText(/Last notification received/)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');

  // The refresh runs in the worker; the list shows it on its next load.
  await reloadUntil(
    `/p/${project.key}`,
    async () => {
      await expect(listRow(`${project.key}-12.1`)).toContainText('Retry with backoff', { timeout: 1_000 });
    },
    15_000,
  );
  const status = await sourceStatus();
  expect(status.lastRead).toMatchObject({ commit, trigger: 'webhook' });

  // Later steps refresh on request: webhook pushes within a minute of each other wait for the next slot.
  await forgejo.api('DELETE', `/repos/${forgejo.user}/${repo}/hooks/${hook.id}`);
});

test('a broken file is listed under problems; a deleted file hides its task; restoring brings it back', async () => {
  await forgejo.commit(repo, 'Break the QA task', { [qaPath]: 'not a task file\n' });
  await refreshNow();
  expect((await sourceStatus()).problems.counts.files).toBe(1);
  // The task keeps its last good version.
  expect(await taskOf(`${project.key}-20`)).toMatchObject({ title: 'Rate limit alerts', hidden: false });
  await page.goto(`/p/${project.key}/settings/backlog`);
  await settle(page);
  await expect(page.getByRole('region', { name: 'Problems in the last refresh' })).toContainText(qaPath);

  await forgejo.commit(repo, 'Drop the QA task', { [qaPath]: null });
  await refreshNow();
  expect((await sourceStatus()).problems.counts.files).toBe(0);
  expect(await taskOf(`${project.key}-20`)).toMatchObject({ hidden: true });
  await page.goto(`/p/${project.key}`);
  await settle(page);
  await expect(listRow(`${project.key}-20`)).toHaveCount(0);
  await page.goto(`/p/${project.key}?hidden=only`);
  await settle(page);
  await expect(listRow(`${project.key}-20`)).toBeVisible();
  await page.goto(`/p/${project.key}/${project.key}-20`);
  await settle(page);
  await expect(page.getByText(/Removed from Backlog\.md/).first()).toBeVisible();

  await forgejo.commit(repo, 'Bring the QA task back', { [qaPath]: qaTask });
  await refreshNow();
  expect(await taskOf(`${project.key}-20`)).toMatchObject({ title: 'Rate limit alerts', hidden: false });
  await page.goto(`/p/${project.key}`);
  await settle(page);
  await expect(listRow(`${project.key}-20`)).toBeVisible();
});

test('the board refuses a status change; cycles and comments work on a mirrored task', async () => {
  const key = `${project.key}-12.1`;
  await page.goto(`/p/${project.key}?view=board`);
  await settle(page);
  const card = page.locator(`[data-card-key="${key}"]`);
  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press('Shift+L');
  await expect(
    page.getByText(`${key} stays in In progress: its status comes from Backlog.md.`),
  ).toBeVisible();
  expect((await taskOf(key)).status).toBe('in_progress');

  // The API refuses the same change with the explanation and the file.
  const refused = await page.request.patch(`/api/v1/tasks/${key}`, { data: { status: 'done' } });
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toMatchObject({ code: 'TASK_MIRRORED', field: 'status', file: subtaskPath });

  // Cycles and comments are the app's own.
  const today = new Date().toISOString().slice(0, 10);
  await api(page.request, 'PATCH', `/projects/${project.key}`, { usesCycles: true });
  await api(page.request, 'POST', `/projects/${project.key}/cycles`, { startsOn: today });
  await api(page.request, 'PATCH', `/tasks/${key}`, { cycle: 'current' });
  expect((await taskOf(key)).cycle?.number).toBe(1);

  await page.goto(`/p/${project.key}?task=${key}`);
  await settle(page);
  const pane = page.getByRole('region', { name: 'Task detail' });
  const composer = pane.getByRole('textbox', { name: 'Comment' });
  await expect(composer).toHaveAttribute('placeholder', /Comments stay in this app/);
  await composer.fill('Backoff caps at 30 seconds.');
  await page.keyboard.press('Control+Enter');
  await expect(composer).toHaveValue('');
  await expect(pane.getByText('Backoff caps at 30 seconds.')).toBeVisible();
});

test('agent: pm backlog status and refresh --wait; pm refuses a mirrored field with exit code 6', async () => {
  const apiKey = await addAgent(page, agentName, [project.key]);
  const login = cli.run(['login', '--key', apiKey, '--url', baseURL, '--json']);
  expect(login.code, login.stdout + login.stderr).toBe(0);

  const status = cli.run(['backlog', 'status', '--project', project.key, '--json']);
  expect(status.code, status.stdout + status.stderr).toBe(0);
  expect(parseJson<{ state: string; mode: string }>(status, 'pm.v1.backlog.status')).toMatchObject({
    mode: 'mirror',
    state: 'warnings',
  });

  const commit = await forgejo.commit(repo, 'Agent edits the jitter task', {
    [nestedPath]: (files[nestedPath] as string).replace('status: To Do', 'status: In Progress'),
  });
  const refresh = cli.run(['backlog', 'refresh', '--project', project.key, '--wait', '--json']);
  expect(refresh.code, refresh.stdout + refresh.stderr).toBe(0);
  const result = parseJson<{ outcome: string; status: { lastRead: { commit: string } } }>(
    refresh,
    'pm.v1.backlog.refresh',
  );
  expect(result.outcome).toBe('finished');
  expect(result.status.lastRead.commit).toBe(commit);
  expect((await taskOf(`${project.key}-12.1.2`)).status).toBe('in_progress');

  const update = cli.run(['tasks', 'update', 'PAY-12.1.2', '--status', 'done']);
  expect(update.code, update.stdout + update.stderr).toBe(6);
  expect(update.stderr).toContain('error:');
  expect(update.stderr).toContain(nestedPath);

  const comment = cli.run(['comments', 'add', 'PAY-12.1.2', 'Jitter is in.', '--json']);
  expect(comment.code, comment.stdout + comment.stderr).toBe(0);
});

test('detach: every field is editable and new tasks continue the numbering', async () => {
  await page.goto(`/p/${project.key}/settings/backlog`);
  await settle(page);
  await page.getByRole('button', { name: 'Detach…' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(
    dialog.getByRole('heading', { name: `Detach ${project.name} from Backlog.md?` }),
  ).toBeVisible();
  await expect(dialog).toContainText(`New tasks continue at ${project.key}-22.`);
  await dialog.getByLabel(`Type ${project.key} to confirm`).fill(project.key);
  await dialog.getByRole('button', { name: 'Detach' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await sourceStatus()).state).toBe('detached');

  const updated = await api<TaskShape>(page.request, 'PATCH', `/tasks/${project.key}-12.1`, {
    status: 'done',
  });
  expect(updated.status).toBe('done');
  expect(updated.locked ?? []).toEqual([]);
  // The task keeps its Backlog.md record.
  expect(updated.backlog?.id).toBe('PAY-12.1');

  const created = await api<TaskShape>(page.request, 'POST', '/tasks', {
    project: project.key,
    title: 'Sign webhook payloads',
  });
  expect(created.key).toBe(`${project.key}-22`);

  // The webhook URL of a detached mirror answers 410 Gone.
  const delivery = await page.request.post(webhookUrl, { data: {} });
  expect(delivery.status()).toBe(410);
  expect(pageErrors).toEqual([]);
});
