// Runs in the main Vitest process, where output is not captured: says why the suite is skipped.
import { dockerAvailable } from './docker';

export default function setup(): void {
  if (!dockerAvailable()) {
    process.stderr.write(
      '\n[@pm/git-providers] Skipping the Forgejo integration tests: Docker (with the compose plugin) is not available.\n\n',
    );
  }
}
