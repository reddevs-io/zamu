// Milestones: per-project goals with an optional target date. Planned until a task in them starts
// (activateMilestoneForTask), Active then, Completed only by hand. Progress comes from task counts.
import {
  CreateMilestoneInput,
  DeleteMilestoneInput,
  GetMilestoneInput,
  ListMilestonesInput,
  MilestoneList,
  type MilestoneProgress,
  MilestoneWithProgress,
  UpdateMilestoneInput,
} from '@pm/contracts';
import { type DbOrTx, schema, type Tx } from '@pm/db';
import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { type ActivityEntry, recordActivities } from './activity';
import { type Actor, authorize } from './authz';
import type { DbContext } from './context';
import { type ClockContext, calendarDaysBetween, clockNow, todayIn } from './cycles';
import { Conflict, isUniqueViolation, NotFound, parseInput } from './errors';
import { findProjectByKey, loadUsers, type ProjectRow, userRef } from './internal';

const { milestone, project, task } = schema;

const MILESTONE_NAME_UNIQUE = 'milestone_projectId_name_unique';

export type MilestoneRow = typeof milestone.$inferSelect;

type MilestoneContext = DbContext & ClockContext;

/**
 * Sets a Planned milestone to Active, inside the caller's transaction. Task services call it when
 * a task in the milestone moves to In progress or In review. Active and Completed milestones stay
 * as they are; null or an unknown id does nothing. Returns true when the status changed.
 */
