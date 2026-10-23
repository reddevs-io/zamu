import { schema } from '@pm/db';
import { createTestDatabase, type TestDatabase } from '@pm/db/test';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from './auth';
import { bootstrapAdmin } from './bootstrap';
import { readAuthConfig } from './config';
import { TEST_BASE_URL, TEST_SECRET } from './testing/helpers';

const PASSWORD = 'correct horse battery';

describe('TRUSTED_IP_HEADERS', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    const auth = createAuth({ db: database.db, secret: TEST_SECRET, baseUrl: TEST_BASE_URL });
    await bootstrapAdmin(
      { auth, db: database.db },
      { name: 'Ada', email: 'ada@example.com', password: PASSWORD, workspaceName: 'Reddevs' },
    );
  });

  afterAll(async () => {
    await database?.drop();
  });

  function authWith(env: { TRUSTED_IP_HEADERS?: string }) {
    return createAuth({
      db: database.db,
      secret: TEST_SECRET,
      baseUrl: TEST_BASE_URL,
      config: readAuthConfig(env),
    });
  }

  /** Signs in over HTTP with the given headers and returns the IP recorded on the new session. */
  async function sessionIp(auth: ReturnType<typeof createAuth>, headers: Record<string, string>) {
    const response = await auth.handler(
      new Request(`${TEST_BASE_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: TEST_BASE_URL, ...headers },
        body: JSON.stringify({ email: 'ada@example.com', password: PASSWORD }),
      }),
    );
    expect(response.status).toBe(200);
    const { token } = (await response.json()) as { token: string };
    const [session] = await database.db
      .select({ ipAddress: schema.session.ipAddress })
      .from(schema.session)
      .where(eq(schema.session.token, token));
    return session?.ipAddress;
  }

  const proxied = { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.9' };

  it("passes the headers to Better Auth's advanced.ipAddress.ipAddressHeaders", async () => {
    const auth = authWith({ TRUSTED_IP_HEADERS: 'CF-Connecting-IP, x-forwarded-for' });
    const context = await auth.$context;
    expect(context.options.advanced?.ipAddress?.ipAddressHeaders).toEqual([
      'cf-connecting-ip',
      'x-forwarded-for',
    ]);
    expect(await sessionIp(auth, proxied)).toBe('203.0.113.7');
    expect(await sessionIp(auth, { 'x-forwarded-for': '198.51.100.9' })).toBe('198.51.100.9');
  });

  it("keeps Better Auth's default (x-forwarded-for) when unset", async () => {
    const auth = authWith({});
    expect((await auth.$context).options.advanced?.ipAddress).toBeUndefined();
    expect(await sessionIp(auth, proxied)).toBe('198.51.100.9');
  });
});
