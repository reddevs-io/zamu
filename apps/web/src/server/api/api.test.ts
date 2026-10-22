// /api/v1 through the HTTP handler against a throwaway database, with a session cookie and with API
// keys of different scopes. Data comes from the dev seed (PAY with 11 tasks, WEB with 4).
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { createAuth } from '@pm/auth';
import {
  type Actor,
  type CoreContext,
  createApiKey,
  createProject,
  createTask,
  listProjects,
  revokeApiKey,
} from '@pm/core';
import { createWorld } from '@pm/core/testing/fixtures';
import { createTestDatabase, type TestDatabase } from '@pm/db/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDevData } from '../seed';
import { type ApiClient, createApiClient, createApiFetchHandler, RPC_PREFIX } from './index';

const ORIGIN = 'http://localhost:3000';
const SECRET = 'test-secret-test-secret-test-secret-0123';

let database: TestDatabase;
let core: CoreContext;
let handle: (request: Request) => Promise<Response>;
let cookie: string;
let admin: Actor;
const keys = {} as {
  agent: string;
  admin: string;
  adminRead: string;
  agentPayOnly: string;
  revoked: string;
};
let otherWorkspaceTask: string;

type Auth = { cookie: string } | { key: string } | null;

interface CallOptions {
  auth?: Auth;
  body?: unknown;
  headers?: Record<string, string>;
}

