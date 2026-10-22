// Runs the built `pm` CLI as a separate process, the way an agent would, with its own config directory so the
// user's real ~/.config/pm is never read or written.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliPath } from './stack';

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** A CLI with its own config directory, created on first use (Playwright loads spec files in several processes). */
export function createCli() {
  let configHome: string | undefined;
  return {
    run(args: string[], env: Record<string, string> = {}): CliResult {
      configHome ??= mkdtempSync(join(tmpdir(), 'pm-e2e-cli-'));
      const result = spawnSync(process.execPath, [cliPath, ...args], {
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          PATH: process.env.PATH ?? '',
          HOME: configHome,
          XDG_CONFIG_HOME: configHome,
          NO_COLOR: '1',
          ...env,
        },
      });
      if (result.error) throw result.error;
      return { code: result.status, stdout: result.stdout, stderr: result.stderr };
    },
    /** Deletes the config directory, including the stored key. */
    dispose(): void {
      if (configHome) rmSync(configHome, { recursive: true, force: true });
    },
  };
}

/** Parses one `--json` result and checks its schema name. */
export function parseJson<T>(result: CliResult, schema: string): T {
  const parsed = JSON.parse(result.stdout) as { schema: string; data: T };
  if (parsed.schema !== schema) throw new Error(`expected ${schema}, got ${parsed.schema}: ${result.stdout}`);
  return parsed.data;
}
