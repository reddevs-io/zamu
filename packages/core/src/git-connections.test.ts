import { randomBytes } from 'node:crypto';
import { schema } from '@pm/db';
import {
  type CreateProviderOptions,
  GitHostRefused,
  GitNotFound,
  type GitProvider,
  GitRateLimited,
  GitUnauthorized,
  GitUnexpected,
  GitUnreachable,
  type LookupFn,
} from '@pm/git-providers';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ProviderFactory } from './context';
import { Conflict, Forbidden, Invalid, NotFound } from './errors';
import {
  createConnection,
  deleteConnection,
  describeProviderError,
  type GitConnectionContext,
  getConnection,
  listConnections,
  loadGitHosts,
  markConnectionStatus,
  pausesConnection,
  providerForConnection,
  testConnection,
  updateConnection,
} from './git-connections';
import type { JobQueue } from './jobs';
import { createProject } from './projects';
import { decryptSecret, EncryptionKeyMissing, encryptSecret, loadEncryptionKey } from './secrets';
import { createWorld, randomProjectKey, type TestContext, testContext, type World } from './testing/fixtures';

// Tokens the fake provider understands. None of them may appear in any result or error.
const GOOD = 'glpat-GoodToken-0000000abc';
const OTHER_GOOD = 'glpat-OtherGoodToken-00xyz';
const REJECTED = 'glpat-RejectedToken-000rej';
const FORBIDDEN = 'glpat-ForbiddenToken-00frb';
const DOWN = 'glpat-UnreachableToken-dwn';
const TOKENS = [GOOD, OTHER_GOOD, REJECTED, FORBIDDEN, DOWN];

const ADDRESSES: Record<string, string[]> = {
  'gitlab.com': ['172.65.251.78'],
  'github.com': ['140.82.121.4'],
  'github.example.com': ['140.82.121.5'],
  'codeberg.org': ['217.197.84.140'],
  'git.internal': ['10.0.0.5'],
  'metadata.evil': ['169.254.169.254'],
  'mixed.example': ['140.82.121.6', '192.168.1.10'],
  localhost: ['127.0.0.1'],
};
const lookup: LookupFn = async (hostname) => ADDRESSES[hostname] ?? [];

/** Records every adapter built and answers whoami by token. */
function fakeFactory() {
  const built: CreateProviderOptions[] = [];
  const factory: ProviderFactory = (options) => {
    built.push(options);
    const provider: Partial<GitProvider> = {
      provider: options.provider,
      host: options.host,
      async whoami() {
        switch (options.token) {
          case GOOD:
            return { login: 'reddevs-bot', repoCount: 14 };
          case OTHER_GOOD:
            return { login: 'ana-ruiz' };
          case REJECTED:
            // A provider that echoes the token in its message must not leak it.
            throw new GitUnauthorized(`401 for token ${REJECTED}`, { status: 401 });
          case FORBIDDEN:
            throw new GitUnauthorized(`403 for ${FORBIDDEN}`, { status: 403, code: 'forbidden' });
          case DOWN:
            throw new GitUnreachable(`Could not reach ${options.host} with ${DOWN}`, {
              code: 'ECONNREFUSED',
            });
          default:
            throw new Error('unexpected token in test');
        }
      },
    };
    return provider as GitProvider;
  };
  return { built, factory };
}

function noTokens(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const token of TOKENS) expect(text).not.toContain(token);
}

async function expectRejects<T>(promise: Promise<T>, type: new (...args: never[]) => Error) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(type);
  noTokens((error as Error).message);
  noTokens((error as { issues?: unknown }).issues ?? null);
  return error as Error & { issues?: { path: string; message: string }[] };
}

const unique = () => randomBytes(4).toString('hex');