async function call(method: string, path: string, { auth = null, body, headers = {} }: CallOptions = {}) {
  const init: RequestInit = { method, headers: { ...headers } };
  const h = init.headers as Record<string, string>;
  if (auth && 'cookie' in auth) h.cookie = auth.cookie;
  if (auth && 'key' in auth) h.authorization = `Bearer ${auth.key}`;
  if (body !== undefined) {
    h['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await handle(new Request(`${ORIGIN}${path}`, init));
  const text = await response.text();
  // biome-ignore lint/suspicious/noExplicitAny: response bodies are checked field by field
  const json: any = text ? JSON.parse(text) : null;
  return { status: response.status, headers: response.headers, body: json };
}

const session = (): Auth => ({ cookie });
const key = (name: keyof typeof keys): Auth => ({ key: keys[name] });

function expectProblem(result: Awaited<ReturnType<typeof call>>, status: number, code: string): void {
  expect(result.status, JSON.stringify(result.body)).toBe(status);
  expect(result.body).toMatchObject({ status, code, type: 'about:blank' });
  expect(result.body.title).toEqual(expect.any(String));
  expect(result.body.requestId).toBe(result.headers.get('x-request-id'));
}

beforeAll(async () => {
  database = await createTestDatabase({ prefix: 'pm_web_api' });
  database.pool.on('error', () => {});
  const auth = createAuth({ db: database.db, secret: SECRET, baseUrl: ORIGIN });
  core = { db: database.db, auth, publicUrl: ORIGIN };
  handle = createApiFetchHandler(core);

  const seeded = await seedDevData(core);
  keys.agent = seeded.agentKey;
  keys.admin = seeded.adminKey;

  const signIn = await auth.api.signInEmail({
    body: { email: seeded.admin.email, password: seeded.admin.password as string },
    returnHeaders: true,
  });
  cookie = signIn.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

  admin = {
    userId: seeded.admin.id,
    kind: 'person',
    workspaceId: seeded.workspaceId,
    role: 'owner',
    onBehalfOfId: null,
  };
  const projects = await listProjects(core, admin);
  const pay = projects.items.find((p) => p.key === 'PAY');
  if (!pay) throw new Error('PAY not seeded');
  keys.adminRead = (
    await createApiKey(core, admin, { name: 'read only', scope: { projects: 'all', access: 'read' } })
  ).key;
  keys.agentPayOnly = (
    await createApiKey(core, admin, {
      name: 'PAY only',
      ownerId: seeded.agent.id,
      scope: { projects: [pay.id], access: 'write' },
    })
  ).key;
  const revoked = await createApiKey(core, admin, {
    name: 'revoked',
    scope: { projects: 'all', access: 'write' },
  });
  await revokeApiKey(core, admin, { id: revoked.id });
  keys.revoked = revoked.key;

  // A second workspace on the same instance; its tasks must look like they do not exist.
  const world = await createWorld(database.db, 'Elsewhere');
  await createProject(core, world.ownerActor, { key: 'ELSE', name: 'Their project' });
  otherWorkspaceTask = (await createTask(core, world.ownerActor, { project: 'ELSE', title: 'Theirs' })).key;
}, 60_000);

afterAll(async () => {
  await database?.drop();
});

describe('OpenAPI document', () => {
  it('is served without auth and lists every contract path', async () => {
    const result = await call('GET', '/api/v1/openapi.json');
    expect(result.status).toBe(200);
    expect(result.body.openapi).toMatch(/^3\.1/);
    expect(Object.keys(result.body.paths).sort()).toEqual([
      '/api/v1/me',
      '/api/v1/members',
      '/api/v1/projects',
      '/api/v1/projects/{project}',
      '/api/v1/tasks',
      '/api/v1/tasks/{key}',
      '/api/v1/tasks/{key}/activity',
    ]);
    expect(result.body.components.securitySchemes.apiKey).toMatchObject({ type: 'http', scheme: 'bearer' });
    // Error responses use the Problem body.
    const getTask = result.body.paths['/api/v1/tasks/{key}'].get;
    const notFound = JSON.stringify(getTask.responses['404']);
    expect(notFound).toContain('requestId');
    expect(notFound).toContain('issues');
  });
});

describe('authentication', () => {
  it('returns 401 without credentials', async () => {
    const result = await call('GET', '/api/v1/projects');
    expectProblem(result, 401, 'UNAUTHORIZED');
    expect(result.headers.get('www-authenticate')).toMatch(/^Bearer/);
  });

  it('returns 401 before validating input', async () => {
    expectProblem(await call('POST', '/api/v1/tasks', { body: {} }), 401, 'UNAUTHORIZED');
  });

  it('returns 401 for unknown and revoked keys', async () => {
    expectProblem(await call('GET', '/api/v1/me', { auth: { key: 'pm_live_nope' } }), 401, 'UNAUTHORIZED');
    expectProblem(await call('GET', '/api/v1/me', { auth: key('revoked') }), 401, 'UNAUTHORIZED');
  });

  it('echoes a caller request id', async () => {
    const result = await call('GET', '/api/v1/me', { headers: { 'x-request-id': 'trace-123' } });
    expect(result.headers.get('x-request-id')).toBe('trace-123');
    expect(result.body.requestId).toBe('trace-123');
  });

  it('returns a Problem for unknown routes', async () => {
    expectProblem(await call('GET', '/api/v1/nope', { auth: session() }), 404, 'NOT_FOUND');
  });

  it('refuses cross-site cookie writes but allows same-origin ones', async () => {
    const body = { project: 'PAY', title: 'From another site' };
    expectProblem(
      await call('POST', '/api/v1/tasks', {
        auth: session(),
        body,
        headers: { origin: 'https://evil.example' },
      }),
      403,
      'FORBIDDEN',
    );
    const same = await call('POST', '/api/v1/tasks', {
      auth: session(),
      body: { project: 'PAY', title: 'From the app' },
      headers: { origin: ORIGIN },
    });
    expect(same.status).toBe(201);
    // API keys carry no ambient credentials, so Origin does not matter.
    const withKey = await call('POST', '/api/v1/tasks', {
      auth: key('agent'),
      body: { project: 'PAY', title: 'From a script' },
      headers: { origin: 'https://evil.example' },
    });
    expect(withKey.status).toBe(201);
  });
});

describe('with a session', () => {
  it('GET /me', async () => {
    const result = await call('GET', '/api/v1/me', { auth: session() });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      user: { name: 'Ana Ruiz', kind: 'person' },
      workspace: { name: 'Reddevs' },
      role: 'owner',
      auth: { method: 'session', scope: null },
    });
  });

  it('GET /projects', async () => {
    const result = await call('GET', '/api/v1/projects', { auth: session() });
    expect(result.status).toBe(200);
    const keysOf = result.body.items.map((p: { key: string }) => p.key);
    expect(keysOf).toEqual(expect.arrayContaining(['PAY', 'WEB']));
    const pay = result.body.items.find((p: { key: string }) => p.key === 'PAY');
    expect(pay.openCounts).toMatchObject({ in_progress: expect.any(Number), todo: expect.any(Number) });
  });

  it('POST /projects, then 409 for a duplicate key and 400 for a bad one', async () => {
    const created = await call('POST', '/api/v1/projects', {
      auth: session(),
      body: { name: 'Docs', key: 'docs', description: 'Guides' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ key: 'DOCS', name: 'Docs' });
    expectProblem(
      await call('POST', '/api/v1/projects', { auth: session(), body: { name: 'Again', key: 'DOCS' } }),
      409,
      'CONFLICT',
    );
    const bad = await call('POST', '/api/v1/projects', { auth: session(), body: { name: '', key: '1' } });
    expectProblem(bad, 400, 'BAD_REQUEST');
    expect(bad.body.issues.map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining(['name', 'key']),
    );
  });

  it('PATCH /projects/{project}: renames, changes an empty key, refuses a key change with tasks', async () => {
    await call('POST', '/api/v1/projects', { auth: session(), body: { name: 'Tmp', key: 'TMP' } });
    const renamed = await call('PATCH', '/api/v1/projects/tmp', {
      auth: session(),
      body: { key: 'TMQ', name: 'Temporary' },
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ key: 'TMQ', name: 'Temporary' });
    expectProblem(
      await call('PATCH', '/api/v1/projects/PAY', { auth: session(), body: { key: 'PAYS' } }),
      409,
      'CONFLICT',
    );
    expectProblem(
      await call('PATCH', '/api/v1/projects/NOPE', { auth: session(), body: { name: 'x' } }),
      404,
      'NOT_FOUND',
    );
    expectProblem(
      await call('PATCH', '/api/v1/projects/PAY', { auth: session(), body: {} }),
      400,
      'BAD_REQUEST',
    );
  });

  it('GET /tasks with filters and pagination', async () => {
    const all = await call('GET', '/api/v1/tasks?project=pay', { auth: session() });
    expect(all.status).toBe(200);
    expect(all.body.items.length).toBeGreaterThanOrEqual(11);
    expect(all.body.counts).toMatchObject({ backlog: 1, done: 1 });

    const one = await call('GET', '/api/v1/tasks?project=PAY&status=in_review', { auth: session() });
    expect(one.status).toBe(200);
    expect(one.body.items.length).toBeGreaterThan(0);
    expect(one.body.items.every((t: { status: string }) => t.status === 'in_review')).toBe(true);

    const many = await call('GET', '/api/v1/tasks?project=PAY&status[]=in_review&status[]=backlog', {
      auth: session(),
    });
    expect(many.status, JSON.stringify(many.body)).toBe(200);
    expect(new Set(many.body.items.map((t: { status: string }) => t.status))).toEqual(
      new Set(['in_review', 'backlog']),
    );
    // A repeated plain key also arrives as a list.
    const repeated = await call('GET', '/api/v1/tasks?project=PAY&status=in_review&status=backlog', {
      auth: session(),
    });
    expect(repeated.status, JSON.stringify(repeated.body)).toBe(200);
    expect(repeated.body.items).toHaveLength(many.body.items.length);

    const agents = await call('GET', '/api/v1/tasks?project=PAY&assignee=agents', { auth: session() });
    expect(agents.body.items.every((t: { assignee: { kind: string } }) => t.assignee.kind === 'agent')).toBe(
      true,
    );

    const page1 = await call('GET', '/api/v1/tasks?project=PAY&limit=4', { auth: session() });
    expect(page1.body.items).toHaveLength(4);
    expect(page1.body.nextCursor).toEqual(expect.any(String));
    const page2 = await call(
      'GET',
      `/api/v1/tasks?project=PAY&limit=4&cursor=${encodeURIComponent(page1.body.nextCursor)}`,
      { auth: session() },
    );
    expect(page2.status).toBe(200);
    const seen = new Set(page1.body.items.map((t: { key: string }) => t.key));
    expect(page2.body.items.some((t: { key: string }) => seen.has(t.key))).toBe(false);

    expectProblem(
      await call('GET', '/api/v1/tasks?project=PAY&limit=500', { auth: session() }),
      400,
      'BAD_REQUEST',
    );
    expectProblem(await call('GET', '/api/v1/tasks?project=NOPE', { auth: session() }), 404, 'NOT_FOUND');
  });

  it('POST, GET and PATCH /tasks, and the activity', async () => {
    const created = await call('POST', '/api/v1/tasks', {
      auth: session(),
      body: { project: 'WEB', title: 'Fix the footer', priority: 'high', assignee: 'me' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      key: expect.stringMatching(/^WEB-\d+$/),
      status: 'todo',
      priority: 'high',
      assignee: { name: 'Ana Ruiz', kind: 'person' },
    });
    const taskKey: string = created.body.key;

    const fetched = await call('GET', `/api/v1/tasks/${taskKey.toLowerCase()}`, { auth: session() });
    expect(fetched.status).toBe(200);
    expect(fetched.body.key).toBe(taskKey);

    const updated = await call('PATCH', `/api/v1/tasks/${taskKey}`, {
      auth: session(),
      body: { status: 'in_progress', assignee: null, description: '**bold**' },
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ status: 'in_progress', assignee: null, description: '**bold**' });

    const activity = await call('GET', `/api/v1/tasks/${taskKey}/activity`, { auth: session() });
    expect(activity.status).toBe(200);
    expect(activity.body.items.map((a: { type: string }) => a.type)).toEqual([
      'task.created',
      'task.updated',
    ]);

    expectProblem(
      await call('PATCH', `/api/v1/tasks/${taskKey}`, { auth: session(), body: {} }),
      400,
      'BAD_REQUEST',
    );
    expectProblem(
      await call('POST', '/api/v1/tasks', {
        auth: session(),
        body: { project: 'WEB', title: 'x', assignee: crypto.randomUUID() },
      }),
      422,
      'UNPROCESSABLE_CONTENT',
    );
    expectProblem(await call('GET', '/api/v1/tasks/WEB-9999', { auth: session() }), 404, 'NOT_FOUND');
    expectProblem(await call('GET', '/api/v1/tasks/not-a-key', { auth: session() }), 400, 'BAD_REQUEST');
  });

  it('hides other workspaces', async () => {
    expectProblem(
      await call('GET', `/api/v1/tasks/${otherWorkspaceTask}`, { auth: session() }),
      404,
      'NOT_FOUND',
    );
    expectProblem(await call('GET', '/api/v1/tasks?project=ELSE', { auth: session() }), 404, 'NOT_FOUND');
  });

  it('GET /members lists people and agents with their responsible human', async () => {
    const result = await call('GET', '/api/v1/members', { auth: session() });
    expect(result.status).toBe(200);
    const agent = result.body.items.find((m: { name: string }) => m.name === 'claude-dev');
    expect(agent).toMatchObject({ kind: 'agent', email: null, responsible: { name: 'Ana Ruiz' } });
  });
});

describe('with API keys', () => {
  it('an agent key with all projects can read and write', async () => {
    const me = await call('GET', '/api/v1/me', { auth: key('agent') });
    expect(me.body).toMatchObject({
      user: { name: 'claude-dev', kind: 'agent', responsible: { name: 'Ana Ruiz' } },
      auth: { method: 'api_key', scope: { projects: 'all', access: 'write' } },
    });
    const created = await call('POST', '/api/v1/tasks', {
      auth: key('agent'),
      body: { project: 'WEB', title: 'Agent work', assignee: 'me' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      createdBy: { name: 'claude-dev', kind: 'agent' },
      createdOnBehalfOf: { name: 'Ana Ruiz' },
    });
  });

  it('a project-scoped key works inside its scope and gets 403 outside it', async () => {
    const projects = await call('GET', '/api/v1/projects', { auth: key('agentPayOnly') });
    expect(projects.body.items.map((p: { key: string }) => p.key)).toEqual(['PAY']);

    expect((await call('GET', '/api/v1/tasks?project=PAY', { auth: key('agentPayOnly') })).status).toBe(200);
    expect(
      (
        await call('POST', '/api/v1/tasks', {
          auth: key('agentPayOnly'),
          body: { project: 'PAY', title: 'In scope' },
        })
      ).status,
    ).toBe(201);

    expectProblem(
      await call('GET', '/api/v1/tasks?project=WEB', { auth: key('agentPayOnly') }),
      403,
      'FORBIDDEN',
    );
    expectProblem(await call('GET', '/api/v1/tasks/WEB-1', { auth: key('agentPayOnly') }), 403, 'FORBIDDEN');
    expectProblem(
      await call('GET', '/api/v1/tasks/WEB-1/activity', { auth: key('agentPayOnly') }),
      403,
      'FORBIDDEN',
    );
    expectProblem(
      await call('POST', '/api/v1/tasks', {
        auth: key('agentPayOnly'),
        body: { project: 'WEB', title: 'Out' },
      }),
      403,
      'FORBIDDEN',
    );
    expectProblem(
      await call('PATCH', '/api/v1/tasks/WEB-1', { auth: key('agentPayOnly'), body: { status: 'done' } }),
      403,
      'FORBIDDEN',
    );
    // Creating projects needs a key over all projects.
    expectProblem(
      await call('POST', '/api/v1/projects', {
        auth: key('agentPayOnly'),
        body: { name: 'New', key: 'NEW' },
      }),
      403,
      'FORBIDDEN',
    );
  });

  it('a read-only key can read but gets 403 on every write route', async () => {
    for (const path of [
      '/api/v1/me',
      '/api/v1/projects',
      '/api/v1/members',
      '/api/v1/tasks?project=PAY',
      '/api/v1/tasks/PAY-1',
      '/api/v1/tasks/PAY-1/activity',
    ]) {
      expect((await call('GET', path, { auth: key('adminRead') })).status, path).toBe(200);
    }
    expectProblem(
      await call('POST', '/api/v1/tasks', { auth: key('adminRead'), body: { project: 'PAY', title: 'No' } }),
      403,
      'FORBIDDEN',
    );
    expectProblem(
      await call('PATCH', '/api/v1/tasks/PAY-1', { auth: key('adminRead'), body: { title: 'No' } }),
      403,
      'FORBIDDEN',
    );
    expectProblem(
      await call('POST', '/api/v1/projects', { auth: key('adminRead'), body: { name: 'No', key: 'NOPE' } }),
      403,
      'FORBIDDEN',
    );
    expectProblem(
      await call('PATCH', '/api/v1/projects/PAY', { auth: key('adminRead'), body: { name: 'No' } }),
      403,
      'FORBIDDEN',
    );
  });

  it("a person's key acts with that person's role", async () => {
    const me = await call('GET', '/api/v1/me', { auth: key('admin') });
    expect(me.body).toMatchObject({ user: { kind: 'person' }, role: 'owner', auth: { method: 'api_key' } });
  });
});

describe('clients', () => {
  it('the RPC endpoint serves the browser client with the session cookie', async () => {
    const browser: ApiClient = createORPCClient(
      new RPCLink({
        url: `${ORIGIN}${RPC_PREFIX}`,
        headers: { cookie },
        fetch: (request) => handle(request),
      }),
    );
    const projects = await browser.projects.list();
    expect(projects.items.map((p) => p.key)).toEqual(expect.arrayContaining(['PAY', 'WEB']));
    await expect(browser.tasks.get({ key: 'PAY-9999' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      data: { requestId: expect.any(String) },
    });
  });

  it('the server-side client calls the router in-process with the request headers', async () => {
    const server = createApiClient(
      () => new Headers({ cookie }),
      () => core,
    );
    const me = await server.me.get();
    expect(me.user.name).toBe('Ana Ruiz');
    const anonymous = createApiClient(
      () => new Headers(),
      () => core,
    );
    await expect(anonymous.projects.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });
});
