// Before the suite: build the CLI and the image, then start the compose stack on a fresh volume.
//
//   E2E_SKIP_BUILD=1   reuse the existing image and CLI build (fails if they are missing)
//   E2E_KEEP_STACK=1   leave the stack running after the run (see global-teardown.ts)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { baseURL, cliPath, compose, composeProject, image, repoRoot, waitForHealthy } from './stack';

export default async function globalSetup(): Promise<void> {
  const skipBuild = process.env.E2E_SKIP_BUILD === '1';

  if (!skipBuild) {
    console.log('[e2e] building the CLI');
    execFileSync('pnpm', ['--filter', '@pm/cli', 'build'], {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  }
  if (!existsSync(cliPath)) throw new Error(`CLI not built: ${cliPath}. Run pnpm --filter @pm/cli build.`);

  console.log(`[e2e] removing any previous ${composeProject} stack and its volume`);
  compose(['down', '-v', '--remove-orphans'], { quiet: true });

  if (!skipBuild) {
    // Uses the Docker layer cache, so an unchanged checkout rebuilds in seconds.
    console.log(`[e2e] building ${image}`);
    compose(['build', 'migrate']);
  }

  console.log(`[e2e] starting ${composeProject} at ${baseURL}`);
  try {
    // Compose waits for the migrate service to finish before it starts web and worker.
    compose(['up', '-d', '--no-build']);
    await waitForHealthy();
  } catch (error) {
    try {
      console.error(compose(['ps', '-a'], { quiet: true }));
      console.error(compose(['logs', '--no-color', '--tail', '100'], { quiet: true }));
    } catch {
      // Keep the original error.
    }
    if (process.env.E2E_KEEP_STACK !== '1') compose(['down', '-v', '--remove-orphans'], { quiet: true });
    throw error;
  }
  console.log('[e2e] stack is healthy');
}
