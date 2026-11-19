// Stored credentials: $XDG_CONFIG_HOME/zamu/config.json (fallback ~/.config/zamu/config.json), mode 0600.
// ZAMU_URL and ZAMU_KEY override the file, so agents in CI never need to write it.
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { authError, usageError } from './errors';
import type { CliIo } from './io';

/** Server used by `zamu login` when neither --url, ZAMU_URL nor a stored URL says otherwise. */
export const DEFAULT_URL = 'http://localhost:3000';

export const StoredConfig = z.object({
  url: z.url(),
  key: z.string().min(1),
});
export type StoredConfig = z.infer<typeof StoredConfig>;

export function configPath(io: Pick<CliIo, 'env' | 'homeDir'>): string {
  const xdg = io.env.XDG_CONFIG_HOME;
  // The XDG spec says relative values are invalid and must be ignored.
  const base = xdg && isAbsolute(xdg) ? xdg : join(io.homeDir, '.config');
  return join(base, 'zamu', 'config.json');
}

export async function readConfig(io: Pick<CliIo, 'env' | 'homeDir'>): Promise<StoredConfig | null> {
  const path = configPath(io);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw usageError(`Cannot read ${path}: ${(error as Error).message}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw usageError(`${path} is not valid JSON. Run zamu logout, then zamu login again.`);
  }
  const parsed = StoredConfig.safeParse(json);
  if (!parsed.success)
    throw usageError(`${path} is not a valid zamu config. Run zamu logout, then zamu login again.`);
  return parsed.data;
}

/** Writes the config atomically with owner-only permissions (directory 0700, file 0600). */
export async function writeConfig(io: Pick<CliIo, 'env' | 'homeDir'>, config: StoredConfig): Promise<string> {
  const path = configPath(io);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  // The mode option only applies when the file is created, and umask may have narrowed it anyway.
  await chmod(temp, 0o600);
  await rename(temp, path);
  return path;
}

/** Removes the config file. Returns the URL it pointed at, or null when there was none. */
export async function deleteConfig(io: Pick<CliIo, 'env' | 'homeDir'>): Promise<string | null> {
  let url: string | null = null;
  try {
    url = (await readConfig(io))?.url ?? null;
  } catch {
    // An unreadable config is removed all the same.
  }
  await rm(configPath(io), { force: true });
  return url;
}

/** Strips trailing slashes so `${url}/api/v1` never doubles them. */
export function normalizeUrl(value: string): string {
  const parsed = z.url({ protocol: /^https?$/ }).safeParse(value.trim());
  if (!parsed.success) throw usageError(`Not an http(s) URL: ${value}`);
  return parsed.data.replace(/\/+$/, '');
}

export interface Credentials {
  url: string;
  key: string;
  /** Where the key came from, for messages. */
  source: 'env' | 'config';
}

/** API key from the environment: ZAMU_KEY, or ZAMU_API_KEY (what the dev seed prints). */
export function envKey(io: Pick<CliIo, 'env'>): string | undefined {
  return io.env.ZAMU_KEY || io.env.ZAMU_API_KEY || undefined;
}

/** URL and key for API calls: ZAMU_URL and ZAMU_KEY first, then the config file. */
export async function resolveCredentials(io: Pick<CliIo, 'env' | 'homeDir'>): Promise<Credentials> {
  const fromEnv = envKey(io);
  const stored = fromEnv && io.env.ZAMU_URL ? null : await readConfig(io);
  const key = fromEnv ?? stored?.key;
  if (!key) {
    throw authError('Not logged in.', ['Run zamu login --key <key>, or set ZAMU_KEY (and ZAMU_URL).']);
  }
  const url = normalizeUrl(io.env.ZAMU_URL || stored?.url || DEFAULT_URL);
  return { url, key, source: fromEnv ? 'env' : 'config' };
}
