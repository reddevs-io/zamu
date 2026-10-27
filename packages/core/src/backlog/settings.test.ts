// Settings (refresh requests, webhook info, detach, folder, connection) and the status shape.
import { schema } from '@pm/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BacklogDetached, BacklogPaused, Conflict, Forbidden, Invalid } from '../errors';
import { isMirrored } from '../projects';
import { decryptSecret, EncryptionKeyMissing, encryptSecret } from '../secrets';
import { createGitConnectionRow } from '../testing/backlog';
import {
  createWorld,
  keyActor,
  TEST_PUBLIC_URL,
  type TestContext,
  testContext,
  type World,
} from '../testing/fixtures';
import { loadSource, refreshBacklogSource } from './refresh';
import {
  detachBacklog,
  getBacklogWebhookInfo,
  refreshBacklogNow,
  reissueBacklogWebhookSecret,
  requestBacklogRefresh,
  setBacklogConnection,
  setBacklogFolder,
} from './settings';
import { getBacklogStatus } from './status';
import {
  configFile,
  createMirror,
  FakeProvider,
  FakeRepository,
  mirrorContext,
  projectActivity,
  TEST_TOKEN,
  taskFile,
  taskPath,
} from './testing';

const unique = () => crypto.randomUUID().slice(0, 8);

function repoWithProblems(): FakeRepository {
  const files: Record<string, string> = {
    'backlog/config.yml': configFile(),
    'backlog/tasks/back-99 - Broken.md': '---\nid: BACK-99\ndependencies:\n  - id: BACK-1\n---\n',
    'backlog/drafts/draft-1 - Idea.md': taskFile({ id: 'DRAFT-1', title: 'Idea' }),
    [taskPath('backlog', 'back-5', 'Archived')]: taskFile({
      id: 'BACK-5',
      title: 'Archived',
      status: 'Done',
    }),
  };
  for (let n = 1; n <= 3; n++) {
    files[taskPath('backlog', `back-${n}`, `Task ${n}`)] = taskFile({
      id: `BACK-${n}`,
      title: `Task ${n}`,
      status: n === 3 ? 'Blocked' : 'To Do',
      assignee: [`@nobody-${n}`],
    });
  }
  files[taskPath('backlog', 'back-1.1', 'Sub')] = taskFile({
    id: 'BACK-1.1',
    title: 'Sub',
    parent: 'BACK-1',
  });
  const repo = new FakeRepository(`reddevs/settings-${unique()}`, files);
  repo.rename(taskPath('backlog', 'back-5', 'Archived'), 'backlog/archive/tasks/back-5 - Archived.md');
  repo.commit();
  return repo;
}

