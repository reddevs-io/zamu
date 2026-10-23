// Applies a refresh plan (./plan) in the caller's transaction: milestone and task rows, the
// project's next task number, backlog_file rows, activity from the Backlog.md actor (origin backlog,
// origin_ref = commit) and the source state. Rows are written directly with Drizzle; services'
// owned-field locks do not apply to the refresh itself.
import type { BacklogMode, BacklogTrigger } from '@pm/contracts';
import { schema, type Tx } from '@pm/db';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { recordActivities, recordActivity, type StoredChange, type SystemActivityEntry } from '../activity';
import type { BacklogPlan, ExistingFile, FileRow, MilestoneTarget, PlannedChange, TaskValues } from './plan';

const { backlogFile, backlogSource, milestone, project, task } = schema;

export type BacklogSourceRow = typeof backlogSource.$inferSelect;
export type ProjectRow = typeof project.$inferSelect;

/** Rows per insert statement. */
const CHUNK = 500;
/** Temporary numbers for tasks whose number changes (draft moves), clear of real numbers. */
const TEMP_NUMBER_BASE = 2_000_000_000;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

export interface ApplyInput {
  source: BacklogSourceRow;
  project: ProjectRow;
  plan: BacklogPlan;
  /** backlog_file rows of the previous read. */
  previousFiles: ExistingFile[];
  trigger: BacklogTrigger;
  defaultBranch: string;
  headCommit: string;
  /** Short form of the repository, for the imported activity row. */
  repository: string | null;
  now: Date;
}

export interface ApplyResult {
  created: number;
  updated: number;
  hidden: number;
  restored: number;
  milestonesCreated: number;
  /** True when the source was an import and is detached now. */
  detached: boolean;
}

function sameFileRow(a: ExistingFile, b: Omit<ExistingFile, 'path'>): boolean {
  return (
    a.blobSha === b.blobSha &&
    a.kind === b.kind &&
    a.backlogId === b.backlogId &&
    a.taskId === b.taskId &&
    a.milestoneId === b.milestoneId &&
    a.error === b.error
  );
}

