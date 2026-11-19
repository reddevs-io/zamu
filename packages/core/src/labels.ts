// M5 labels: per project, created on use by name or in project settings. Rules from section 2 of
// the M5 plan and "The four new fields" of the M5 brief:
// - Names are unique per project ignoring case, 1 to 40 characters. Writes that name an existing
//   label in another case use it as it is (the first casing stays).
// - A new label takes the least used palette hue of the project (fewest labels; ties go to the
//   lowest number) unless a colour is given.
// - Labels from Backlog.md files (source backlog) keep their name: renaming or deleting them fails
//   with LabelMirrored. Their colour stays editable.
// - Label create, rename, recolour and delete write no activity; task history keeps the names it
//   recorded.
// - Reading needs project.read; writing needs task.write, like milestones.
import {
  CreateLabelInput,
  DeleteLabelInput,
  LABEL_COLOR_COUNT,
  type Label,
  LabelList,
  type LabelSource,
  LabelWithUsage,
  ListLabelsInput,
  UpdateLabelInput,
} from '@zamu/contracts';
import { type DbOrTx, schema, type Tx } from '@zamu/db';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { compareLabelNames } from './activity';
import { type Actor, authorize } from './authz';
import type { DbContext } from './context';
import { isUniqueViolation, NotFound, parseInput } from './errors';
import { findProjectByKey, type ProjectRow } from './internal';
import { LabelExists, LabelMirrored } from './relations';

const { label, task, taskLabel } = schema;

export type LabelRow = typeof label.$inferSelect;

const LABEL_UNIQUE_INDEX = 'label_projectId_name_unique';

/** The contract shape of a label row. */
export function toLabel(row: Pick<LabelRow, 'id' | 'name' | 'color' | 'source'>): Label {
  return { id: row.id, name: row.name, color: row.color, source: row.source };
}

function labelExists(name: string, projectRow: Pick<ProjectRow, 'key'>): LabelExists {
  const message = `${projectRow.key} has a label named ${name} already`;
  return new LabelExists(message, { issues: [{ path: 'name', message }] });
}

// ---------------------------------------------------------------------------
// Helpers for task reads and writes
// ---------------------------------------------------------------------------

/** Labels of each task in `taskIds`, sorted by name ignoring case. Tasks without labels are left out. */
export async function labelsOfTasks(db: DbOrTx, taskIds: string[]): Promise<Map<string, Label[]>> {
  if (taskIds.length === 0) return new Map();
  const rows = await db
    .select({
      taskId: taskLabel.taskId,
      id: label.id,
      name: label.name,
      color: label.color,
      source: label.source,
    })
    .from(taskLabel)
    .innerJoin(label, eq(label.id, taskLabel.labelId))
    .where(inArray(taskLabel.taskId, taskIds));
  const byTask = new Map<string, Label[]>();
  for (const { taskId, ...row } of rows) {
    const list = byTask.get(taskId) ?? [];
    list.push(toLabel(row));
    byTask.set(taskId, list);
  }
  for (const list of byTask.values()) list.sort(compareLabelNames);
  return byTask;
}

/**
 * The palette hue a new label of the project gets: the one the fewest labels use, ties to the
 * lowest number. Counts the rows `db` sees, so labels inserted earlier in the same transaction
 * count once.
 */
export async function pickLabelColor(db: DbOrTx, projectId: string): Promise<number> {
  const rows = await db
    .select({ color: label.color, count: sql<number>`count(*)`.mapWith(Number) })
    .from(label)
    .where(eq(label.projectId, projectId))
    .groupBy(label.color);
  const usage = Array.from({ length: LABEL_COLOR_COUNT }, () => 0);
  for (const row of rows)
    if (row.color >= 1 && row.color <= LABEL_COLOR_COUNT) usage[row.color - 1] = row.count;
  let best = 0;
  for (let i = 1; i < usage.length; i++) if ((usage[i] ?? 0) < (usage[best] ?? 0)) best = i;
  return best + 1;
}

/** The labels of the project named `names` (ignoring case) that exist, by lower-cased name. */
export async function findLabelsByName(
  db: DbOrTx,
  projectId: string,
  names: string[],
): Promise<Map<string, LabelRow>> {
  const folded = [...new Set(names.map((name) => name.toLowerCase()))];
  if (folded.length === 0) return new Map();
  const rows = await db
    .select()
    .from(label)
    .where(and(eq(label.projectId, projectId), inArray(sql`lower(${label.name})`, folded)));
  return new Map(rows.map((row) => [row.name.toLowerCase(), row]));
}