export async function activateMilestoneForTask(
  tx: Tx,
  milestoneId: string | null | undefined,
): Promise<boolean> {
  if (!milestoneId) return false;
  const rows = await tx
    .update(milestone)
    .set({ status: 'active' })
    .where(and(eq(milestone.id, milestoneId), eq(milestone.status, 'planned')))
    .returning({ id: milestone.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const countWhere = (condition: SQL) => sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

const EMPTY_PROGRESS: MilestoneProgress = { total: 0, done: 0, inProgress: 0, open: 0, canceled: 0 };

async function milestoneProgress(db: DbOrTx, ids: string[]): Promise<Map<string, MilestoneProgress>> {
  const result = new Map<string, MilestoneProgress>();
  if (ids.length === 0) return result;
  const rows = await db
    .select({
      milestoneId: task.milestoneId,
      total: sql<number>`count(*)`.mapWith(Number),
      done: countWhere(sql`${task.status} = 'done'`),
      inProgress: countWhere(sql`${task.status} in ('in_progress', 'in_review')`),
      open: countWhere(sql`${task.status} in ('backlog', 'todo')`),
      canceled: countWhere(sql`${task.status} = 'canceled'`),
    })
    .from(task)
    .where(inArray(task.milestoneId, ids))
    .groupBy(task.milestoneId);
  for (const { milestoneId, ...progress } of rows) if (milestoneId) result.set(milestoneId, progress);
  return result;
}

async function toMilestones(
  db: DbOrTx,
  projectRow: ProjectRow,
  rows: MilestoneRow[],
  clock: ClockContext,
): Promise<MilestoneWithProgress[]> {
  const today = todayIn(clock);
  const [progress, users] = await Promise.all([
    milestoneProgress(
      db,
      rows.map((row) => row.id),
    ),
    loadUsers(
      db,
      rows.map((row) => row.createdById),
    ),
  ]);
  return rows.map((row) => {
    const creator = users.get(row.createdById);
    if (!creator) throw new Error(`user ${row.createdById} referenced by a milestone does not exist`);
    return MilestoneWithProgress.parse({
      id: row.id,
      project: { id: projectRow.id, key: projectRow.key, name: projectRow.name },
      name: row.name,
      description: row.description,
      targetDate: row.targetDate,
      status: row.status,
      completedAt: row.completedAt,
      createdBy: userRef(creator),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      progress: progress.get(row.id) ?? EMPTY_PROGRESS,
      daysLeft: row.targetDate ? calendarDaysBetween(today, row.targetDate) : null,
      overdue: row.targetDate !== null && row.targetDate < today && row.status !== 'completed',
    });
  });
}

async function toMilestone(db: DbOrTx, projectRow: ProjectRow, row: MilestoneRow, clock: ClockContext) {
  const [item] = await toMilestones(db, projectRow, [row], clock);
  if (!item) throw new Error('milestone mapping returned nothing');
  return item;
}

// ---------------------------------------------------------------------------
// Shared checks
// ---------------------------------------------------------------------------

function requireMilestones(projectRow: ProjectRow): void {
  if (!projectRow.usesMilestones) {
    throw new Conflict(`${projectRow.key} does not use milestones. Turn them on in the project settings.`);
  }
}

function nameTaken(name: string): Conflict {
  return new Conflict(`A milestone named "${name}" already exists in this project`);
}

/**
 * The milestone with `id` and its project, after the read check. NotFound outside the actor's
 * workspace; Forbidden outside the key's scope.
 */
async function findMilestone(
  db: DbOrTx,
  actor: Actor,
  id: string,
  options: { forUpdate?: boolean } = {},
): Promise<{ project: ProjectRow; milestone: MilestoneRow }> {
  const query = db
    .select({ milestone, project })
    .from(milestone)
    .innerJoin(project, eq(project.id, milestone.projectId))
    .where(and(eq(milestone.id, id), eq(milestone.workspaceId, actor.workspaceId)))
    .limit(1);
  const [row] = options.forUpdate ? await query.for('update', { of: milestone }) : await query;
  if (!row) throw new NotFound('Milestone not found');
  authorize(actor, 'project.read', { type: 'project', projectId: row.project.id });
  return row;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** A project's milestones with progress, by target date (none last), then name. */
export async function listMilestones(
  ctx: MilestoneContext,
  actor: Actor,
  input: z.input<typeof ListMilestonesInput>,
): Promise<MilestoneList> {
  const parsed = parseInput(ListMilestonesInput, input);
  const projectRow = await findProjectByKey(ctx.db, actor, parsed.project);
  const rows = await ctx.db
    .select()
    .from(milestone)
    .where(
      and(
        eq(milestone.projectId, projectRow.id),
        parsed.status ? inArray(milestone.status, parsed.status) : undefined,
      ),
    )
    .orderBy(sql`${milestone.targetDate} asc nulls last`, sql`lower(${milestone.name})`, asc(milestone.id));
  return MilestoneList.parse({ items: await toMilestones(ctx.db, projectRow, rows, ctx) });
}

export async function getMilestone(
  ctx: MilestoneContext,
  actor: Actor,
  input: z.input<typeof GetMilestoneInput>,
): Promise<MilestoneWithProgress> {
  const { id } = parseInput(GetMilestoneInput, input);
  const found = await findMilestone(ctx.db, actor, id);
  return toMilestone(ctx.db, found.project, found.milestone, ctx);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** Creates a Planned milestone. Conflict when the name is taken in the project (ignoring case). */
export async function createMilestone(
  ctx: MilestoneContext,
  actor: Actor,
  input: z.input<typeof CreateMilestoneInput>,
): Promise<MilestoneWithProgress> {
  const parsed = parseInput(CreateMilestoneInput, input);
  const projectRow = await findProjectByKey(ctx.db, actor, parsed.project);
  authorize(actor, 'task.write', { type: 'project', projectId: projectRow.id });
  requireMilestones(projectRow);
  try {
    const [row] = await ctx.db
      .insert(milestone)
      .values({
        workspaceId: projectRow.workspaceId,
        projectId: projectRow.id,
        name: parsed.name,
        description: parsed.description || null,
        targetDate: parsed.targetDate ?? null,
        createdById: actor.userId,
      })
      .returning();
    if (!row) throw new Error('milestone insert returned no row');
    return await toMilestone(ctx.db, projectRow, row, ctx);
  } catch (error) {
    if (isUniqueViolation(error, MILESTONE_NAME_UNIQUE)) throw nameTaken(parsed.name);
    throw error;
  }
}

/**
 * Changes name, description, target date or status. Completed is set by hand only; any other
 * status on a Completed milestone reopens it as Active.
 */
export async function updateMilestone(
  ctx: MilestoneContext,
  actor: Actor,
  input: z.input<typeof UpdateMilestoneInput>,
): Promise<MilestoneWithProgress> {
  const parsed = parseInput(UpdateMilestoneInput, input);
  try {
    return await ctx.db.transaction(async (tx) => {
      const { project: projectRow, milestone: current } = await findMilestone(tx, actor, parsed.id, {
        forUpdate: true,
      });
      authorize(actor, 'task.write', { type: 'project', projectId: projectRow.id });
      requireMilestones(projectRow);

      const set: Partial<typeof milestone.$inferInsert> = {};
      if (parsed.name !== undefined && parsed.name !== current.name) set.name = parsed.name;
      if (parsed.description !== undefined) {
        const description = parsed.description || null;
        if (description !== current.description) set.description = description;
      }
      if (parsed.targetDate !== undefined && parsed.targetDate !== current.targetDate) {
        set.targetDate = parsed.targetDate;
      }
      if (parsed.status !== undefined && parsed.status !== current.status) {
        if (parsed.status === 'completed') {
          set.status = 'completed';
          set.completedAt = clockNow(ctx);
        } else if (current.status === 'completed') {
          set.status = 'active';
          set.completedAt = null;
        } else {
          set.status = parsed.status;
        }
      }
      if (Object.keys(set).length === 0) return toMilestone(tx, projectRow, current, ctx);

      const [row] = await tx.update(milestone).set(set).where(eq(milestone.id, current.id)).returning();
      if (!row) throw new Error('milestone update returned no row');
      return toMilestone(tx, projectRow, row, ctx);
    });
  } catch (error) {
    if (parsed.name && isUniqueViolation(error, MILESTONE_NAME_UNIQUE)) throw nameTaken(parsed.name);
    throw error;
  }
}

/**
 * Deletes a milestone. Its tasks lose it, each with a task.updated activity entry, in the same
 * transaction.
 */
export async function deleteMilestone(
  ctx: MilestoneContext,
  actor: Actor,
  input: z.input<typeof DeleteMilestoneInput>,
): Promise<void> {
  const { id } = parseInput(DeleteMilestoneInput, input);
  await ctx.db.transaction(async (tx) => {
    const { project: projectRow, milestone: current } = await findMilestone(tx, actor, id, {
      forUpdate: true,
    });
    authorize(actor, 'task.write', { type: 'project', projectId: projectRow.id });
    requireMilestones(projectRow);

    const cleared = await tx
      .update(task)
      .set({ milestoneId: null })
      .where(eq(task.milestoneId, current.id))
      .returning({ id: task.id });
    const entries: ActivityEntry[] = cleared.map((row) => ({
      projectId: projectRow.id,
      taskId: row.id,
      type: 'task.updated',
      changes: [{ field: 'milestone', from: current.id, to: null }],
    }));
    await recordActivities(tx, actor, entries);
    await tx.delete(milestone).where(eq(milestone.id, current.id));
  });
}
