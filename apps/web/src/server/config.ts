// The web server's configuration from environment variables, checked as a whole so a misconfigured server
// refuses to start with one message listing every problem.
// Framework-free: the startup plugin, getServerContext and tests import it.
import { type AuthConfig, AuthConfigError, readAuthConfig } from '@pm/auth';

/** Better Auth signs sessions with BETTER_AUTH_SECRET; shorter secrets are refused. */
export const MIN_SECRET_LENGTH = 32;

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
  PASSWORD_LOGIN?: string | undefined;
}

export interface ServerConfig {
  databaseUrl: string;
  secret: string;
  /** BETTER_AUTH_URL without a trailing slash. */
  baseUrl: string;
  /** PUBLIC_URL, defaulting to BETTER_AUTH_URL. */
  publicUrl: string;
  auth: AuthConfig;
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

/** Reads and checks every variable the web server needs. Throws ServerConfigError listing all problems. */
export function readServerConfig(env: ServerEnv = process.env): ServerConfig {
  const problems: string[] = [];

  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (!databaseUrl) problems.push('DATABASE_URL is not set.');

  const secret = env.BETTER_AUTH_SECRET ?? '';
  if (!secret.trim()) {
    problems.push('BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -base64 32`.');
  } else if (secret.length < MIN_SECRET_LENGTH) {
    problems.push(
      `BETTER_AUTH_SECRET is ${secret.length} characters; use ${MIN_SECRET_LENGTH} or more (\`openssl rand -base64 32\`).`,
    );
  }

  const baseUrlValue = env.BETTER_AUTH_URL?.trim() ?? '';
  let baseUrl = baseUrlValue;
  if (!baseUrlValue) problems.push('BETTER_AUTH_URL is not set. Use the URL people open in their browser.');
  else baseUrl = httpUrl('BETTER_AUTH_URL', baseUrlValue, problems);

  const publicUrlValue = env.PUBLIC_URL?.trim();
  const publicUrl = publicUrlValue ? httpUrl('PUBLIC_URL', publicUrlValue, problems) : baseUrl;

  let auth: AuthConfig = { sso: null, passwordLogin: true };
  try {
    auth = readAuthConfig(env);
  } catch (error) {
    if (!(error instanceof AuthConfigError)) throw error;
    problems.push(...error.problems);
  }

  if (problems.length > 0) throw new ServerConfigError(problems);
  return { databaseUrl, secret, baseUrl, publicUrl, auth };
}