describe('Backlog.md settings and status', () => {
  let base: TestContext;
  let world: World;
  let provider: FakeProvider;
  let ctx: ReturnType<typeof mirrorContext> & { publicUrl: string };

  beforeAll(async () => {
    base = testContext();
    world = await createWorld(base.db);
    provider = new FakeProvider([]);
    ctx = { ...mirrorContext(base, provider), publicUrl: TEST_PUBLIC_URL };
  });
  afterAll(async () => {
    await base?.close();
  });

  async function mirror(options: Parameters<typeof createMirror>[3] = {}) {
    const repo = provider.add(repoWithProblems());
    return { repo, ...(await createMirror(ctx, world, repo, options)) };
  }

  it('returns the status with counts, paged problems, mappings and history', async () => {
    const { key, sourceId, repo } = await mirror({
      mappings: { status: [{ from: 'To Do', to: 'todo', how: 'name' }], priority: [], assignee: [] },
    });
    const status = await getBacklogStatus(ctx, world.memberActor, { project: key, problemsLimit: 2 });
    expect(status).toMatchObject({
      id: sourceId,
      mode: 'mirror',
      state: 'warnings',
      folder: 'backlog',
      prefix: 'BACK',
      defaultBranch: 'main',
      lastRead: {
        commit: repo.head,
        trigger: 'setup',
        commitUrl: `https://gitlab.com/${repo.path}/-/commit/${repo.head}`,
      },
      counts: { tasks: 4, open: 4, drafts: 1, archived: 1, subtasks: 1, milestones: 0, hidden: 0 },
      connection: { provider: 'gitlab', host: 'gitlab.com', status: 'working' },
    });
    expect(status.nextPollAt).not.toBeNull();
    expect(status.problems.items).toHaveLength(2);
    expect(status.problems.items[0]).toMatchObject({
      kind: 'file',
      skipped: true,
      path: 'backlog/tasks/back-99 - Broken.md',
    });
    expect(status.problems.counts).toEqual({ files: 1, values: 5 });
    expect(status.problems.nextCursor).not.toBeNull();
    const next = await getBacklogStatus(ctx, world.memberActor, {
      project: key,
      problemsLimit: 10,
      problemsCursor: status.problems.nextCursor as string,
    });
    expect(next.problems.items).toHaveLength(4);
    expect(next.problems.nextCursor).toBeNull();
    expect(status.mappings.status).toEqual(
      expect.arrayContaining([
        { from: 'To Do', to: 'todo', how: 'name', count: 3 },
        { from: 'Blocked', to: 'todo', how: 'fallback', count: 1 },
      ]),
    );
    expect(status.history).toEqual([
      expect.objectContaining({
        type: 'project.backlog_imported',
        actor: null,
        origin: 'backlog',
        details: expect.objectContaining({ tasks: 6 }),
      }),
    ]);
    await expect(
      getBacklogStatus(ctx, world.memberActor, { project: key, problemsCursor: 'bad' }),
    ).rejects.toBeInstanceOf(Invalid);
  });

  it('refresh requests: admins and agents with write access; 409 when paused or detached', async () => {
    const { key, sourceId } = await mirror();
    ctx.jobs.clear();
    expect(await refreshBacklogNow(ctx, world.ownerActor, { projectKey: key })).toMatchObject({
      project: key,
      state: 'warnings',
      queued: true,
    });
    expect(ctx.jobs.sent.at(-1)?.data).toEqual({ sourceId, trigger: 'manual' });
    expect(await requestBacklogRefresh(ctx, world.agentActor, { project: key })).toMatchObject({
      queued: true,
    });
    expect(ctx.jobs.sent.at(-1)?.data).toEqual({ sourceId, trigger: 'cli' });
    await expect(refreshBacklogNow(ctx, world.memberActor, { projectKey: key })).rejects.toBeInstanceOf(
      Forbidden,
    );
    const readOnly = keyActor(world, { projects: 'all', access: 'read' });
    await expect(requestBacklogRefresh(ctx, readOnly, { project: key })).rejects.toBeInstanceOf(Forbidden);

    await base.db
      .update(schema.backlogSource)
      .set({ state: 'paused', lastError: 'The git connection was deleted.' })
      .where(eq(schema.backlogSource.id, sourceId));
    await expect(requestBacklogRefresh(ctx, world.agentActor, { project: key })).rejects.toThrow(
      BacklogPaused,
    );
  });

  it('webhook info shows the secret to admins only', async () => {
    const { key, sourceId } = await mirror();
    const source = await loadSource(base.db, sourceId);
    const admin = await getBacklogWebhookInfo(ctx, world.ownerActor, { projectKey: key });
    expect(admin).toMatchObject({
      url: `${TEST_PUBLIC_URL}/api/webhooks/backlog/${source?.webhookId}`,
      provider: 'gitlab',
      lastAt: null,
    });
    expect(admin.secret).toHaveLength(43);
    const member = await getBacklogWebhookInfo(ctx, world.memberActor, { projectKey: key });
    expect(member.secret).toBeNull();
    expect(member.url).toBe(admin.url);
  });

  it('webhook info: secretState ok for admins, hidden for members, unreadable with another key', async () => {
    const { key, sourceId } = await mirror();
    expect((await getBacklogWebhookInfo(ctx, world.ownerActor, { projectKey: key })).secretState).toBe('ok');
    expect((await getBacklogWebhookInfo(ctx, world.memberActor, { projectKey: key })).secretState).toBe(
      'hidden',
    );
    const otherKey = { ...ctx, encryptionKey: new Uint8Array(32).fill(9) };
    const info = await getBacklogWebhookInfo(otherKey, world.ownerActor, { projectKey: key });
    expect(info).toMatchObject({ secret: null, secretState: 'unreadable', provider: 'gitlab' });
    const source = await loadSource(base.db, sourceId);
    expect(info.url).toBe(`${TEST_PUBLIC_URL}/api/webhooks/backlog/${source?.webhookId}`);
    // Members never learn that the secret is unreadable.
    expect((await getBacklogWebhookInfo(otherKey, world.memberActor, { projectKey: key })).secretState).toBe(
      'hidden',
    );
    // Without any key the secret can't be issued again either, so the error stays.
    const { encryptionKey: _, ...noKey } = ctx;
    await expect(getBacklogWebhookInfo(noKey, world.ownerActor, { projectKey: key })).rejects.toBeInstanceOf(
      EncryptionKeyMissing,
    );
  });

  it('new webhook secret: same URL, a new secret stored encrypted, one activity row', async () => {
    const { key, sourceId, project } = await mirror();
    const before = await loadSource(base.db, sourceId);
    const old = await getBacklogWebhookInfo(ctx, world.ownerActor, { projectKey: key });
    const issued = await reissueBacklogWebhookSecret(ctx, world.ownerActor, {
      projectKey: key.toLowerCase(),
    });
    expect(issued.url).toBe(old.url);
    expect(issued.secret).toHaveLength(43);
    expect(issued.secret).not.toBe(old.secret);
    const after = await loadSource(base.db, sourceId);
    expect(after?.webhookId).toBe(before?.webhookId);
    expect(after?.webhookSecretCiphertext).not.toBe(before?.webhookSecretCiphertext);
    expect(decryptSecret(ctx, after?.webhookSecretCiphertext as string)).toBe(issued.secret);
    expect((await getBacklogWebhookInfo(ctx, world.ownerActor, { projectKey: key })).secret).toBe(
      issued.secret,
    );
    const activity = await projectActivity(base.db, project.id);
    expect(activity.map((row) => [row.type, row.actorId, row.taskId, row.origin])).toEqual([
      ['project.backlog_imported', null, null, 'backlog'],
      ['project.backlog_webhook_secret_reissued', world.owner.id, null, 'app'],
    ]);
    const status = await getBacklogStatus(ctx, world.ownerActor, { project: key });
    expect(status.history.map((entry) => entry.type)).toContain('project.backlog_webhook_secret_reissued');
    // No refresh is queued and the state is unchanged.
    expect(after?.state).toBe(before?.state);
  });

  it('new webhook secret: refused for members, agents, detached sources, imports and without a key', async () => {
    const { key } = await mirror();
    await expect(
      reissueBacklogWebhookSecret(ctx, world.memberActor, { projectKey: key }),
    ).rejects.toBeInstanceOf(Forbidden);
    await expect(
      reissueBacklogWebhookSecret(ctx, world.agentActor, { projectKey: key }),
    ).rejects.toBeInstanceOf(Forbidden);
    const { encryptionKey: _, ...noKey } = ctx;
    await expect(
      reissueBacklogWebhookSecret(noKey, world.ownerActor, { projectKey: key }),
    ).rejects.toBeInstanceOf(EncryptionKeyMissing);

    await detachBacklog(ctx, world.ownerActor, { projectKey: key, confirmKey: key });
    const detached = reissueBacklogWebhookSecret(ctx, world.ownerActor, { projectKey: key });
    await expect(detached).rejects.toBeInstanceOf(Conflict);
    await expect(detached).rejects.toThrow('This project no longer mirrors Backlog.md.');

    // An import before its first read (afterwards it is detached).
    const pending = await mirror({ mode: 'import', refresh: false });
    const pendingSource = await loadSource(base.db, pending.sourceId);
    expect(pendingSource).toMatchObject({ mode: 'import', state: 'setup' });
    await expect(
      reissueBacklogWebhookSecret(ctx, world.ownerActor, { projectKey: pending.key }),
    ).rejects.toThrow('This project no longer mirrors Backlog.md.');
    expect((await loadSource(base.db, pending.sourceId))?.webhookSecretCiphertext).toBe(
      pendingSource?.webhookSecretCiphertext,
    );
    const imported = await mirror({ mode: 'import' });
    await expect(
      reissueBacklogWebhookSecret(ctx, world.ownerActor, { projectKey: imported.key }),
    ).rejects.toBeInstanceOf(Conflict);
    const activity = await projectActivity(base.db, pending.project.id);
    expect(activity.some((row) => row.type === 'project.backlog_webhook_secret_reissued')).toBe(false);
  });

  it('new webhook secret works when the old one is unreadable with the current key', async () => {
    const { key, sourceId } = await mirror();
    await base.db
      .update(schema.backlogSource)
      .set({ webhookSecretCiphertext: encryptSecret({ encryptionKey: new Uint8Array(32).fill(3) }, 'lost') })
      .where(eq(schema.backlogSource.id, sourceId));
    expect((await getBacklogWebhookInfo(ctx, world.ownerActor, { projectKey: key })).secretState).toBe(
      'unreadable',
    );
    const issued = await reissueBacklogWebhookSecret(ctx, world.ownerActor, { projectKey: key });
    const info = await getBacklogWebhookInfo(ctx, world.ownerActor, { projectKey: key });
    expect(info).toMatchObject({ secret: issued.secret, secretState: 'ok' });
  });

  it('detach: typed key, admins only, secret dropped, one activity row, unlocked, refreshes refused', async () => {
    const { key, sourceId, project } = await mirror();
    expect(await isMirrored(base.db, project.id)).toBe(true);
    await expect(
      detachBacklog(ctx, world.ownerActor, { projectKey: key, confirmKey: 'NOPE' }),
    ).rejects.toBeInstanceOf(Invalid);
    await expect(
      detachBacklog(ctx, world.memberActor, { projectKey: key, confirmKey: key.toLowerCase() }),
    ).rejects.toBeInstanceOf(Forbidden);
    const status = await detachBacklog(ctx, world.ownerActor, {
      projectKey: key,
      confirmKey: key.toLowerCase(),
    });
    expect(status).toMatchObject({ state: 'detached', detachedBy: { id: world.owner.id } });
    expect(await isMirrored(base.db, project.id)).toBe(false);
    const source = await loadSource(base.db, sourceId);
    expect(source?.webhookSecretCiphertext).toBeNull();
    const activity = await projectActivity(base.db, project.id);
    expect(activity.map((row) => [row.type, row.actorId, row.origin])).toEqual([
      ['project.backlog_imported', null, 'backlog'],
      ['project.backlog_detached', world.owner.id, 'app'],
    ]);
    // Tasks keep their Backlog.md id and block.
    const tasks = await base.db.select().from(schema.task).where(eq(schema.task.projectId, project.id));
    expect(tasks.every((task) => task.backlogId && task.backlogData)).toBe(true);
    await expect(
      detachBacklog(ctx, world.ownerActor, { projectKey: key, confirmKey: key }),
    ).rejects.toBeInstanceOf(BacklogDetached);
    await expect(refreshBacklogNow(ctx, world.ownerActor, { projectKey: key })).rejects.toBeInstanceOf(
      BacklogDetached,
    );
    expect((await refreshBacklogSource(ctx, sourceId, 'poll')).outcome).toBe('skipped');
    const info = await getBacklogWebhookInfo(ctx, world.ownerActor, { projectKey: key });
    expect(info.secret).toBeNull();
  });

  it('incremental reads re-read skipped files, a config change reads everything; a new connection resumes', async () => {
    const { key, sourceId, repo } = await mirror();
    ctx.jobs.clear();
    await setBacklogFolder(ctx, world.ownerActor, { projectKey: key, folderOverride: 'backlog' });
    expect(ctx.jobs.sent).toHaveLength(1);
    provider.resetCalls();
    const same = await refreshBacklogSource(ctx, sourceId, 'manual');
    // The same folder: only the skipped file is read again.
    expect(same.downloads).toBe(1);
    repo.set('backlog/config.yml', configFile({ name: 'Renamed' }));
    repo.commit();
    const full = await refreshBacklogSource(ctx, sourceId, 'manual');
    // A changed config reads every file again.
    expect(full.downloads).toBe(repo.files().filter((file) => file.startsWith('backlog/')).length);

    await base.db
      .update(schema.backlogSource)
      .set({ state: 'paused', connectionId: null, lastError: 'The git connection was deleted.' })
      .where(eq(schema.backlogSource.id, sourceId));
    const replacement = await createGitConnectionRow(base.db, world, {
      tokenCiphertext: encryptSecret(ctx, TEST_TOKEN),
    });
    ctx.jobs.clear();
    const status = await setBacklogConnection(ctx, world.ownerActor, {
      projectKey: key,
      connectionId: replacement.id,
    });
    expect(status).toMatchObject({ state: 'warnings', lastError: null, connection: { id: replacement.id } });
    expect(ctx.jobs.sent).toHaveLength(1);
    const github = await createGitConnectionRow(base.db, world, {
      host: 'github.com',
      provider: 'github',
      tokenCiphertext: encryptSecret(ctx, TEST_TOKEN),
    });
    await expect(
      setBacklogConnection(ctx, world.ownerActor, { projectKey: key, connectionId: github.id }),
    ).rejects.toBeInstanceOf(Invalid);
  });
});
