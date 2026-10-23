// Comments on tasks: Markdown with @mentions, shown inline in the task timeline. Only the author
// edits or deletes, agents included (a responsible human cannot edit their agent's comments).
// Delete is soft: the body becomes null and the timeline shows "Comment deleted by <author>".
// Comments are not task changes: they write no activity and leave task.updated_at alone.
import {
  type Comment,
  CommentList,
  CreateCommentInput,
  DeleteCommentInput,
  formatTaskKey,
  ListCommentsInput,
  MAX_COMMENT_LENGTH,
  UpdateCommentInput,
} from '@pm/contracts';
import { type DbOrTx, schema, type Tx } from '@pm/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { type Actor, authorize } from './authz';
import type { DbContext } from './context';
import { Conflict, Forbidden, Invalid, NotFound, parseInput } from './errors';
import { findTask, loadUsers, userRef } from './internal';
import { mentionedUserIds, resolveMentions } from './mentions';

const { comment, commentMention, project, task } = schema;

export type CommentRow = typeof schema.comment.$inferSelect;

// ---------------------------------------------------------------------------
// Mapping rows to contract shapes
// ---------------------------------------------------------------------------

/**
 * Maps comment rows of one task to the contract shape, resolving authors and mentions in one
 * query. Rows keep their order. Shared with the timeline.
 */
export async function toComments(db: DbOrTx, taskKey: string, rows: CommentRow[]): Promise<Comment[]> {
  const mentions = new Map(rows.map((row) => [row.id, row.body === null ? [] : mentionedUserIds(row.body)]));
  const userIds = new Set<string>();
  for (const row of rows) {
    userIds.add(row.authorId);
    if (row.onBehalfOfId) userIds.add(row.onBehalfOfId);
    for (const id of mentions.get(row.id) ?? []) userIds.add(id);
  }
  const users = await loadUsers(db, userIds);
  const ref = (id: string) => {
    const row = users.get(id);
    return row ? userRef(row) : null;
  };

  return CommentList.parse({
    items: rows.map(
      (row): z.input<typeof Comment> => ({
        id: row.id,
        taskKey,
        // author_id is restrict-on-delete, so the user exists; keep the comment visible regardless.
        author: ref(row.authorId) ?? { id: row.authorId, name: 'Unknown', kind: 'person' },
        onBehalfOf: row.onBehalfOfId ? ref(row.onBehalfOfId) : null,
        body: row.body,
        mentions: (mentions.get(row.id) ?? []).map(ref).filter((user) => user !== null),
        createdAt: row.createdAt,
        editedAt: row.editedAt,
        deletedAt: row.deletedAt,
      }),
    ),
  }).items;
}

async function toComment(db: DbOrTx, taskKey: string, row: CommentRow): Promise<Comment> {
  const [item] = await toComments(db, taskKey, [row]);
  if (!item) throw new Error('comment mapping returned nothing');
  return item;
}