/** Applies `plan`. Call inside one transaction; a failure anywhere rolls everything back. */
export async function applyPlan(tx: Tx, input: ApplyInput): Promise<ApplyResult> {
  const { source, plan, now } = input;
  // Lock order: project, then tasks (as the task services do).
  await tx.select({ id: project.id }).from(project).where(eq(project.id, input.project.id)).for('update');

  // Milestones ------------------------------------------------------------------------------------
  const milestoneIds = new Map<string, string>();
  for (const batch of chunks(plan.milestones.creates)) {
    const rows = await tx
      .insert(milestone)
      .values(
        batch.map((values) => ({
          workspaceId: input.project.workspaceId,
          projectId: input.project.id,
          createdById: source.createdById,
          backlogId: values.backlogId,
          name: values.name,
          description: values.description,
          targetDate: values.targetDate,
          status: values.status,
          completedAt: values.completedAt,
        })),
      )
      .returning({ id: milestone.id, backlogId: milestone.backlogId });
    for (const row of rows) if (row.backlogId) milestoneIds.set(row.backlogId, row.id);
  }
  for (const update of plan.milestones.updates) {
    await tx
      .update(milestone)
      .set({ ...update.set, ...(update.restore ? { hiddenAt: null } : {}) })
      .where(eq(milestone.id, update.id));
  }
  if (plan.milestones.hides.length > 0) {
    await tx
      .update(milestone)
      .set({ hiddenAt: now })
      .where(
        inArray(
          milestone.id,
          plan.milestones.hides.map((row) => row.id),
        ),
      );
  }
  const milestoneId = (target: MilestoneTarget | null): string | null => {
    if (!target) return null;
    if ('id' in target) return target.id;
    const id = milestoneIds.get(target.backlogId);
    if (!id) throw new Error(`milestone ${target.backlogId} was not created`);
    return id;
  };

  // Tasks -------------------------------------------------------------------------------------------
  const taskColumns = (values: Partial<TaskValues>) => {
    const { milestone: target, ...rest } = values;
    return { ...rest, ...(target !== undefined ? { milestoneId: milestoneId(target) } : {}) };
  };
  // Number changes go through temporary numbers so two moves never collide on the unique key.
  const renumbered = plan.tasks.updates.filter((update) => update.set.number !== undefined);
  for (const [index, update] of renumbered.entries()) {
    await tx
      .update(task)
      .set({ number: TEMP_NUMBER_BASE + index, updatedAt: sql`${task.updatedAt}` })
      .where(eq(task.id, update.id));
  }
  let restored = 0;
  for (const update of plan.tasks.updates) {
    if (update.restore) restored += 1;
    await tx
      .update(task)
      .set({ ...taskColumns(update.set), ...(update.restore ? { hiddenAt: null } : {}) })
      .where(eq(task.id, update.id));
  }
  if (plan.tasks.hides.length > 0) {
    await tx
      .update(task)
      .set({ hiddenAt: now })
      .where(
        inArray(
          task.id,
          plan.tasks.hides.map((row) => row.id),
        ),
      );
  }
  const taskIds = new Map<string, string>();
  for (const batch of chunks(plan.tasks.creates)) {
    const rows = await tx
      .insert(task)
      .values(
        batch.map((values) => ({
          projectId: input.project.id,
          createdById: source.createdById,
          number: values.number,
          keySuffix: values.keySuffix,
          backlogId: values.backlogId,
          title: values.title,
          description: values.description,
          status: values.status,
          priority: values.priority,
          assigneeId: values.assigneeId,
          milestoneId: milestoneId(values.milestone),
          createdAt: values.createdAt,
          backlogData: values.backlogData as Record<string, unknown>,
          rank: values.rank,
        })),
      )
      .returning({ id: task.id, backlogId: task.backlogId });
    for (const row of rows) if (row.backlogId) taskIds.set(row.backlogId, row.id);
  }

  // Activity --------------------------------------------------------------------------------------------
  const origin = {
    origin: 'backlog' as const,
    originRef: plan.commit,
    workspaceId: input.project.workspaceId,
  };
  if (plan.firstRead) {
    if (plan.tasks.creates.length + plan.milestones.creates.length > 0 || source.mode === 'import') {
      await recordActivity(tx, null, {
        ...origin,
        projectId: input.project.id,
        type: 'project.backlog_imported',
        details: {
          mode: source.mode as BacklogMode,
          repository: input.repository,
          tasks: plan.tasks.creates.length,
          milestones: plan.milestones.creates.length,
        },
      });
    }
  } else {
    const entries: SystemActivityEntry[] = [];
    const stored = (change: PlannedChange): StoredChange =>
      change.field === 'milestone'
        ? { field: 'milestone', from: change.from, to: milestoneId(change.to) }
        : change;
    for (const update of plan.tasks.updates) {
      const changes = update.changes.map(stored);
      if (update.restore) {
        entries.push({
          ...origin,
          projectId: input.project.id,
          taskId: update.id,
          type: 'task.restored',
          changes,
        });
      } else if (changes.length > 0) {
        entries.push({
          ...origin,
          projectId: input.project.id,
          taskId: update.id,
          type: 'task.updated',
          changes,
        });
      }
    }
    for (const hide of plan.tasks.hides) {
      entries.push({
        ...origin,
        projectId: input.project.id,
        taskId: hide.id,
        type: 'task.hidden',
        changes: [],
      });
    }
    for (const created of plan.tasks.creates) {
      const taskId = taskIds.get(created.backlogId) as string;
      entries.push({ ...origin, projectId: input.project.id, taskId, type: 'task.created', changes: [] });
    }
    for (const batch of chunks(entries)) await recordActivities(tx, null, batch);
  }

  // backlog_file rows -------------------------------------------------------------------------------------
  const resolveTask = (ref: FileRow['task']) =>
    ref === null ? null : 'id' in ref ? ref.id : (taskIds.get(ref.backlogId) ?? null);
  const previousByPath = new Map(input.previousFiles.map((file) => [file.path, file]));
  const changedRows = plan.files
    .map((file) => ({
      sourceId: source.id,
      path: file.path,
      blobSha: file.blobSha,
      kind: file.kind,
      backlogId: file.backlogId,
      taskId: resolveTask(file.task),
      milestoneId: file.milestone ? milestoneId(file.milestone) : null,
      error: file.error,
      seenAt: now,
    }))
    .filter((row) => {
      const previous = previousByPath.get(row.path);
      return !previous || !sameFileRow(previous, row);
    });
  const paths = plan.files.map((file) => file.path);
  await tx
    .delete(backlogFile)
    .where(
      paths.length > 0
        ? and(eq(backlogFile.sourceId, source.id), notInArray(backlogFile.path, paths))
        : eq(backlogFile.sourceId, source.id),
    );
  for (const batch of chunks(changedRows)) {
    await tx
      .insert(backlogFile)
      .values(batch)
      .onConflictDoUpdate({
        target: [backlogFile.sourceId, backlogFile.path],
        set: {
          blobSha: sql`excluded.blob_sha`,
          kind: sql`excluded.kind`,
          backlogId: sql`excluded.backlog_id`,
          taskId: sql`excluded.task_id`,
          milestoneId: sql`excluded.milestone_id`,
          error: sql`excluded.error`,
          seenAt: sql`excluded.seen_at`,
        },
      });
  }
  if (changedRows.length < plan.files.length) {
    await tx.update(backlogFile).set({ seenAt: now }).where(eq(backlogFile.sourceId, source.id));
  }

  // Project and source ----------------------------------------------------------------------------------------
  await tx
    .update(project)
    .set({
      nextTaskNumber: sql`greatest(${project.nextTaskNumber}, ${plan.nextTaskNumber})`,
      updatedAt: sql`${project.updatedAt}`,
    })
    .where(eq(project.id, input.project.id));

  const detach = source.mode === 'import';
  await tx
    .update(backlogSource)
    .set({
      state: detach ? 'detached' : plan.problems.length > 0 ? 'warnings' : 'healthy',
      folder: plan.folder,
      prefix: plan.config.taskPrefix,
      config: plan.config,
      defaultBranch: input.defaultBranch,
      headCommit: input.headCommit,
      lastReadCommit: plan.commit,
      lastReadAt: now,
      lastTrigger: input.trigger,
      lastError: null,
      warnings: plan.problems,
      ...(detach ? { detachedAt: now, detachedById: source.createdById, webhookSecretCiphertext: null } : {}),
    })
    .where(eq(backlogSource.id, source.id));

  return {
    created: plan.tasks.creates.length,
    updated: plan.tasks.updates.length - restored,
    hidden: plan.tasks.hides.length,
    restored,
    milestonesCreated: plan.milestones.creates.length,
    detached: detach,
  };
}