/**
 * The labels named `names` in the project, created when missing (with the least used hue each,
 * `source` app by default), in the order of `names` without case repeats. An existing label is
 * used as it is, whatever its source and casing. Safe against concurrent creation of the same
 * name: the insert skips on the unique index and the existing row is read back.
 */
export async function findOrCreateLabels(
  tx: Tx,
  scope: { workspaceId: string; projectId: string },
  names: string[],
  options: { source?: LabelSource } = {},
): Promise<LabelRow[]> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of names.map((value) => value.trim())) {
    const folded = name.toLowerCase();
    if (name === '' || seen.has(folded)) continue;
    seen.add(folded);
    unique.push(name);
  }
  if (unique.length === 0) return [];
  const existing = await findLabelsByName(tx, scope.projectId, unique);
  const result: LabelRow[] = [];
  for (const name of unique) {
    const found = existing.get(name.toLowerCase());
    if (found) {
      result.push(found);
      continue;
    }
    // Each pick sees the labels inserted before it in this transaction.
    const color = await pickLabelColor(tx, scope.projectId);
    const inserted = await tx.execute<{ id: string }>(sql`
      insert into ${label} (workspace_id, project_id, name, color, source)
      values (${scope.workspaceId}, ${scope.projectId}, ${name}, ${color}, ${options.source ?? 'app'})
      on conflict (project_id, lower(name)) do nothing
      returning id`);
    const id = inserted.rows[0]?.id;
    const [row] = id
      ? await tx.select().from(label).where(eq(label.id, id))
      : await tx
          .select()
          .from(label)
          .where(
            and(eq(label.projectId, scope.projectId), eq(sql`lower(${label.name})`, name.toLowerCase())),
          );
    if (!row) throw new Error(`label ${name} could not be created or read`);
    result.push(row);
  }
  return result;
}

/** Labels of one task as rows, sorted by name ignoring case. */
export async function loadTaskLabelRows(db: DbOrTx, taskId: string): Promise<LabelRow[]> {
  const rows = await db
    .select({ label })
    .from(taskLabel)
    .innerJoin(label, eq(label.id, taskLabel.labelId))
    .where(eq(taskLabel.taskId, taskId));
  return rows.map((row) => row.label).sort(compareLabelNames);
}

