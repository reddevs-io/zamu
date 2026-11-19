// Setup: detection order and output, preview, start, and New project from Backlog.md.
import { schema } from '@zamu/db';
import { GitRateLimited, GitUnauthorized } from '@zamu/git-providers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Conflict, Forbidden, Invalid, ProjectNotEmpty } from '../errors';
import { BACKLOG_REFRESH } from '../jobs';
import { decryptSecret, EncryptionKeyMissing } from '../secrets';
import {
  createWorld,
  randomProjectKey,
  type TestContext,
  testContext,
  type World,
} from '../testing/fixtures';
import { loadSource } from './refresh';
import {
  createProjectFromBacklog,
  detectBacklog,
  detectBacklogRepository,
  previewBacklog,
  startBacklog,
} from './setup';
import {
  configFile,
  createLinkedProject,
  FakeProvider,
  FakeRepository,
  mirrorContext,
  NO_MAPPINGS,
  taskFile,
  taskPath,
} from './testing';

const unique = () => crypto.randomUUID().slice(0, 8);

describe('Backlog.md setup', () => {
  let base: TestContext;
  let world: World;
  let provider: FakeProvider;
  let ctx: ReturnType<typeof mirrorContext>;

  beforeAll(async () => {
    base = testContext();
    world = await createWorld(base.db);
    provider = new FakeProvider([]);
    ctx = mirrorContext(base, provider);
  });
  afterAll(async () => {
    await base?.close();
  });

  async function linked(files: Record<string, string>) {
    const repo = provider.add(new FakeRepository(`reddevs/setup-${unique()}`, files));
    return { repo, ...(await createLinkedProject(ctx, world, repo)) };
  }

  const backlogFiles = (folder: string) => ({
    [`${folder}/config.yml`]: configFile({ statuses: ['To Do', 'In Progress', 'Done', 'Blocked'] }),
    [taskPath(folder, 'back-1', 'One')]: taskFile({ id: 'BACK-1', title: 'One', assignee: ['@claude'] }),
    [taskPath(folder, 'back-2', 'Two')]: taskFile({
      id: 'BACK-2',
      title: 'Two',
      status: 'Blocked',
      priority: 'high',
    }),
    [`${folder}/docs/doc-1 - Guide.md`]: '---\nid: doc-1\ntitle: Guide\n---\n',
  });

  describe('detectBacklog', () => {
    it('finds backlog/ first and reports config, counts and prefilled mappings', async () => {
      const { key, connection, repo } = await linked({
        ...backlogFiles('backlog'),
        ...backlogFiles('.backlog'),
      });
      const agent = await base.db.select().from(schema.user).where(eq(schema.user.id, world.agent.id));
      const agentName = agent[0]?.name as string;
      repo.set(
        taskPath('backlog', 'back-3', 'Three'),
        taskFile({ id: 'BACK-3', title: 'Three', assignee: [`@${agentName}`] }),
      );
      repo.commit();
      const detection = await detectBacklog(ctx, world.ownerActor, {
        projectKey: key,
        connectionId: connection.id,
      });
      expect(detection).toMatchObject({
        repository: `gitlab.com/${repo.path}`,
        access: 'ok',
        defaultBranch: 'main',
        headCommit: repo.head,
        folder: 'backlog',
        folderSource: 'default',
        configError: null,
        keyMatchesPrefix: false,
      });
      expect(detection.config).toMatchObject({
        taskPrefix: 'BACK',
        statuses: ['To Do', 'In Progress', 'Done', 'Blocked'],
      });
      expect(detection.folders).toEqual([
        { path: 'docs/', count: 1, ignored: true },
        { path: 'tasks/', count: 3, ignored: false },
      ]);
      expect(detection.mappings.status).toEqual([
        { from: 'To Do', to: 'todo', how: 'name', count: 2 },
        { from: 'In Progress', to: 'in_progress', how: 'name', count: 0 },
        { from: 'Done', to: 'done', how: 'name', count: 0 },
        { from: 'Blocked', to: 'todo', how: 'fallback', count: 1 },
      ]);
      expect(detection.mappings.priority.find((row) => row.from === 'high')).toMatchObject({
        to: 'high',
        count: 1,
      });
      expect(detection.mappings.assignee).toEqual([
        { from: '@claude', userId: null, how: 'fallback', count: 1, user: null },
        expect.objectContaining({ from: `@${agentName}`, userId: world.agent.id, how: 'name', count: 1 }),
      ]);
    });

    it('uses .backlog/ when there is no backlog/, the root config, then the override', async () => {
      const dot = await linked(backlogFiles('.backlog'));
      expect(
        await detectBacklog(ctx, world.ownerActor, { projectKey: dot.key, connectionId: dot.connection.id }),
      ).toMatchObject({ folder: '.backlog', folderSource: 'default' });

      const configured = await linked({
        ...backlogFiles('planning'),
        ...backlogFiles('backlog'),
        'backlog.config.yml': 'backlog_directory: "planning"\n',
      });
      expect(
        await detectBacklog(ctx, world.ownerActor, {
          projectKey: configured.key,
          connectionId: configured.connection.id,
        }),
      ).toMatchObject({ folder: 'planning', folderSource: 'config' });

      expect(
        await detectBacklog(ctx, world.ownerActor, {
          projectKey: configured.key,
          connectionId: configured.connection.id,
          folderOverride: './backlog/',
        }),
      ).toMatchObject({ folder: 'backlog', folderSource: 'override' });

      const none = await linked({ 'README.md': '# nothing' });
      expect(
        await detectBacklog(ctx, world.ownerActor, {
          projectKey: none.key,
          connectionId: none.connection.id,
        }),
      ).toMatchObject({ access: 'ok', folder: null, folderSource: null, folders: [], config: null });
    });

    it('reports a token without access and a config that does not parse', async () => {
      const { key, connection } = await linked(backlogFiles('backlog'));
      provider.failWith = new GitUnauthorized('no', { status: 401 });
      expect(
        await detectBacklog(ctx, world.ownerActor, { projectKey: key, connectionId: connection.id }),
      ).toMatchObject({
        access: 'no_access',
        folder: null,
        defaultBranch: null,
      });
      const broken = await linked({
        ...backlogFiles('backlog'),
        'backlog/config.yml': 'statuses: [unclosed\n',
      });
      const detection = await detectBacklog(ctx, world.ownerActor, {
        projectKey: broken.key,
        connectionId: broken.connection.id,
      });
      expect(detection.configError).toContain('config.yml');
      expect(detection.config).toBeNull();
    });

    it('says when the provider asks to slow down instead of failing with a server error', async () => {
      const { key, connection } = await linked(backlogFiles('backlog'));
      provider.failWith = new GitRateLimited('slow down', 25, { status: 429 });
      const attempt = detectBacklog(ctx, world.ownerActor, { projectKey: key, connectionId: connection.id });
      await expect(attempt).rejects.toBeInstanceOf(Conflict);
      await expect(attempt).rejects.toThrow('gitlab.com asked to slow down. Try again in 25 seconds.');
    });

    it('is for admins, on empty projects with a repository on the connection host', async () => {
      const { key, connection, project } = await linked(backlogFiles('backlog'));
      await expect(
        detectBacklog(ctx, world.memberActor, { projectKey: key, connectionId: connection.id }),
      ).rejects.toBeInstanceOf(Forbidden);
      const other = await createLinkedProject(ctx, world, new FakeRepository(`x/y-${unique()}`), {
        host: 'github.com',
      });
      await expect(
        detectBacklog(ctx, world.ownerActor, { projectKey: key, connectionId: other.connection.id }),
      ).rejects.toBeInstanceOf(Invalid);
      await base.db
        .insert(schema.task)
        .values({ projectId: project.id, number: 1, title: 'Native', createdById: world.owner.id });
      await expect(
        detectBacklog(ctx, world.ownerActor, { projectKey: key, connectionId: connection.id }),
      ).rejects.toBeInstanceOf(ProjectNotEmpty);
    });
  });

  describe('previewBacklog', () => {
    it('plans without writing anything', async () => {
      const { key, connection, project } = await linked(backlogFiles('backlog'));
      const preview = await previewBacklog(ctx, world.ownerActor, {
        projectKey: key,
        connectionId: connection.id,
        mappings: { status: [{ from: 'To Do', to: 'todo', how: 'name' }], priority: [], assignee: [] },
      });
      expect(preview.counts).toMatchObject({ tasks: 2, open: 2, drafts: 0 });
      expect(preview.sample.map((row) => row.key)).toEqual([`${key}-1`, `${key}-2`]);
      expect(preview.fallbacks.map((problem) => (problem as { field: string }).field).sort()).toEqual([
        'assignee',
        'priority',
        'status',
      ]);
      const tasks = await base.db.select().from(schema.task).where(eq(schema.task.projectId, project.id));
      expect(tasks).toEqual([]);
      const sources = await base.db
        .select()
        .from(schema.backlogSource)
        .where(eq(schema.backlogSource.projectId, project.id));
      expect(sources).toEqual([]);
    });
  });

  describe('startBacklog', () => {
    it('creates the source, turns milestones on and enqueues the first refresh', async () => {
      const { key, connection, project } = await linked(backlogFiles('backlog'));
      ctx.jobs.clear();
      const status = await startBacklog(ctx, world.ownerActor, {
        projectKey: key,
        connectionId: connection.id,
        mode: 'mirror',
        mappings: {
          status: [],
          priority: [],
          assignee: [{ from: '@claude', userId: world.agent.id, how: 'manual' }],
        },
      });
      expect(status).toMatchObject({ mode: 'mirror', state: 'setup', lastRead: null });
      expect(ctx.jobs.sent).toEqual([
        {
          name: BACKLOG_REFRESH,
          data: { sourceId: status.id, trigger: 'setup' },
          options: { singletonKey: status.id },
        },
      ]);
      const source = await loadSource(base.db, status.id);
      expect(source?.webhookId).toMatch(/^[A-Za-z0-9_-]{24}$/);
      expect(decryptSecret(ctx, source?.webhookSecretCiphertext as string)).toHaveLength(43);
      const [row] = await base.db.select().from(schema.project).where(eq(schema.project.id, project.id));
      expect(row?.usesMilestones).toBe(true);
      await expect(
        startBacklog(ctx, world.ownerActor, {
          projectKey: key,
          connectionId: connection.id,
          mode: 'mirror',
          mappings: NO_MAPPINGS,
        }),
      ).rejects.toThrow('already has a Backlog.md source');
    });

    it('refuses assignees outside the workspace and needs the encryption key', async () => {
      const { key, connection } = await linked(backlogFiles('backlog'));
      const stranger = await base.db
        .insert(schema.user)
        .values({ name: 'Stranger', email: `${unique()}@example.com` })
        .returning();
      await expect(
        startBacklog(ctx, world.ownerActor, {
          projectKey: key,
          connectionId: connection.id,
          mode: 'mirror',
          mappings: {
            status: [],
            priority: [],
            assignee: [{ from: '@x', userId: stranger[0]?.id as string, how: 'manual' }],
          },
        }),
      ).rejects.toBeInstanceOf(Invalid);
      await expect(
        startBacklog({ ...ctx, encryptionKey: undefined }, world.ownerActor, {
          projectKey: key,
          connectionId: connection.id,
          mode: 'mirror',
          mappings: NO_MAPPINGS,
        }),
      ).rejects.toBeInstanceOf(EncryptionKeyMissing);
    });
  });

  describe('detectBacklogRepository', () => {
    async function connectionOnly() {
      return (await createLinkedProject(ctx, world, new FakeRepository(`reddevs/conn-${unique()}`)))
        .connection;
    }

    it('reads a repository before the project exists, with config name, prefix and mappings', async () => {
      const agent = await base.db.select().from(schema.user).where(eq(schema.user.id, world.agent.id));
      const agentName = agent[0]?.name as string;
      const repo = provider.add(
        new FakeRepository(`reddevs/notes-${unique()}`, {
          ...backlogFiles('backlog'),
          'backlog/config.yml': configFile({ name: 'Notes sync', prefix: 'notes' }),
          [taskPath('backlog', 'notes-3', 'Three')]: taskFile({
            id: 'NOTES-3',
            title: 'Three',
            assignee: [`@${agentName}`],
          }),
        }),
      );
      const connection = await connectionOnly();
      const detection = await detectBacklogRepository(ctx, world.ownerActor, {
        repository: `git@gitlab.com:${repo.path}.git`,
        connectionId: connection.id,
      });
      expect(detection).toMatchObject({
        repository: `gitlab.com/${repo.path}`,
        access: 'ok',
        defaultBranch: 'main',
        headCommit: repo.head,
        folder: 'backlog',
        folderSource: 'default',
        configError: null,
        keyMatchesPrefix: false,
      });
      expect(detection.config).toMatchObject({ projectName: 'Notes sync', taskPrefix: 'NOTES' });
      expect(detection.folders).toContainEqual({ path: 'tasks/', count: 3, ignored: false });
      expect(detection.mappings.status.find((row) => row.from === 'To Do')).toMatchObject({
        to: 'todo',
        how: 'name',
      });
      expect(detection.mappings.assignee).toContainEqual(
        expect.objectContaining({ from: `@${agentName}`, userId: world.agent.id, how: 'name' }),
      );
      // Nothing is written: no project links the repository.
      const linkedRows = await base.db
        .select({ id: schema.project.id })
        .from(schema.project)
        .where(eq(schema.project.repository, `git@gitlab.com:${repo.path}.git`));
      expect(linkedRows).toEqual([]);
    });

    it('reports access, a missing folder and the override like setup step 2', async () => {
      const connection = await connectionOnly();
      const missing = await detectBacklogRepository(ctx, world.ownerActor, {
        repository: `https://gitlab.com/reddevs/missing-${unique()}`,
        connectionId: connection.id,
      });
      expect(missing).toMatchObject({ access: 'not_found', folder: null, defaultBranch: null, config: null });

      const plain = provider.add(new FakeRepository(`reddevs/plain-${unique()}`, { 'README.md': '# x' }));
      expect(
        await detectBacklogRepository(ctx, world.ownerActor, {
          repository: `https://gitlab.com/${plain.path}`,
          connectionId: connection.id,
        }),
      ).toMatchObject({ access: 'ok', folder: null, folders: [], config: null });

      const docs = provider.add(new FakeRepository(`reddevs/docs-${unique()}`, backlogFiles('docs/backlog')));
      expect(
        await detectBacklogRepository(ctx, world.ownerActor, {
          repository: `https://gitlab.com/${docs.path}`,
          connectionId: connection.id,
          folderOverride: 'docs/backlog',
        }),
      ).toMatchObject({ folder: 'docs/backlog', folderSource: 'override' });
    });

    it('is for admins, with a connection on the repository host', async () => {
      const repo = provider.add(new FakeRepository(`reddevs/auth-${unique()}`, backlogFiles('backlog')));
      const connection = await connectionOnly();
      await expect(
        detectBacklogRepository(ctx, world.memberActor, {
          repository: `https://gitlab.com/${repo.path}`,
          connectionId: connection.id,
        }),
      ).rejects.toBeInstanceOf(Forbidden);
      await expect(
        detectBacklogRepository(ctx, world.ownerActor, {
          repository: `https://github.com/${repo.path}`,
          connectionId: connection.id,
        }),
      ).rejects.toBeInstanceOf(Invalid);
      await expect(
        detectBacklogRepository(ctx, world.ownerActor, {
          repository: 'payments',
          connectionId: connection.id,
        }),
      ).rejects.toBeInstanceOf(Invalid);
    });
  });

  describe('createProjectFromBacklog', () => {
    it('creates the project after checking the connection host', async () => {
      const repo = provider.add(new FakeRepository(`reddevs/new-${unique()}`, backlogFiles('backlog')));
      const { connection } = await createLinkedProject(
        ctx,
        world,
        new FakeRepository(`reddevs/other-${unique()}`),
      );
      const key = randomProjectKey();
      const project = await createProjectFromBacklog(ctx, world.ownerActor, {
        repository: `https://gitlab.com/${repo.path}`,
        connectionId: connection.id,
        name: 'From Backlog',
        key,
        mode: 'mirror',
      });
      expect(project).toMatchObject({
        key,
        name: 'From Backlog',
        repository: `https://gitlab.com/${repo.path}`,
      });
      await expect(
        createProjectFromBacklog(ctx, world.ownerActor, {
          repository: `https://github.com/${repo.path}-x`,
          connectionId: connection.id,
          name: 'Wrong host',
          key: randomProjectKey(),
          mode: 'import',
        }),
      ).rejects.toBeInstanceOf(Invalid);
      await expect(
        createProjectFromBacklog(ctx, world.memberActor, {
          repository: `https://gitlab.com/${repo.path}-y`,
          connectionId: connection.id,
          name: 'Member',
          key: randomProjectKey(),
          mode: 'mirror',
        }),
      ).rejects.toBeInstanceOf(Forbidden);
    });
  });
});