/** The comments of a task, oldest first (ties by id), deleted ones included. */
export async function loadTaskCommentRows(db: DbOrTx, taskId: string): Promise<CommentRow[]> {
  return db
    .select()
    .from(comment)
    .where(eq(comment.taskId, taskId))
    .orderBy(asc(comment.createdAt), asc(comment.id));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Rewrites mentions for the workspace and checks the stored length: writing @email or
 * @agent-name grows the body, and a stored body must still pass CommentBody when sent back.
 */
async function prepareBody(tx: Tx, actor: Actor, body: string) {
  const resolved = await resolveMentions(tx, actor.workspaceId, body);
  if (resolved.body.length > MAX_COMMENT_LENGTH) {
    const message = `Keep comments under ${MAX_COMMENT_LENGTH.toLocaleString('en-US')} characters, mentions included`;
    throw new Invalid(message, { issues: [{ path: 'body', message }] });
  }
  return resolved;
}

async function replaceMentions(tx: Tx, commentId: string, userIds: string[]) {
  await tx.delete(commentMention).where(eq(commentMention.commentId, commentId));
  if (userIds.length > 0) {
    await tx.insert(commentMention).values(userIds.map((userId) => ({ commentId, userId })));
  }
}

/**
 * A comment the actor may change: in the actor's workspace and key scope, with write access to
 * its project, written by the actor and not deleted. Locks the row.
 */
async function findOwnComment(tx: Tx, actor: Actor, id: string, verb: 'edit' | 'delete') {
  const [found] = await tx
    .select({ comment, projectKey: project.key, taskNumber: task.number, keySuffix: task.keySuffix })
    .from(comment)
    .innerJoin(task, eq(task.id, comment.taskId))
    .innerJoin(project, eq(project.id, comment.projectId))
    .where(and(eq(comment.id, id), eq(comment.workspaceId, actor.workspaceId)))
    .limit(1)
    .for('update', { of: comment });
  if (!found) throw new NotFound('Comment not found');
  const resource = { type: 'project', projectId: found.comment.projectId } as const;
  authorize(actor, 'project.read', resource);
  authorize(actor, 'task.write', resource);
  if (found.comment.authorId !== actor.userId) {
    throw new Forbidden(`Only the author can ${verb} this comment`);
  }
  if (found.comment.deletedAt) throw new Conflict('This comment was deleted');
  return { row: found.comment, taskKey: formatTaskKey(found.projectKey, found.taskNumber, found.keySuffix) };
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

/** The comments of a task, oldest first. Deleted comments stay in the list with a null body. */
export async function listComments(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof ListCommentsInput>,
): Promise<CommentList> {
  const { key, project: narrow } = parseInput(ListCommentsInput, input);
  const { project: projectRow, task: taskRow } = await findTask(db, actor, key, { project: narrow });
  const rows = await loadTaskCommentRows(db, taskRow.id);
  return {
    items: await toComments(db, formatTaskKey(projectRow.key, taskRow.number, taskRow.keySuffix), rows),
  };
}

/** Comments on a task as the actor (for agents, on behalf of their responsible human). */
export async function createComment(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof CreateCommentInput>,
): Promise<Comment> {
  const parsed = parseInput(CreateCommentInput, input);
  return db.transaction(async (tx) => {
    const { project: projectRow, task: taskRow } = await findTask(tx, actor, parsed.key, {
      project: parsed.project,
    });
    authorize(actor, 'task.write', { type: 'project', projectId: projectRow.id });
    const { body, userIds } = await prepareBody(tx, actor, parsed.body);
    const [row] = await tx
      .insert(comment)
      .values({
        workspaceId: actor.workspaceId,
        projectId: projectRow.id,
        taskId: taskRow.id,
        authorId: actor.userId,
        onBehalfOfId: actor.onBehalfOfId,
        body,
      })
      .returning();
    if (!row) throw new Error('comment insert returned no row');
    await replaceMentions(tx, row.id, userIds);
    return toComment(tx, formatTaskKey(projectRow.key, taskRow.number, taskRow.keySuffix), row);
  });
}

/**
 * Replaces the body of the actor's own comment and its mentions. Forbidden for anyone but the
 * author; Conflict once deleted. An unchanged body is not marked as edited.
 */
export async function updateComment(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof UpdateCommentInput>,
): Promise<Comment> {
  const parsed = parseInput(UpdateCommentInput, input);
  return db.transaction(async (tx) => {
    const { row: current, taskKey } = await findOwnComment(tx, actor, parsed.id, 'edit');
    const { body, userIds } = await prepareBody(tx, actor, parsed.body);
    if (body === current.body) return toComment(tx, taskKey, current);
    const [row] = await tx
      .update(comment)
      .set({ body, editedAt: sql`now()` })
      .where(eq(comment.id, current.id))
      .returning();
    if (!row) throw new Error('comment update returned no row');
    await replaceMentions(tx, row.id, userIds);
    return toComment(tx, taskKey, row);
  });
}

/**
 * Soft-deletes the actor's own comment: the body and mentions go, the entry stays in the timeline.
 * Forbidden for anyone but the author; Conflict when already deleted.
 */
export async function deleteComment(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof DeleteCommentInput>,
): Promise<Comment> {
  const parsed = parseInput(DeleteCommentInput, input);
  return db.transaction(async (tx) => {
    const { row: current, taskKey } = await findOwnComment(tx, actor, parsed.id, 'delete');
    const [row] = await tx
      .update(comment)
      .set({ body: null, deletedAt: sql`now()` })
      .where(eq(comment.id, current.id))
      .returning();
    if (!row) throw new Error('comment delete returned no row');
    await replaceMentions(tx, row.id, []);
    return toComment(tx, taskKey, row);
  });
}