describe('git connections', () => {
  let base: TestContext;
  let ctx: GitConnectionContext;
  let w: World;
  let other: World;
  let fake: ReturnType<typeof fakeFactory>;

  beforeAll(async () => {
    base = testContext();
    w = await createWorld(base.db);
    other = await createWorld(base.db, 'Elsewhere');
  });
  beforeEach(() => {
    fake = fakeFactory();
    ctx = {
      ...base,
      encryptionKey: loadEncryptionKey(randomBytes(32).toString('base64')),
      providerFactory: fake.factory,
      gitHosts: { allowPrivate: false, httpHosts: [] },
      hostLookup: lookup,
    };
  });
  afterAll(async () => {
    await base?.close();
  });

  const create = (
    overrides: Partial<{
      provider: 'github' | 'gitlab' | 'gitea';
      host: string;
      token: string;
      name: string;
    }> = {},
  ) =>
    createConnection(ctx, w.ownerActor, {
      provider: 'gitlab',
      host: 'gitlab.com',
      token: GOOD,
      name: `GitLab · ${unique()}`,
      ...overrides,
    });

  async function addSource(
    connectionId: string,
    values: Partial<typeof schema.backlogSource.$inferInsert> = {},
    options: { repository?: boolean } = {},
  ) {
    const key = randomProjectKey();
    const projectRow = await createProject(base, w.ownerActor, {
      name: `Project ${key}`,
      key,
      ...(options.repository === false
        ? {}
        : { repository: `https://gitlab.com/reddevs/${key.toLowerCase()}` }),
    });
    const [source] = await base.db
      .insert(schema.backlogSource)
      .values({
        projectId: projectRow.id,
        connectionId,
        mode: 'mirror',
        state: 'healthy',
        webhookId: unique() + unique(),
        createdById: w.owner.id,
        ...values,
      })
      .returning();
    if (!source) throw new Error('source insert failed');
    return { project: projectRow, source };
  }

  const sourceRow = async (id: string) =>
    (await base.db.select().from(schema.backlogSource).where(eq(schema.backlogSource.id, id)))[0];
  const connectionRow = async (id: string) =>
    (await base.db.select().from(schema.gitConnection).where(eq(schema.gitConnection.id, id)))[0];

  describe('loadGitHosts', () => {
    it('reads the flags and normalises the HTTP hosts', () => {
      expect(loadGitHosts({})).toEqual({ allowPrivate: false, httpHosts: [] });
      expect(
        loadGitHosts({ GIT_ALLOW_PRIVATE_HOSTS: 'TRUE', GIT_HTTP_HOSTS: ' localhost:3300, Forgejo.Test ,' }),
      ).toEqual({ allowPrivate: true, httpHosts: ['localhost:3300', 'forgejo.test'] });
      expect(loadGitHosts({ GIT_ALLOW_PRIVATE_HOSTS: '0' }).allowPrivate).toBe(false);
      expect(() => loadGitHosts({ GIT_ALLOW_PRIVATE_HOSTS: 'maybe' })).toThrow(/GIT_ALLOW_PRIVATE_HOSTS/);
      expect(() => loadGitHosts({ GIT_HTTP_HOSTS: 'host/with/path' })).toThrow(/GIT_HTTP_HOSTS/);
    });
  });

  describe('createConnection', () => {
    it('tests the token, then stores it encrypted with a hint and the check result', async () => {
      const name = `GitLab · reddevs ${unique()}`;
      const created = await create({ name, host: 'https://GitLab.com/' });
      expect(created).toMatchObject({
        name,
        provider: 'gitlab',
        host: 'gitlab.com',
        apiBaseUrl: 'https://gitlab.com/api/v4',
        status: 'working',
        tokenHint: 'abc',
        checkedLogin: 'reddevs-bot',
        checkedDetail: null,
        usedBy: [],
        createdBy: { id: w.owner.id, kind: 'person' },
      });
      expect(created.checkedAt).not.toBeNull();
      noTokens(created);
      expect(Object.keys(created)).not.toContain('tokenCiphertext');

      const row = await connectionRow(created.id);
      expect(row?.tokenCiphertext).toMatch(/^v1:/);
      noTokens(row?.tokenCiphertext);
      expect(decryptSecret(ctx, row?.tokenCiphertext as string)).toBe(GOOD);

      expect(fake.built.at(-1)).toMatchObject({
        provider: 'gitlab',
        host: 'gitlab.com',
        token: GOOD,
        allowHttp: false,
        hostPolicy: { allowPrivate: false },
      });
    });

    it('derives the API base URL per provider and host', async () => {
      await expect(create({ provider: 'github', host: 'github.com' })).resolves.toMatchObject({
        apiBaseUrl: 'https://api.github.com',
      });
      await expect(create({ provider: 'github', host: 'github.example.com' })).resolves.toMatchObject({
        apiBaseUrl: 'https://github.example.com/api/v3',
      });
      await expect(create({ provider: 'gitea', host: 'codeberg.org' })).resolves.toMatchObject({
        apiBaseUrl: 'https://codeberg.org/api/v1',
      });
    });

    it('is for owners and admins only', async () => {
      await expectRejects(
        createConnection(ctx, w.memberActor, {
          provider: 'gitlab',
          host: 'gitlab.com',
          token: GOOD,
          name: 'x',
        }),
        Forbidden,
      );
      const error = await expectRejects(
        createConnection(ctx, w.agentActor, {
          provider: 'gitlab',
          host: 'gitlab.com',
          token: GOOD,
          name: 'x',
        }),
        Forbidden,
      );
      expect(error.message).toMatch(/Only workspace admins/);
      const readOnlyOwner = {
        ...w.ownerActor,
        scope: { projects: 'all' as const, access: 'read' as const },
        apiKeyId: crypto.randomUUID(),
      };
      await expectRejects(
        createConnection(ctx, readOnlyOwner, {
          provider: 'gitlab',
          host: 'gitlab.com',
          token: GOOD,
          name: 'x',
        }),
        Forbidden,
      );
      const admin = { ...w.memberActor, role: 'admin' as const };
      await expect(
        createConnection(ctx, admin, {
          provider: 'gitlab',
          host: 'gitlab.com',
          token: GOOD,
          name: `Admin ${unique()}`,
        }),
      ).resolves.toMatchObject({ status: 'working' });
      expect(fake.built).toHaveLength(1);
    });

    it('needs APP_ENCRYPTION_KEY and saves nothing without it', async () => {
      const name = `No key ${unique()}`;
      const { encryptionKey: _key, ...withoutKey } = ctx;
      await expectRejects(
        createConnection(withoutKey, w.ownerActor, {
          provider: 'gitlab',
          host: 'gitlab.com',
          token: GOOD,
          name,
        }),
        EncryptionKeyMissing,
      );
      const { items, encryptionReady } = await listConnections(withoutKey, w.ownerActor);
      expect(encryptionReady).toBe(false);
      expect(items.map((item) => item.name)).not.toContain(name);
      expect(fake.built).toHaveLength(0);
    });

    it('saves nothing when the token is rejected, and never repeats the token', async () => {
      const name = `Rejected ${unique()}`;
      const error = await expectRejects(create({ name, token: REJECTED }), Invalid);
      expect(error.message).toMatch(/gitlab\.com answered 401.*read_api.*Nothing was saved/);
      expect(error.issues?.[0]?.path).toBe('token');

      const forbidden = await expectRejects(create({ token: FORBIDDEN }), Invalid);
      expect(forbidden.message).toMatch(/answered 403/);

      const down = await expectRejects(create({ token: DOWN }), Invalid);
      expect(down.message).toMatch(/Could not reach gitlab\.com \(ECONNREFUSED\)/);
      expect(down.issues?.[0]?.path).toBe('host');

      const { items } = await listConnections(ctx, w.ownerActor);
      expect(items.map((item) => item.name)).not.toContain(name);
    });

    it('refuses a name already used in the workspace, ignoring case', async () => {
      const name = `Shared ${unique()}`;
      await create({ name });
      await expectRejects(create({ name: name.toUpperCase() }), Conflict);
      // Another workspace may use the same name.
      await expect(
        createConnection(ctx, other.ownerActor, {
          provider: 'gitlab',
          host: 'gitlab.com',
          token: GOOD,
          name,
        }),
      ).resolves.toMatchObject({ name });
    });

    it('validates the input', async () => {
      await expectRejects(create({ host: 'gitlab.com/some/path' }), Invalid);
      await expectRejects(create({ token: 'has a space' }), Invalid);
      await expectRejects(create({ name: '  ' }), Invalid);
    });
  });

  describe('host safety', () => {
    it('refuses private addresses unless GIT_ALLOW_PRIVATE_HOSTS is on', async () => {
      const error = await expectRejects(create({ host: 'git.internal' }), Invalid);
      expect(error.message).toMatch(/private address 10\.0\.0\.5.*GIT_ALLOW_PRIVATE_HOSTS=true/);
      expect(error.issues?.[0]?.path).toBe('host');
      // Every address must pass, not just the first.
      await expectRejects(create({ host: 'mixed.example' }), Invalid);
      await expectRejects(create({ host: '127.0.0.1' }), Invalid);
      expect(fake.built).toHaveLength(0);

      ctx.gitHosts = { allowPrivate: true, httpHosts: [] };
      await expect(create({ host: 'git.internal' })).resolves.toMatchObject({ host: 'git.internal' });
      expect(fake.built.at(-1)?.hostPolicy).toMatchObject({ allowPrivate: true });
    });

    it('always refuses link-local and metadata addresses', async () => {
      ctx.gitHosts = { allowPrivate: true, httpHosts: [] };
      const error = await expectRejects(create({ host: 'metadata.evil' }), Invalid);
      expect(error.message).toMatch(/169\.254\.169\.254.*cannot be used/);
      await expectRejects(create({ host: '169.254.169.254' }), Invalid);
      expect(fake.built).toHaveLength(0);
    });

    it('reports hosts that do not resolve', async () => {
      const result = await testConnection(ctx, w.ownerActor, {
        provider: 'gitlab',
        host: 'nowhere.example',
        token: GOOD,
      });
      expect(result).toMatchObject({ status: 'unreachable', detail: 'nowhere.example does not resolve.' });
    });

    it('uses plain HTTP only for GIT_HTTP_HOSTS', async () => {
      ctx.gitHosts = { allowPrivate: true, httpHosts: ['localhost'] };
      const created = await create({ provider: 'gitea', host: 'localhost:3300' });
      expect(created.apiBaseUrl).toBe('http://localhost:3300/api/v1');
      expect(fake.built.at(-1)).toMatchObject({ host: 'localhost:3300', allowHttp: true });

      const { provider } = await providerForConnection(ctx, created.id);
      expect(provider.host).toBe('localhost:3300');
      expect(fake.built.at(-1)).toMatchObject({ allowHttp: true, token: GOOD });
    });
  });

  describe('listConnections', () => {
    it('lists the workspace connections without tokens, with the projects that use them', async () => {
      const connection = await create({ name: `aaa listed ${unique()}` });
      const healthy = await addSource(connection.id);
      const paused = await addSource(connection.id, { state: 'paused' });
      await addSource(connection.id, { state: 'detached', detachedAt: new Date(), detachedById: w.owner.id });
      const foreign = await createConnection(ctx, other.ownerActor, {
        provider: 'gitlab',
        host: 'gitlab.com',
        token: GOOD,
        name: `foreign ${unique()}`,
      });

      const list = await listConnections(ctx, w.memberActor);
      expect(list.encryptionReady).toBe(true);
      noTokens(list);
      const listed = list.items.find((item) => item.id === connection.id);
      expect(listed?.usedBy).toEqual(
        [
          { id: healthy.project.id, key: healthy.project.key, name: healthy.project.name, paused: false },
          { id: paused.project.id, key: paused.project.key, name: paused.project.name, paused: true },
        ].sort((a, b) => a.key.localeCompare(b.key)),
      );
      expect(list.items.map((item) => item.id)).not.toContain(foreign.id);
      const names = list.items.map((item) => item.name.toLowerCase());
      expect(names).toEqual([...names].sort());

      // Agents and members read the list too.
      await expect(listConnections(ctx, w.agentActor)).resolves.toMatchObject({ encryptionReady: true });
      await expect(getConnection(ctx, w.memberActor, connection.id)).resolves.toMatchObject({
        id: connection.id,
      });
      await expectRejects(getConnection(ctx, other.memberActor, connection.id), NotFound);
    });
  });

  describe('testConnection', () => {
    it('tests an unsaved token without storing anything', async () => {
      const ok = await testConnection(ctx, w.ownerActor, {
        provider: 'gitlab',
        host: 'gitlab.com',
        token: GOOD,
      });
      expect(ok).toMatchObject({ status: 'working', login: 'reddevs-bot', repoCount: 14, detail: null });

      const noCount = await testConnection(ctx, w.ownerActor, {
        provider: 'github',
        host: 'github.com',
        token: OTHER_GOOD,
      });
      expect(noCount).toMatchObject({ status: 'working', login: 'ana-ruiz', repoCount: null });

      const rejected = await testConnection(ctx, w.ownerActor, {
        provider: 'gitlab',
        host: 'gitlab.com',
        token: REJECTED,
      });
      expect(rejected).toMatchObject({ status: 'rejected', login: null });
      expect(rejected.detail).toMatch(/gitlab\.com answered 401/);
      noTokens(rejected);

      const down = await testConnection(ctx, w.ownerActor, {
        provider: 'gitlab',
        host: 'gitlab.com',
        token: DOWN,
      });
      expect(down).toMatchObject({ status: 'unreachable' });
      noTokens(down);
    });

    it('works without APP_ENCRYPTION_KEY for unsaved tokens, not for saved ones', async () => {
      const connection = await create();
      const { encryptionKey: _key, ...withoutKey } = ctx;
      await expect(
        testConnection(withoutKey, w.ownerActor, { provider: 'gitlab', host: 'gitlab.com', token: GOOD }),
      ).resolves.toMatchObject({ status: 'working' });
      await expectRejects(
        testConnection(withoutKey, w.ownerActor, { id: connection.id }),
        EncryptionKeyMissing,
      );
    });

    it('is for owners and admins only', async () => {
      const connection = await create();
      await expectRejects(testConnection(ctx, w.memberActor, { id: connection.id }), Forbidden);
      await expectRejects(
        testConnection(ctx, w.memberActor, { provider: 'gitlab', host: 'gitlab.com', token: GOOD }),
        Forbidden,
      );
      await expectRejects(testConnection(ctx, other.ownerActor, { id: connection.id }), NotFound);
    });

    it('stores the result of a saved connection and pauses or resumes its mirrors', async () => {
      const connection = await create();
      const first = await addSource(connection.id, { lastReadCommit: 'abc123' });
      const withWarnings = await addSource(connection.id, {
        state: 'warnings',
        lastReadCommit: 'abc123',
        warnings: [{ code: 'fallback' }],
      });
      const neverRead = await addSource(connection.id, { state: 'setup' });
      const noRepository = await addSource(
        connection.id,
        { lastReadCommit: 'abc123' },
        { repository: false },
      );
      const detached = await addSource(connection.id, {
        state: 'detached',
        detachedAt: new Date(),
        detachedById: w.owner.id,
      });

      // The provider starts rejecting the stored token.
      await updateTokenDirectly(connection.id, REJECTED);
      const rejected = await testConnection(ctx, w.ownerActor, { id: connection.id });
      expect(rejected.status).toBe('rejected');
      noTokens(rejected);
      expect(await connectionRow(connection.id)).toMatchObject({
        status: 'rejected',
        checkedLogin: 'reddevs-bot',
      });
      expect((await connectionRow(connection.id))?.checkedDetail).toMatch(/answered 401/);
      for (const { source } of [first, withWarnings, neverRead, noRepository]) {
        const row = await sourceRow(source.id);
        expect(row?.state).toBe('paused');
        expect(row?.lastError).toMatch(/rejected its token/);
        noTokens(row?.lastError);
      }
      expect((await sourceRow(detached.source.id))?.state).toBe('detached');

      // The token works again: mirrors with a repository resume.
      await updateTokenDirectly(connection.id, GOOD);
      const working = await testConnection(ctx, w.ownerActor, { id: connection.id });
      expect(working).toMatchObject({ status: 'working', login: 'reddevs-bot' });
      expect(await connectionRow(connection.id)).toMatchObject({ status: 'working', checkedDetail: null });
      expect((await sourceRow(first.source.id))?.state).toBe('healthy');
      expect((await sourceRow(first.source.id))?.lastError).toBeNull();
      expect((await sourceRow(withWarnings.source.id))?.state).toBe('warnings');
      expect((await sourceRow(neverRead.source.id))?.state).toBe('setup');
      expect((await sourceRow(noRepository.source.id))?.state).toBe('paused');
      expect((await sourceRow(detached.source.id))?.state).toBe('detached');
    });

    it('tests a replacement token without storing it', async () => {
      const connection = await create();
      const before = await connectionRow(connection.id);
      const result = await testConnection(ctx, w.ownerActor, { id: connection.id, token: REJECTED });
      expect(result.status).toBe('rejected');
      const after = await connectionRow(connection.id);
      expect(after?.status).toBe('working');
      expect(after?.tokenCiphertext).toBe(before?.tokenCiphertext);
      expect(after?.checkedAt).toEqual(before?.checkedAt);
    });

    /** Swaps the stored token behind the service's back, as if the provider revoked or restored it. */
    async function updateTokenDirectly(id: string, token: string) {
      await base.db
        .update(schema.gitConnection)
        .set({ tokenCiphertext: encryptSecret(ctx, token) })
        .where(eq(schema.gitConnection.id, id));
    }
  });

  describe('updateConnection', () => {
    it('renames a connection', async () => {
      const connection = await create();
      const name = `Renamed ${unique()}`;
      const updated = await updateConnection(ctx, w.ownerActor, { id: connection.id, name });
      expect(updated).toMatchObject({ id: connection.id, name, tokenHint: 'abc', status: 'working' });
      // Renaming needs no key.
      const { encryptionKey: _key, ...withoutKey } = ctx;
      await expect(
        updateConnection(withoutKey, w.ownerActor, { id: connection.id, name: `${name} 2` }),
      ).resolves.toMatchObject({ name: `${name} 2` });
      await expectRejects(
        updateConnection(withoutKey, w.ownerActor, { id: connection.id, token: GOOD }),
        EncryptionKeyMissing,
      );
    });

    it('replaces the token after a working test and resumes paused mirrors', async () => {
      const connection = await create();
      const { source } = await addSource(connection.id, { state: 'paused', lastReadCommit: 'abc' });
      await base.db
        .update(schema.gitConnection)
        .set({ status: 'rejected', checkedDetail: 'old' })
        .where(eq(schema.gitConnection.id, connection.id));

      const updated = await updateConnection(ctx, w.ownerActor, { id: connection.id, token: OTHER_GOOD });
      expect(updated).toMatchObject({
        status: 'working',
        tokenHint: 'xyz',
        checkedLogin: 'ana-ruiz',
        checkedDetail: null,
      });
      noTokens(updated);
      expect(decryptSecret(ctx, (await connectionRow(connection.id))?.tokenCiphertext as string)).toBe(
        OTHER_GOOD,
      );
      expect((await sourceRow(source.id))?.state).toBe('healthy');
    });

    it('queues a refresh for each mirror a working token resumes', async () => {
      const connection = await create();
      const { source } = await addSource(connection.id, { state: 'paused', lastReadCommit: 'abc' });
      const sent: { name: string; data: unknown; options: unknown }[] = [];
      const jobs = {
        enqueue: async (_tx: unknown, name: string, data: unknown, options?: unknown) => {
          sent.push({ name, data, options });
          return 'job-1';
        },
      } as unknown as JobQueue;
      await updateConnection({ ...ctx, jobs }, w.ownerActor, { id: connection.id, token: OTHER_GOOD });
      expect(sent).toEqual([
        {
          name: 'backlog.refresh',
          data: { sourceId: source.id, trigger: 'manual' },
          options: expect.anything(),
        },
      ]);
    });

    it('keeps the old token when the new one fails', async () => {
      const connection = await create();
      const before = await connectionRow(connection.id);
      const error = await expectRejects(
        updateConnection(ctx, w.ownerActor, { id: connection.id, token: REJECTED, name: 'never' }),
        Invalid,
      );
      expect(error.issues?.[0]?.path).toBe('token');
      expect(await connectionRow(connection.id)).toEqual(before);
    });

    it('refuses a taken name, other workspaces and members', async () => {
      const first = await create();
      const second = await create();
      await expectRejects(
        updateConnection(ctx, w.ownerActor, { id: second.id, name: first.name.toLowerCase() }),
        Conflict,
      );
      await expectRejects(updateConnection(ctx, other.ownerActor, { id: first.id, name: 'mine' }), NotFound);
      await expectRejects(updateConnection(ctx, w.memberActor, { id: first.id, name: 'mine' }), Forbidden);
      await expectRejects(updateConnection(ctx, w.ownerActor, { id: first.id }), Invalid);
    });
  });

  describe('deleteConnection', () => {
    it('pauses the mirrors that used it in the same transaction and names their projects', async () => {
      const connection = await create();
      const a = await addSource(connection.id);
      const b = await addSource(connection.id, { state: 'warnings' });
      const detached = await addSource(connection.id, {
        state: 'detached',
        detachedAt: new Date(),
        detachedById: w.owner.id,
      });

      const result = await deleteConnection(ctx, w.ownerActor, { id: connection.id });
      expect(result.id).toBe(connection.id);
      expect(result.pausedProjects).toEqual(
        [a.project, b.project]
          .map(({ id, key, name }) => ({ id, key, name }))
          .sort((x, y) => x.key.localeCompare(y.key)),
      );

      const rows = await base.db
        .select()
        .from(schema.backlogSource)
        .where(inArray(schema.backlogSource.id, [a.source.id, b.source.id, detached.source.id]));
      for (const row of rows) {
        expect(row.connectionId).toBeNull();
        if (row.id === detached.source.id) expect(row.state).toBe('detached');
        else {
          expect(row.state).toBe('paused');
          expect(row.lastError).toMatch(/was deleted/);
        }
      }
      expect(await connectionRow(connection.id)).toBeUndefined();
    });

    it('needs no key, and is for admins of the workspace only', async () => {
      const connection = await create();
      await expectRejects(deleteConnection(ctx, w.memberActor, { id: connection.id }), Forbidden);
      await expectRejects(deleteConnection(ctx, other.ownerActor, { id: connection.id }), NotFound);
      const { encryptionKey: _key, ...withoutKey } = ctx;
      await expect(deleteConnection(withoutKey, w.ownerActor, { id: connection.id })).resolves.toMatchObject({
        pausedProjects: [],
      });
      await expectRejects(deleteConnection(ctx, w.ownerActor, { id: connection.id }), NotFound);
    });
  });

  describe('providerForConnection', () => {
    it('builds the adapter with the decrypted token and the host policy', async () => {
      const connection = await create({ provider: 'github', host: 'github.com', token: OTHER_GOOD });
      const { provider, connection: row } = await providerForConnection(ctx, connection.id);
      expect(row.id).toBe(connection.id);
      expect(provider.provider).toBe('github');
      expect(fake.built.at(-1)).toMatchObject({
        provider: 'github',
        host: 'github.com',
        token: OTHER_GOOD,
        allowHttp: false,
        hostPolicy: { allowPrivate: false, lookup },
      });
      await expect(provider.whoami()).resolves.toEqual({ login: 'ana-ruiz' });

      await expectRejects(providerForConnection(ctx, crypto.randomUUID()), NotFound);
      await expectRejects(
        providerForConnection(ctx, connection.id, { workspaceId: other.workspaceId }),
        NotFound,
      );
      const { encryptionKey: _key, ...withoutKey } = ctx;
      await expectRejects(providerForConnection(withoutKey, connection.id), EncryptionKeyMissing);
    });

    it('fails cleanly when the key changed', async () => {
      const connection = await create();
      const changed = { ...ctx, encryptionKey: loadEncryptionKey(randomBytes(32).toString('base64')) };
      const error = await expectRejects(providerForConnection(changed, connection.id), Conflict);
      expect(error.message).toMatch(/APP_ENCRYPTION_KEY/);
    });
  });

  describe('markConnectionStatus', () => {
    it('records a failed refresh inside the caller transaction', async () => {
      const connection = await create();
      const { source } = await addSource(connection.id, { lastReadCommit: 'abc123' });
      const now = new Date('2026-10-23T12:00:00Z');
      const change = await base.db.transaction((tx) =>
        markConnectionStatus(tx, connection.id, 'unreachable', 'gitlab.com did not answer in time.', { now }),
      );
      expect(change).toEqual({ pausedSourceIds: [source.id], resumedSourceIds: [] });
      expect(await connectionRow(connection.id)).toMatchObject({
        status: 'unreachable',
        checkedAt: now,
        checkedDetail: 'gitlab.com did not answer in time.',
        checkedLogin: 'reddevs-bot',
      });
      expect((await sourceRow(source.id))?.lastError).toMatch(
        /could not reach its host: gitlab\.com did not answer/,
      );

      // Marking again pauses nothing new.
      await expect(markConnectionStatus(base.db, connection.id, 'rejected')).resolves.toEqual({
        pausedSourceIds: [],
        resumedSourceIds: [],
      });
      await expect(markConnectionStatus(base.db, connection.id, 'working')).resolves.toEqual({
        pausedSourceIds: [],
        resumedSourceIds: [source.id],
      });

      // Rolled back with the caller's transaction.
      await base.db
        .transaction(async (tx) => {
          await markConnectionStatus(tx, connection.id, 'rejected', 'nope');
          throw new Error('rollback');
        })
        .catch(() => {});
      expect((await connectionRow(connection.id))?.status).toBe('working');
      expect((await sourceRow(source.id))?.state).toBe('healthy');

      await expectRejects(markConnectionStatus(base.db, crypto.randomUUID(), 'working'), NotFound);
    });
  });

  describe('describeProviderError', () => {
    const conn = { provider: 'gitlab' as const, host: 'gitlab.com' };

    it('maps each provider error to a status and our own message', () => {
      const leaky = `token ${GOOD}`;
      const cases: [unknown, string, RegExp][] = [
        [new GitUnauthorized(leaky, { status: 401 }), 'rejected', /answered 401.*read_api/],
        [new GitUnauthorized(leaky, { status: 403, code: 'forbidden' }), 'rejected', /answered 403/],
        [new GitUnreachable(leaky, { code: 'timeout' }), 'unreachable', /did not answer in time/],
        [new GitUnreachable(leaky, { status: 502 }), 'unreachable', /answered 502/],
        [
          new GitUnreachable(leaky, { code: 'ENOTFOUND' }),
          'unreachable',
          /Could not reach gitlab\.com \(ENOTFOUND\)/,
        ],
        [new GitRateLimited(leaky, 60), 'unreachable', /slow down/],
        [new GitNotFound(leaky), 'unreachable', /no GitLab API/],
        [new GitUnexpected(leaky), 'unreachable', /Check the provider and the host/],
      ];
      for (const [error, status, detail] of cases) {
        const result = describeProviderError(error, conn);
        expect(result?.status).toBe(status);
        expect(result?.detail).toMatch(detail);
        noTokens(result);
      }
      const refused = new GitHostRefused('gitlab.com resolves to the private address 10.0.0.1.');
      expect(describeProviderError(refused, conn)).toEqual({
        status: 'unreachable',
        detail: refused.message,
      });
      expect(describeProviderError(new Error('other'), conn)).toBeNull();
    });

    it('says which errors pause a connection', () => {
      expect(pausesConnection(new GitUnauthorized('x'))).toBe(true);
      expect(pausesConnection(new GitUnreachable('x'))).toBe(true);
      expect(pausesConnection(new GitHostRefused('x'))).toBe(true);
      expect(pausesConnection(new GitNotFound('x'))).toBe(false);
      expect(pausesConnection(new GitRateLimited('x', 1))).toBe(false);
      expect(pausesConnection(new GitUnexpected('x'))).toBe(false);
      expect(pausesConnection(new Error('x'))).toBe(false);
    });
  });
});
