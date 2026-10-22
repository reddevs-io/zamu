// After the suite: stop the stack and delete its volume, unless E2E_KEEP_STACK=1 (to inspect a failure).
import { compose, composeProject } from './stack';

export default async function globalTeardown(): Promise<void> {
  if (process.env.E2E_KEEP_STACK === '1') {
    console.log(`[e2e] leaving ${composeProject} running. Remove it with:`);
    console.log(`  docker compose -p ${composeProject} -f docker-compose.yml down -v`);
    return;
  }
  compose(['down', '-v', '--remove-orphans'], { quiet: true });
}
