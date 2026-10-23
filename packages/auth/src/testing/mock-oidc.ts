// A real OpenID Connect provider for tests and local walkthroughs (oauth2-mock-server): discovery, JWKS,
// authorization code with PKCE, signed ID tokens. The tests choose who signs in next.
import { Events, OAuth2Server } from 'oauth2-mock-server';

/** Claims of the next identity the provider signs in. */
export interface MockIdentity {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  groups?: string[];
  [claim: string]: unknown;
}

export interface MockOidc {
  /** Issuer URL, for OIDC_ISSUER. */
  issuer: string;
  /** The identity signed in by authorization requests without a known login_hint; null: no email. */
  setIdentity(identity: MockIdentity | null): void;
  /** Signs in `identity` for authorization requests with login_hint=<identity.email>. */
  addIdentity(identity: MockIdentity): void;
  /** The next authorization request ends with ?error=access_denied, as when consent is denied. */
  denyNext(): void;
  stop(): Promise<void>;
  server: OAuth2Server;
}

export async function startMockOidc({
  port = 0,
  host = '127.0.0.1',
}: {
  port?: number;
  host?: string;
} = {}): Promise<MockOidc> {
  const server = new OAuth2Server();
  await server.issuer.keys.generate('RS256');
  let identity: MockIdentity | null = null;
  const byLoginHint = new Map<string, MockIdentity>();
  // Who each authorization code was issued to, so parallel sign-ins keep their own identity.
  const byCode = new Map<string, MockIdentity | null>();

  server.service.on(Events.BeforeAuthorizeRedirect, (redirect, req) => {
    const code = redirect.url.searchParams.get('code');
    const hint = new URL(req.url ?? '/', 'http://mock').searchParams.get('login_hint');
    if (code) byCode.set(code, (hint && byLoginHint.get(hint)) || identity);
  });
  // Runs after the server's own claims (sub, aud, nonce), so these win.
  server.service.on(Events.BeforeTokenSigning, (token, req) => {
    const code = typeof req.body?.code === 'string' ? req.body.code : undefined;
    const claims = code && byCode.has(code) ? byCode.get(code) : identity;
    if (claims) Object.assign(token.payload, claims);
  });
  server.service.on(Events.BeforeUserinfo, (response) => {
    if (identity) response.body = { ...identity };
  });

  await server.start(port, host);
  const issuer = server.issuer.url;
  if (!issuer) throw new Error('mock OIDC server has no issuer URL');

  return {
    issuer,
    server,
    setIdentity(next) {
      identity = next;
    },
    addIdentity(next) {
      byLoginHint.set(next.email, next);
    },
    denyNext() {
      server.service.once(Events.BeforeAuthorizeRedirect, (redirect) => {
        redirect.url.searchParams.delete('code');
        redirect.url.searchParams.set('error', 'access_denied');
        redirect.url.searchParams.set('error_description', 'The user denied consent');
      });
    },
    stop: () => server.stop(),
  };
}
