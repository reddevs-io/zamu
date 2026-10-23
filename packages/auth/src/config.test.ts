import { describe, expect, it } from 'vitest';
import { AuthConfigError, type AuthEnv, discoveryUrl, readAuthConfig } from './config';

const SSO: AuthEnv = {
  OIDC_ISSUER: 'https://auth.example.com/application/o/project-management/',
  OIDC_CLIENT_ID: 'client',
  OIDC_CLIENT_SECRET: 'secret',
};

function problems(env: AuthEnv): string[] {
  try {
    readAuthConfig(env);
  } catch (error) {
    if (error instanceof AuthConfigError) return error.problems;
    throw error;
  }
  return [];
}

describe('readAuthConfig', () => {
  it('keeps M1 behaviour without any variable', () => {
    expect(readAuthConfig({})).toEqual({ sso: null, passwordLogin: true });
  });

  it('treats blank values as unset', () => {
    expect(readAuthConfig({ OIDC_ISSUER: '', OIDC_CLIENT_ID: ' ', PASSWORD_LOGIN: '' })).toEqual({
      sso: null,
      passwordLogin: true,
    });
  });

  it('enables SSO with defaults when issuer, client ID and secret are set', () => {
    expect(readAuthConfig(SSO)).toEqual({
      sso: {
        issuer: 'https://auth.example.com/application/o/project-management',
        clientId: 'client',
        clientSecret: 'secret',
        providerName: 'SSO',
        scopes: ['openid', 'email', 'profile'],
        signup: 'invite',
        adminGroups: [],
        groupsClaim: 'groups',
      },
      passwordLogin: true,
    });
  });

  it('reads the optional variables', () => {
    const config = readAuthConfig({
      ...SSO,
      OIDC_PROVIDER_NAME: 'Authentik',
      OIDC_SCOPES: 'email profile  offline_access',
      OIDC_SIGNUP: 'auto',
      OIDC_ADMIN_GROUPS: 'reddevs-sso-admins, ops ,',
      OIDC_GROUPS_CLAIM: 'roles',
      PASSWORD_LOGIN: 'disabled',
    });
    expect(config).toEqual({
      sso: expect.objectContaining({
        providerName: 'Authentik',
        scopes: ['openid', 'email', 'profile', 'offline_access'],
        signup: 'auto',
        adminGroups: ['reddevs-sso-admins', 'ops'],
        groupsClaim: 'roles',
      }),
      passwordLogin: false,
    });
  });

  it('refuses incomplete credentials, naming what is missing', () => {
    expect(problems({ OIDC_ISSUER: SSO.OIDC_ISSUER })).toEqual([
      expect.stringContaining('OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are missing'),
    ]);
    expect(problems({ OIDC_CLIENT_ID: 'client', OIDC_CLIENT_SECRET: 'secret' })).toEqual([
      expect.stringContaining('OIDC_ISSUER is missing'),
    ]);
  });

  it('refuses a malformed issuer', () => {
    expect(problems({ ...SSO, OIDC_ISSUER: 'auth.example.com' })).toEqual([
      expect.stringContaining('OIDC_ISSUER is not a URL'),
    ]);
    expect(problems({ ...SSO, OIDC_ISSUER: 'ftp://auth.example.com' })).toEqual([
      expect.stringContaining('must start with https://'),
    ]);
    expect(problems({ ...SSO, OIDC_ISSUER: 'https://auth.example.com/?tenant=1' })).toEqual([
      expect.stringContaining('query string'),
    ]);
  });

  it('refuses an unknown OIDC_SIGNUP or PASSWORD_LOGIN value', () => {
    expect(problems({ ...SSO, OIDC_SIGNUP: 'open' })).toEqual([expect.stringContaining('OIDC_SIGNUP')]);
    expect(problems({ ...SSO, PASSWORD_LOGIN: 'off' })).toEqual([expect.stringContaining('PASSWORD_LOGIN')]);
  });

  it('refuses PASSWORD_LOGIN=disabled without SSO', () => {
    expect(problems({ PASSWORD_LOGIN: 'disabled' })).toEqual([
      expect.stringContaining('PASSWORD_LOGIN=disabled needs single sign-on'),
    ]);
  });

  it('refuses SSO options without SSO', () => {
    expect(problems({ OIDC_SIGNUP: 'auto', OIDC_ADMIN_GROUPS: 'admins' })).toEqual([
      expect.stringContaining('OIDC_SIGNUP, OIDC_ADMIN_GROUPS are set, but single sign-on is not configured'),
    ]);
  });

  it('refuses a provider name longer than 40 characters', () => {
    expect(problems({ ...SSO, OIDC_PROVIDER_NAME: 'x'.repeat(41) })).toEqual([
      expect.stringContaining('OIDC_PROVIDER_NAME'),
    ]);
  });

  it('lists every problem in one error', () => {
    const error = (() => {
      try {
        readAuthConfig({ OIDC_ISSUER: 'nope', OIDC_SIGNUP: 'open', PASSWORD_LOGIN: 'disabled' });
      } catch (e) {
        return e as AuthConfigError;
      }
    })();
    expect(error).toBeInstanceOf(AuthConfigError);
    expect(error?.problems.length).toBeGreaterThanOrEqual(3);
    expect(error?.message).toMatch(/^Invalid sign-in configuration:\n- /);
  });

  it('builds the discovery URL', () => {
    expect(discoveryUrl('https://auth.example.com/application/o/pm/')).toBe(
      'https://auth.example.com/application/o/pm/.well-known/openid-configuration',
    );
  });
});