/** Replaces the labels of `taskId` with `labelIds`. */
export async function setTaskLabels(tx: Tx, taskId: string, labelIds: string[]): Promise<void> {
  await tx.delete(taskLabel).where(eq(taskLabel.taskId, taskId));
  if (labelIds.length > 0) {
    await tx
      .insert(taskLabel)
      .values(labelIds.map((labelId) => ({ taskId, labelId })))
      .onConflictDoNothing();
  }
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

/** Visible tasks carrying each label of `labelIds` (hidden tasks are left out). */
async function usageCounts(db: DbOrTx, labelIds: string[]): Promise<Map<string, number>> {
  if (labelIds.length === 0) return new Map();
  const rows = await db
    .select({ labelId: taskLabel.labelId, count: sql<number>`count(*)`.mapWith(Number) })
    .from(taskLabel)
    .innerJoin(task, eq(task.id, taskLabel.taskId))
    .where(and(inArray(taskLabel.labelId, labelIds), isNull(task.hiddenAt)))
    .groupBy(taskLabel.labelId);
  return new Map(rows.map((row) => [row.labelId, row.count]));
}

async function withUsage(db: DbOrTx, row: LabelRow): Promise<LabelWithUsage> {
  const counts = await usageCounts(db, [row.id]);
  return LabelWithUsage.parse({ ...toLabel(row), usageCount: counts.get(row.id) ?? 0 });
}

async function findLabel(
  db: DbOrTx,
  projectRow: ProjectRow,
  id: string,
  forUpdate = false,
): Promise<LabelRow> {
  const query = db
    .select()
    .from(label)
    .where(and(eq(label.id, id), eq(label.projectId, projectRow.id)))
    .limit(1);
  const [row] = forUpdate ? await query.for('update') : await query;
  if (!row) throw new NotFound(`Label not found in ${projectRow.key}`);
  return row;
}

/** Every label of the project with its usage count (visible tasks), by name ignoring case. */
export async function listLabels(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof ListLabelsInput>,
): Promise<LabelList> {
  const parsed = parseInput(ListLabelsInput, input);
  const projectRow = await findProjectByKey(db, actor, parsed.project);
  const rows = await db.select().from(label).where(eq(label.projectId, projectRow.id));
  const counts = await usageCounts(
    db,
    rows.map((row) => row.id),
  );
  return LabelList.parse({
    items: rows
      .sort(compareLabelNames)
      .map((row) => ({ ...toLabel(row), usageCount: counts.get(row.id) ?? 0 })),
  });
}

/** Creates an app label. LabelExists when the name is taken ignoring case. */
export async function createLabel(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof CreateLabelInput>,
): Promise<LabelWithUsage> {
  const parsed = parseInput(CreateLabelInput, input);
  return db.transaction(async (tx) => {
    // The project lock keeps the least used hue right when labels are created at once.
    const projectRow = await findProjectByKey(tx, actor, parsed.project, { forUpdate: true });
    authorize(actor, 'task.write', { type: 'project', projectId: projectRow.id });
    const existing = await findLabelsByName(tx, projectRow.id, [parsed.name]);
    if (existing.size > 0) throw labelExists(parsed.name, projectRow);
    const color = parsed.color ?? (await pickLabelColor(tx, projectRow.id));
    try {
      const [row] = await tx
        .insert(label)
        .values({ workspaceId: projectRow.workspaceId, projectId: projectRow.id, name: parsed.name, color })
        .returning();
      if (!row) throw new Error('label insert returned no row');
      return LabelWithUsage.parse({ ...toLabel(row), usageCount: 0 });
    } catch (error) {
      if (isUniqueViolation(error, LABEL_UNIQUE_INDEX)) throw labelExists(parsed.name, projectRow);
      throw error;
    }
  });
}

/**
 * Renames or recolours a label. LabelMirrored for a new name on a label from Backlog.md;
 * LabelExists when the new name belongs to another label. A change of case only is a rename.
 */
export async function updateLabel(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof UpdateLabelInput>,
): Promise<LabelWithUsage> {
  const parsed = parseInput(UpdateLabelInput, input);
  return db.transaction(async (tx) => {
    const projectRow = await findProjectByKey(tx, actor, parsed.project);
    authorize(actor, 'task.write', { type: 'project', projectId: projectRow.id });
    const current = await findLabel(tx, projectRow, parsed.id, true);
    const set: Partial<typeof label.$inferInsert> = {};
    if (parsed.name !== undefined && parsed.name !== current.name) {
      if (current.source === 'backlog') {
        throw new LabelMirrored(
          `${current.name} comes from Backlog.md, so its name can't change here. Rename it in the task files and push. Its colour can change.`,
          { issues: [{ path: 'name', message: 'Labels from Backlog.md keep their name' }] },
        );
      }
      const clash = (await findLabelsByName(tx, projectRow.id, [parsed.name])).get(parsed.name.toLowerCase());
      if (clash && clash.id !== current.id) throw labelExists(parsed.name, projectRow);
      set.name = parsed.name;
    }
    if (parsed.color !== undefined && parsed.color !== current.color) set.color = parsed.color;
    if (Object.keys(set).length === 0) return withUsage(tx, current);
    try {
      const [row] = await tx.update(label).set(set).where(eq(label.id, current.id)).returning();
      if (!row) throw new Error('label update returned no row');
      return withUsage(tx, row);
    } catch (error) {
      if (isUniqueViolation(error, LABEL_UNIQUE_INDEX))
        throw labelExists(parsed.name ?? current.name, projectRow);
      throw error;
    }
  });
}

/**
 * Deletes a label and takes it off every task, without activity rows. Returns how many visible
 * tasks lost it. LabelMirrored for labels from Backlog.md.
 */
export async function deleteLabel(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof DeleteLabelInput>,
): Promise<{ usageCount: number }> {
  const parsed = parseInput(DeleteLabelInput, input);
  return db.transaction(async (tx) => {
    const projectRow = await findProjectByKey(tx, actor, parsed.project);
    authorize(actor, 'task.write', { type: 'project', projectId: projectRow.id });
    const current = await findLabel(tx, projectRow, parsed.id, true);
    if (current.source === 'backlog') {
      throw new LabelMirrored(
        `${current.name} comes from Backlog.md, so it can't be deleted here. Remove it from the task files and push.`,
      );
    }
    const usageCount = (await usageCounts(tx, [current.id])).get(current.id) ?? 0;
    // task_label rows go with the label (on delete cascade).
    await tx.delete(label).where(eq(label.id, current.id));
    return { usageCount };
  });
}
