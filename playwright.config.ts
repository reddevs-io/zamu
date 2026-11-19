// End-to-end tests: Playwright against the docker compose stack (see e2e/stack.ts and docs/self-hosting.md).
// Run with `pnpm e2e`. The suite is one stateful flow on a fresh database, so it runs serially in one worker.
import { defineConfig, devices } from '@playwright/test';
import { baseURL } from './e2e/stack';

const isCI = Boolean(process.env.CI);
const origin = new URL(baseURL);
const isLocalhost = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1';

const backlogSpecs = /backlog-.*\.spec\.ts$/;

const browser = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1280, height: 800 },
  // The test reads the copied key with navigator.clipboard, which needs a secure context. When E2E_BASE_URL
  // points at another Docker host, the stack is not on localhost: there the suite runs full Chromium in new
  // headless mode, the only one that honours the flag below. On localhost the headless shell is enough, and it needs fewer system
  // libraries than full Chromium.
  ...(isLocalhost
    ? {}
    : {
        channel: 'chromium',
        launchOptions: { args: [`--unsafely-treat-insecure-origin-as-secure=${origin.origin}`] },
      }),
};

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  // The flow builds on its own earlier steps on a fresh database: a retry would start halfway through.
  retries: 0,
  forbidOnly: isCI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [['list'], ['junit', { outputFile: 'test-results/junit.xml' }], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    viewport: { width: 1280, height: 800 },
    // The flow uses its own page (see the spec), so failures attach a screenshot there; the trace has the rest.
    trace: 'retain-on-failure',
  },
  // The M1 flow (person-and-agent) sets the server up through the first-run page, so it has to run first. The
  // Backlog.md specs live in a second project, which runs after the first one (one worker, config order).
  projects: [
    { name: 'chromium', testIgnore: backlogSpecs, use: browser },
    { name: 'backlog-md', testMatch: backlogSpecs, use: browser },
  ],
});
