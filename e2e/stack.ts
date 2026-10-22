// The docker compose stack the end-to-end suite runs against: the production docker-compose.yml under its own
// project name, so it never touches the development database (docker-compose.dev.yml) or a self-hosted stack
// started from the same checkout. Every run starts on a fresh Postgres volume.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Compose project name: containers are pm-e2e-web-1 and so on, the volume is pm-e2e_pgdata. */
export const composeProject = process.env.E2E_COMPOSE_PROJECT ?? 'pm-e2e';

/** Host port the web container is published on. */
export const port = process.env.E2E_PORT ?? '3100';

/**
 * URL the browser and the CLI use. In GitLab CI the stack runs on the docker:dind service, so the job sets
 * E2E_BASE_URL=http://docker:3100. Better Auth's base URL must match it, so the stack gets the same value.
 */
export const baseURL = (process.env.E2E_BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, '');

/** Image built and run by the stack. Shares the tag with nothing else, so a run never replaces another image. */
export const image = process.env.PM_IMAGE ?? 'project-management:e2e';

/** Path of the CLI that globalSetup builds; the suite runs it like an agent would. */
export const cliPath = fileURLToPath(new URL('../apps/cli/dist/index.js', import.meta.url));

/** Environment for docker compose. Shell values win over the repository's .env, which compose also reads. */
function composeEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PM_IMAGE: image,
    PORT: port,
    BETTER_AUTH_URL: baseURL,
    PUBLIC_URL: baseURL,
    BETTER_AUTH_SECRET:
      process.env.E2E_BETTER_AUTH_SECRET ?? 'e2e-only-secret-never-used-in-production-0123456789',
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: 'postgres',
    POSTGRES_DB: 'project_management',
  };
}

/** Runs `docker compose -p <project> -f docker-compose.yml <args>` from the repository root. */
export function compose(args: string[], options: { quiet?: boolean } = {}): string {
  const output = execFileSync(
    'docker',
    ['compose', '-p', composeProject, '-f', 'docker-compose.yml', ...args],
    {
      cwd: repoRoot,
      env: composeEnv(),
      encoding: 'utf8',
      stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    },
  );
  return output ?? '';
}

/** Polls GET /api/healthz until it answers 200. */
export async function waitForHealthy(timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseURL}/api/healthz`, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`${baseURL}/api/healthz did not answer 200 within ${timeoutMs / 1000} s (last: ${last})`);
}
