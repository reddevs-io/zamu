// Shared people, sign-in and API helpers for the specs. Every spec runs on the same server, so they share the
// admin account: the first spec to run creates it through the setup page, the others sign in.
import { type APIRequestContext, expect, type Page } from '@playwright/test';

export const admin = { name: 'Ana Ruiz', email: 'ana@example.com', password: 'e2e-password-1234' };
export const workspaceName = 'Reddevs';

/** Waits until the page has loaded and hydrated, so keyboard shortcuts and inputs are live. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

/**
 * First run through the setup page: the admin account, then the workspace. Leaves the page signed in on
 * `landing`: setup sends the new admin to "/", which opens the dashboard (the projects page before 0.5.0).
 */
export async function setUpServer(page: Page, landing: RegExp = /\/dashboard$/): Promise<void> {
  await expect(page).toHaveURL(/\/setup$/);
  await settle(page);
  await expect(page.getByRole('heading', { name: 'Set up this server' })).toBeVisible();
  await page.getByLabel('Your name').fill(admin.name);
  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Name your workspace' })).toBeVisible();
  await page.getByLabel('Workspace name').fill(workspaceName);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(landing, { timeout: 15_000 });
}

/**
 * Signs the page's context in as the admin, running the first-run setup when the server is new. Signs in
 * through the auth endpoint rather than the form: on a cold server, hydration can reset a half-filled form.
 */
export async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto('/');
  if (new URL(page.url()).pathname === '/setup') {
    await setUpServer(page);
    return;
  }
  // Better Auth checks the Origin header once the request carries a cookie.
  const response = await page.context().request.post('/api/auth/sign-in/email', {
    data: { email: admin.email, password: admin.password },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

/** JSON call to /api/v1 with the context's session cookie. Fails the test on a non-2xx answer. */
export async function api<T>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await request.fetch(`/api/v1${path}`, { method, data });
  const text = await response.text();
  expect(response.ok(), `${method} ${path}: ${response.status()} ${text}`).toBe(true);
  return (text ? JSON.parse(text) : null) as T;
}

/** Collects page errors and console errors, so a spec can assert there were none. */
export function collectPageErrors(page: Page, errors: string[], ignore: RegExp[] = []): void {
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!ignore.some((pattern) => pattern.test(text))) errors.push(`console: ${text}`);
  });
}

/**
 * Adds an agent in Settings > Members with a read-write key for the given projects and returns the key, read
 * from the clipboard after "Copy API key". The context needs clipboard permissions.
 */
export async function addAgent(page: Page, name: string, projectKeys: string[]): Promise<string> {
  await page.goto('/settings/members');
  await settle(page);
  await page.getByRole('button', { name: 'Add agent' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add agent' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('radio', { name: /Selected projects/ }).check({ force: true });
  for (const key of projectKeys) {
    await dialog.getByRole('checkbox', { name: new RegExp(`\\b${key}\\b`) }).check({ force: true });
  }
  await dialog.getByRole('radio', { name: /Read and write/ }).check({ force: true });
  await dialog.getByRole('button', { name: /Create agent/ }).click();

  const reveal = page.getByRole('alertdialog');
  await expect(reveal).toContainText(`Key created for ${name}`);
  await reveal.getByRole('button', { name: 'Copy API key' }).click();
  const key = await page.evaluate(() => navigator.clipboard.readText());
  expect(key).toMatch(/^pm_live_\S{20,}$/);
  await reveal.getByRole('button', { name: 'I copied the key' }).click();
  await expect(reveal).toBeHidden();
  return key;
}
