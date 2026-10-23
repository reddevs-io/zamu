// The docker compose stack the end-to-end suite runs against: the production docker-compose.yml under its own
// project name, so it never touches the development database (docker-compose.dev.yml) or a self-hosted stack
// started from the same checkout. Every run starts on a fresh Postgres volume.
//
// The upgrade test (upgrade.spec.ts) starts a second stack from the same compose file under another project
// name and port, first on the M1 image and then on this checkout's image.
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

export interface StackOptions {
  /** Compose project name; also names the data volume (<project>_pgdata). */
  project: string;
  /** Host port of the web container. */
  port: string;
  /** URL the browser uses; BETTER_AUTH_URL and PUBLIC_URL get the same value. */
  baseURL: string;
  /** Image for migrate, web and worker. */
  image: string;
}

export interface Stack extends StackOptions {
  /** Runs `docker compose -p <project> -f docker-compose.yml <args>` from the repository root. */
  compose(args: string[], options?: { quiet?: boolean }): string;
  /** Polls GET /api/healthz until it answers 200. */
  waitForHealthy(timeoutMs?: number): Promise<void>;
  /** Prints `compose ps` and the last log lines, for a failure report. */
  dumpState(): string;
}

/** A compose stack; `image` may change between calls (the upgrade test swaps it). */
export function createStack(options: StackOptions): Stack {
  const stack: Stack = {
    ...options,
    compose(args, { quiet = false } = {}) {
      const output = execFileSync(
        'docker',
        ['compose', '-p', stack.project, '-f', 'docker-compose.yml', ...args],
        {
          cwd: repoRoot,
          // Shell values win over the repository's .env, which compose also reads.
          env: {
            ...process.env,
            PM_IMAGE: stack.image,
            PORT: stack.port,
            BETTER_AUTH_URL: stack.baseURL,
            PUBLIC_URL: stack.baseURL,
            BETTER_AUTH_SECRET:
              process.env.E2E_BETTER_AUTH_SECRET ?? 'e2e-only-secret-never-used-in-production-0123456789',
            POSTGRES_USER: 'postgres',
            POSTGRES_PASSWORD: 'postgres',
            POSTGRES_DB: 'project_management',
          },
          encoding: 'utf8',
          stdio: quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
        },
      );
      return output ?? '';
    },
    async waitForHealthy(timeoutMs = 180_000) {
      const deadline = Date.now() + timeoutMs;
      let last = '';
      while (Date.now() < deadline) {
        try {
          const response = await fetch(`${stack.baseURL}/api/healthz`, {
            signal: AbortSignal.timeout(5_000),
          });
          if (response.ok) return;
          last = `HTTP ${response.status}`;
        } catch (error) {
          last = error instanceof Error ? error.message : String(error);
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      throw new Error(
        `${stack.baseURL}/api/healthz did not answer 200 within ${timeoutMs / 1000} s (last: ${last})`,
      );
    },
    dumpState() {
      try {
        return [
          stack.compose(['ps', '-a'], { quiet: true }),
          stack.compose(['logs', '--no-color', '--tail', '100'], { quiet: true }),
        ].join('\n');
      } catch (error) {
        return `could not read the stack state: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
  return stack;
}

/** The stack every spec but the upgrade test uses. */
export const mainStack = createStack({ project: composeProject, port, baseURL, image });

export const compose = mainStack.compose;
export const waitForHealthy = mainStack.waitForHealthy;
