// Standalone mock OpenID Connect provider for local walkthroughs of single sign-on. Not for production.
//
//   node --import tsx packages/auth/src/testing/mock-oidc-server.ts [port]     (default port 3262)
//
// Then start the web app with OIDC_ISSUER=http://127.0.0.1:<port>, any OIDC_CLIENT_ID and OIDC_CLIENT_SECRET.
// Choose who signs in next (every "Continue with ..." signs in this identity without a login form):
//
//   curl 'http://127.0.0.1:3262/__identity?email=ana@example.com&name=Ana%20Ruiz&groups=admins,staff'
//   curl 'http://127.0.0.1:3262/__identity?email=bob@example.com&verified=false'
//   curl 'http://127.0.0.1:3262/__deny'     (the next sign-in ends with access_denied)
import { startMockOidc } from './mock-oidc';

const port = Number(process.argv[2] ?? process.env.MOCK_OIDC_PORT ?? 3262);
const mock = await startMockOidc({ port, host: '127.0.0.1' });

function send(res: import('node:http').ServerResponse, body: unknown) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

mock.server.service.addRoute('GET', '/__identity', (req, res) => {
  const query = (req as { query?: Record<string, string | undefined> }).query ?? {};
  const email = query.email ?? 'ana@example.com';
  const identity = {
    sub: query.sub ?? `mock-${email}`,
    email,
    email_verified: query.verified !== 'false',
    name: query.name ?? email.split('@')[0] ?? email,
    groups: (query.groups ?? '').split(',').filter(Boolean),
  };
  mock.setIdentity(identity);
  send(res, identity);
});

mock.server.service.addRoute('GET', '/__deny', (_req, res) => {
  mock.denyNext();
  send(res, { deny: 'next' });
});

console.info(`mock OIDC provider: ${mock.issuer} (set the identity at ${mock.issuer}/__identity?email=...)`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void mock.stop().finally(() => process.exit(0));
  });
}
