import { execFileSync } from 'node:child_process';

/** True when `docker info` and `docker compose version` both work. */
export function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 20_000 });
    execFileSync('docker', ['compose', 'version'], { stdio: 'ignore', timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}
