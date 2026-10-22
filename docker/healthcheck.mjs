// Docker HEALTHCHECK. The web role must answer GET /api/healthz with 200; the worker and migrate roles
// count as healthy while their process runs (Docker only calls this while the container is up).
import { readFileSync } from 'node:fs';

let role = 'web';
try {
  role = readFileSync('/tmp/pm-role', 'utf8').trim() || 'web';
} catch {
  // No role file: the entrypoint did not run yet or /tmp is read-only. Assume web.
}

if (role !== 'web') process.exit(0);

const port = process.env.PORT || '3000';
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/healthz`, { signal: AbortSignal.timeout(4000) });
  process.exit(response.ok ? 0 : 1);
} catch {
  process.exit(1);
}
