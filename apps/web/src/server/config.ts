// The web server's configuration from environment variables, checked as a whole so a misconfigured server
// refuses to start with one message listing every problem.
// Framework-free: the startup plugin, getServerContext and tests import it.
import { type AuthConfig, AuthConfigError, readAuthConfig } from '@pm/auth';
import { isValidTimeZone, loadEncryptionKey, loadGitHosts } from '@pm/core';

/** Better Auth signs sessions with BETTER_AUTH_SECRET; shorter secrets are refused. */
export const MIN_SECRET_LENGTH = 32;

const SET_SECRET =
  'Generate one with `openssl rand -base64 32` and set it in .env or the container environment.';

export interface ServerEnv {
  DATABASE_URL?: string | undefined;
  BETTER_AUTH_SECRET?: string | undefined;
  BETTER_AUTH_URL?: string | undefined;
  PUBLIC_URL?: string | undefined;
  OIDC_ISSUER?: string | undefined;
  OIDC_CLIENT_ID?: string | undefined;
  OIDC_CLIENT_SECRET?: string | undefined;
  OIDC_PROVIDER_NAME?: string | undefined;
  OIDC_SCOPES?: string | undefined;
  OIDC_SIGNUP?: string | undefined;
  OIDC_ADMIN_GROUPS?: string | undefined;
  OIDC_GROUPS_CLAIM?: string | undefined;
  OIDC_TRUST_EMAIL?: string | undefined;
  PASSWORD_LOGIN?: string | undefined;
  TRUSTED_IP_HEADERS?: string | undefined;
  APP_TIME_ZONE?: string | undefined;
  APP_ENCRYPTION_KEY?: string | undefined;
  GIT_ALLOW_PRIVATE_HOSTS?: string | undefined;
  GIT_HTTP_HOSTS?: string | undefined;
}

export interface ServerConfig {
  databaseUrl: string;
  secret: string;
  /** BETTER_AUTH_URL without a trailing slash. */
  baseUrl: string;
  /** PUBLIC_URL, defaulting to BETTER_AUTH_URL. */
  publicUrl: string;
  auth: AuthConfig;
  /** APP_TIME_ZONE, an IANA zone name. Default UTC. */
  timeZone: string;
  /**
   * APP_ENCRYPTION_KEY decoded (32 bytes). Optional: without it the server runs and git connections
   * and Backlog.md mirrors are off. A key that is set but not 32 bytes of base64 is a problem.
   */
  encryptionKey: Uint8Array | undefined;
  /** GIT_ALLOW_PRIVATE_HOSTS and GIT_HTTP_HOSTS. */
  gitHosts: { allowPrivate: boolean; httpHosts: string[] };
}

export class ServerConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`The server configuration is invalid:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    this.name = 'ServerConfigError';
  }
}

function httpUrl(name: string, value: string, problems: string[]): string {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return value.replace(/\/+$/, '');
  } catch {
    // Reported below.
  }
  problems.push(`${name} must be an http:// or https:// URL (got "${value}").`);
  return value;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Reads and checks every variable the web server needs. Throws ServerConfigError listing all problems. */
export function readServerConfig(env: ServerEnv = process.env): ServerConfig {
  const problems: string[] = [];

  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (!databaseUrl) problems.push('DATABASE_URL is not set.');

  const secret = env.BETTER_AUTH_SECRET ?? '';
  if (!secret.trim()) {
    problems.push(`BETTER_AUTH_SECRET is not set. ${SET_SECRET}`);
  } else if (secret.length < MIN_SECRET_LENGTH) {
    problems.push(
      `BETTER_AUTH_SECRET is ${secret.length} characters; use ${MIN_SECRET_LENGTH} or more. ${SET_SECRET}`,
    );
  }

  const baseUrlValue = env.BETTER_AUTH_URL?.trim() ?? '';
  let baseUrl = baseUrlValue;
  if (!baseUrlValue) problems.push('BETTER_AUTH_URL is not set. Use the URL people open in their browser.');
  else baseUrl = httpUrl('BETTER_AUTH_URL', baseUrlValue, problems);

  const publicUrlValue = env.PUBLIC_URL?.trim();
  const publicUrl = publicUrlValue ? httpUrl('PUBLIC_URL', publicUrlValue, problems) : baseUrl;

  let auth: AuthConfig = { sso: null, passwordLogin: true, ipAddressHeaders: null };
  try {
    auth = readAuthConfig(env);
  } catch (error) {
    if (!(error instanceof AuthConfigError)) throw error;
    problems.push(...error.problems);
  }

  const timeZone = env.APP_TIME_ZONE?.trim() || 'UTC';
  if (!isValidTimeZone(timeZone)) {
    problems.push(`APP_TIME_ZONE must be an IANA time zone such as Europe/Paris (got "${timeZone}").`);
  }

  // The loaders' messages never echo the key.
  let encryptionKey: Uint8Array | undefined;
  try {
    encryptionKey = loadEncryptionKey(env.APP_ENCRYPTION_KEY);
  } catch (error) {
    problems.push(messageOf(error));
  }

  let gitHosts: ServerConfig['gitHosts'] = { allowPrivate: false, httpHosts: [] };
  try {
    gitHosts = loadGitHosts(env);
  } catch (error) {
    problems.push(`${messageOf(error)}.`);
  }

  if (problems.length > 0) throw new ServerConfigError(problems);
  return { databaseUrl, secret, baseUrl, publicUrl, auth, timeZone, encryptionKey, gitHosts };
}

export interface ServerConfigCheck {
  env: ServerEnv;
  logger: { error(message: string): void };
  exit: (code: 1) => void;
  /** process.env.NODE_ENV. In development the check logs and returns instead of exiting. */
  nodeEnv: string | undefined;
}

/**
 * The startup check (plugins/config-check.ts): logs every configuration problem, then exits 1, before the
 * server listens. In `vite dev` it only logs, since Nitro would restart its runner in a loop; requests then
 * fail with the same message. Returns whether the configuration is valid.
 */
export function checkServerConfig({ env, logger, exit, nodeEnv }: ServerConfigCheck): boolean {
  try {
    readServerConfig(env);
    return true;
  } catch (error) {
    if (!(error instanceof ServerConfigError)) throw error;
    logger.error(error.message);
    if (nodeEnv !== 'development') exit(1);
    return false;
  }
}
