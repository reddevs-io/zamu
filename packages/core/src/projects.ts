// Projects: list with open counts, create, update, and the milestone and cycle switches.
import {
  CreateProjectInput,
  type CurrentCycle,
  OPEN_TASK_STATUSES,
  Project,
  ProjectList,
  UpdateProjectInput,
  type UserRef,
} from '@pm/contracts';
import { type DbOrTx, schema } from '@pm/db';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { type Actor, authorize, can } from './authz';
import type { DbContext } from './context';
import { type ClockContext, currentCycles } from './cycles';
import { Conflict, isUniqueViolation, parseInput } from './errors';
import { findProjectByKey, type ProjectRow, toDate, userRef } from './internal';

const { project, task, user } = schema;

const PROJECT_KEY_UNIQUE = 'project_workspaceId_key_unique';

type ProjectContext = DbContext & ClockContext;

/** The contract shape. `currentCycle` is dropped when the project does not use cycles. */
export function toProject(row: ProjectRow, currentCycle: CurrentCycle | null = null): Project {
  return Project.parse({
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    usesMilestones: row.usesMilestones,
    usesCycles: row.usesCycles,
    currentCycle: row.usesCycles ? currentCycle : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/** toProject with the current cycle looked up. */
async function toProjectWithCycle(ctx: ProjectContext, db: DbOrTx, row: ProjectRow): Promise<Project> {
  if (!row.usesCycles) return toProject(row);
  const cycles = await currentCycles(db, [row.id], ctx);
  return toProject(row, cycles.get(row.id) ?? null);
}

function keyTaken(key: string): Conflict {
  return new Conflict(`Project key ${key} is already used in this workspace`);
}

const openCount = (status: string) =>
  sql<number>`count(${task.id}) filter (where ${task.status} = ${status})`.mapWith(Number);

/**
 * Projects the actor can read, with open task counts per status, the distinct assignees of open
 * tasks (people first), the last activity time and the current cycle. Most recently active first.
 */
export async function listProjects(ctx: ProjectContext, actor: Actor): Promise<ProjectList> {
  const { db } = ctx;
  authorize(actor, 'workspace.read');
  const scope = actor.scope?.projects;
  if (Array.isArray(scope) && scope.length === 0) return { items: [] };

  const rows = await db
    .select({
      project,
      backlog: openCount('backlog'),
      todo: openCount('todo'),
      in_progress: openCount('in_progress'),
      in_review: openCount('in_review'),
      lastActivityAt: sql<string>`greatest(${project.updatedAt}, max(${task.updatedAt}))`,
    })
    .from(project)
    .leftJoin(task, eq(task.projectId, project.id))
    .where(
      and(
        eq(project.workspaceId, actor.workspaceId),
        Array.isArray(scope) ? inArray(project.id, scope) : undefined,
      ),
    )
    .groupBy(project.id)
    .orderBy(sql`greatest(${project.updatedAt}, max(${task.updatedAt})) desc`, asc(project.key));

  const visible = rows.filter((row) =>
    can(actor, 'project.read', { type: 'project', projectId: row.project.id }),
  );
  const [assignees, cycles] = await Promise.all([
    openAssignees(
      { db },
      visible.map((row) => row.project.id),
    ),
    currentCycles(
      db,
      visible.filter((row) => row.project.usesCycles).map((row) => row.project.id),
      ctx,
    ),
  ]);

  return ProjectList.parse({
    items: visible.map((row) => {
      const openCounts = {
        backlog: row.backlog,
        todo: row.todo,
        in_progress: row.in_progress,
        in_review: row.in_review,
      };
      return {
        ...toProject(row.project, cycles.get(row.project.id) ?? null),
        openCounts,
        openCount: Object.values(openCounts).reduce((sum, n) => sum + n, 0),
        lastActivityAt: toDate(row.lastActivityAt),
        assignees: assignees.get(row.project.id) ?? [],
      };
    }),
  });
}

/** Distinct assignees of open tasks per project, people first, then by name. */
async function openAssignees({ db }: DbContext, projectIds: string[]): Promise<Map<string, UserRef[]>> {
  const result = new Map<string, UserRef[]>();
  if (projectIds.length === 0) return result;
  const rows = await db
    .selectDistinct({ projectId: task.projectId, id: user.id, name: user.name, kind: user.kind })
    .from(task)
    .innerJoin(user, eq(user.id, task.assigneeId))
    .where(and(inArray(task.projectId, projectIds), inArray(task.status, [...OPEN_TASK_STATUSES])))
    .orderBy(asc(task.projectId), desc(user.kind), asc(user.name), asc(user.id)); // 'person' > 'agent'
  for (const row of rows) {
    const list = result.get(row.projectId) ?? [];
    list.push(userRef(row));
    result.set(row.projectId, list);
  }
  return result;
}

/** Creates a project. Conflict when the key is already used in the workspace. */
export async function createProject(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof CreateProjectInput>,
): Promise<Project> {
  const { name, key, description } = parseInput(CreateProjectInput, input);
  authorize(actor, 'project.create');
  try {
    const [row] = await db
      .insert(project)
      .values({ workspaceId: actor.workspaceId, key, name, description: description || null })
      .returning();
    if (!row) throw new Error('project insert returned no row');
    return toProject(row);
  } catch (error) {
    if (isUniqueViolation(error, PROJECT_KEY_UNIQUE)) throw keyTaken(key);
    throw error;
  }
}

/**
 * Updates name, description, key or the milestone and cycle switches. The key can change only
 * while the project has no tasks, because task keys embed it. Conflict otherwise, or when the new
 * key is taken. Turning a switch off keeps the milestones or cycles; turning it on shows them again.
 */
export async function updateProject(
  ctx: ProjectContext,
  actor: Actor,
  input: z.input<typeof UpdateProjectInput>,
): Promise<Project> {
  const parsed = parseInput(UpdateProjectInput, input);
  try {
    return await ctx.db.transaction(async (tx) => {
      // Locking the row also serialises against task creation, which updates next_task_number.
      const current = await findProjectByKey(tx, actor, parsed.project, { forUpdate: true });
      authorize(actor, 'project.update', { type: 'project', projectId: current.id });

      const changes: Partial<typeof project.$inferInsert> = {};
      if (parsed.name !== undefined && parsed.name !== current.name) changes.name = parsed.name;
      if (parsed.description !== undefined) {
        const description = parsed.description || null;
        if (description !== current.description) changes.description = description;
      }
      if (parsed.key !== undefined && parsed.key !== current.key) {
        const [existing] = await tx
          .select({ id: task.id })
          .from(task)
          .where(eq(task.projectId, current.id))
          .limit(1);
        if (existing) {
          throw new Conflict(`The key of ${current.key} cannot change: the project already has tasks`);
        }
        changes.key = parsed.key;
      }
      if (parsed.usesMilestones !== undefined && parsed.usesMilestones !== current.usesMilestones) {
        changes.usesMilestones = parsed.usesMilestones;
      }
      if (parsed.usesCycles !== undefined && parsed.usesCycles !== current.usesCycles) {
        changes.usesCycles = parsed.usesCycles;
      }
      if (Object.keys(changes).length === 0) return toProjectWithCycle(ctx, tx, current);

      const [row] = await tx.update(project).set(changes).where(eq(project.id, current.id)).returning();
      if (!row) throw new Error('project update returned no row');
      return toProjectWithCycle(ctx, tx, row);
    });
  } catch (error) {
    if (parsed.key && isUniqueViolation(error, PROJECT_KEY_UNIQUE)) throw keyTaken(parsed.key);
    throw error;
  }
}
