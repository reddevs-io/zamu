import { describe, expect, it } from 'vitest';
import { readServerConfig, ServerConfigError, type ServerEnv } from './config';

const BASE: ServerEnv = {
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/pm',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'https://projects.example.com/',
};

const SSO: ServerEnv = {
  OIDC_ISSUER: 'https://auth.example.com/application/o/pm/',
  OIDC_CLIENT_ID: 'pm',
  OIDC_CLIENT_SECRET: 'secret',
};

function problems(env: ServerEnv): string[] {
  try {
    readServerConfig(env);
    return [];
  } catch (error) {
    if (error instanceof ServerConfigError) return error.problems;
    throw error;
  }
}

describe('readServerConfig', () => {
  it('reads a minimal password-only configuration', () => {
    expect(readServerConfig(BASE)).toEqual({
      databaseUrl: BASE.DATABASE_URL,
      secret: BASE.BETTER_AUTH_SECRET,
      baseUrl: 'https://projects.example.com',
      publicUrl: 'https://projects.example.com',
      auth: { sso: null, passwordLogin: true },
    });
  });

  it('reads the production SSO configuration', () => {
    const config = readServerConfig({
      ...BASE,
      ...SSO,
      PUBLIC_URL: 'https://projects.example.com',
      OIDC_PROVIDER_NAME: 'Authentik',
      OIDC_SIGNUP: 'auto',
      OIDC_ADMIN_GROUPS: 'reddevs-sso-admins',
      PASSWORD_LOGIN: 'disabled',
    });
    expect(config.auth).toEqual({
      sso: expect.objectContaining({
        providerName: 'Authentik',
        signup: 'auto',
        adminGroups: ['reddevs-sso-admins'],
      }),
      passwordLogin: false,
    });
  });

  it('refuses a missing or short BETTER_AUTH_SECRET', () => {
    expect(problems({ ...BASE, BETTER_AUTH_SECRET: undefined })).toEqual([
      expect.stringContaining('BETTER_AUTH_SECRET is not set'),
    ]);
    expect(problems({ ...BASE, BETTER_AUTH_SECRET: 'short-secret' })).toEqual([
      expect.stringContaining('BETTER_AUTH_SECRET is 12 characters; use 32 or more'),
    ]);
  });

  it('refuses missing or malformed URLs', () => {
    expect(problems({ ...BASE, DATABASE_URL: '' })).toEqual(['DATABASE_URL is not set.']);
    expect(problems({ ...BASE, BETTER_AUTH_URL: undefined })).toEqual([
      expect.stringContaining('BETTER_AUTH_URL is not set'),
    ]);
    expect(problems({ ...BASE, BETTER_AUTH_URL: 'projects.example.com' })).toEqual([
      expect.stringContaining('BETTER_AUTH_URL must be an http:// or https:// URL'),
    ]);
    expect(problems({ ...BASE, PUBLIC_URL: 'ftp://x' })).toEqual([expect.stringContaining('PUBLIC_URL')]);
  });

  it('refuses PASSWORD_LOGIN=disabled without SSO', () => {
    expect(problems({ ...BASE, PASSWORD_LOGIN: 'disabled' })).toEqual([
      expect.stringContaining('PASSWORD_LOGIN=disabled needs single sign-on'),
    ]);
  });

  it('refuses incomplete SSO credentials and a malformed issuer', () => {
    expect(problems({ ...BASE, OIDC_ISSUER: SSO.OIDC_ISSUER })).toEqual([
      expect.stringContaining('OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are missing'),
    ]);
    expect(problems({ ...BASE, ...SSO, OIDC_ISSUER: 'not a url' })).toEqual([
      expect.stringContaining('OIDC_ISSUER is not a URL'),
    ]);
    expect(problems({ ...BASE, ...SSO, OIDC_SIGNUP: 'everyone' })).toEqual([
      expect.stringContaining('OIDC_SIGNUP'),
    ]);
  });

  it('lists every problem at once', () => {
    const error = (() => {
      try {
        readServerConfig({ PASSWORD_LOGIN: 'disabled' });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ServerConfigError);
    expect((error as ServerConfigError).problems).toHaveLength(4);
    expect((error as Error).message).toMatch(
      /^The server configuration is invalid:\n- DATABASE_URL is not set\./,
    );
  });
});
