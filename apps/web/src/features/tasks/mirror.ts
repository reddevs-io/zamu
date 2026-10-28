import { ORPCError } from '@orpc/client';
import {
  type Activity,
  type MilestoneRef,
  type MilestoneWithProgress,
  type MirroredProblemExtensions,
  type ProjectActivity,
  type ProjectBacklogSummary,
  parseBacklogId,
  type Task,
  type TaskListItem,
  type TaskOwnedField,
} from '@pm/contracts';
import { findCheckboxes } from './format';

// Mirrored tasks (M3): which fields Backlog.md owns, the owned-field note's copy, the description
// summary, and the history sentences for Backlog.md and project-level entries.

/** What the screens need to know about a task's Backlog.md origin. */
export interface MirrorInfo {
  /** Owned fields locked right now (empty for native tasks and after detach). */
  locked: ReadonlySet<TaskOwnedField>;
  /** Canonical Backlog.md id (BACK-786.1); null for native tasks. */
  backlogId: string | null;
  /** The project still mirrors: owned fields are locked. */
  isMirrored: boolean;
  /** Came from Backlog.md but nothing is locked any more: detached, or imported. */
  isDetached: boolean;
  /** The task's file is gone from the default branch. */
  isHidden: boolean;
}

export function mirrorOf(task: Task | TaskListItem | undefined): MirrorInfo {
  const locked = new Set<TaskOwnedField>(task?.locked ?? []);
  const backlogId =
    (task && 'backlog' in task ? task.backlog?.id : undefined) ??
    (task && 'backlogId' in task ? task.backlogId : undefined) ??
    null;
  return {
    locked,
    backlogId,
    isMirrored: locked.size > 0,
    isDetached: backlogId != null && locked.size === 0,
    isHidden: task?.hidden === true,
  };
}

/** Caption of each owned field, as in the property grid. */
export const OWNED_FIELD_LABELS: Record<TaskOwnedField, string> = {
  title: 'Title',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
  milestone: 'Milestone',
  createdAt: 'Created',
};

/** Where the value lives in the task file: a frontmatter key, or the Description section. */
export const OWNED_FIELD_SOURCE: Record<TaskOwnedField, string> = {
  title: 'title:',
  description: '## Description',
  status: 'status:',
  priority: 'priority:',
  assignee: 'assignee:',
  milestone: 'milestone:',
  createdAt: 'created_date:',
};

/**
 * A value as one shell word for an example command: bare when plain, else double-quoted (the same rule
 * as core's hints).
 */
export function shellWord(value: string): string {
  if (/^[A-Za-z0-9@%+=:,./_-]+$/.test(value)) return value;
  return `"${value.replace(/["\\$`]/g, (char) => `\\${char}`)}"`;
}

/** "786.1" for BACK-786.1: the form `backlog task edit` takes. */
export function backlogCliId(backlogId: string): string {
  const parts = parseBacklogId(backlogId);
  if (!parts) return backlogId;
  return parts.suffix ? `${parts.number}.${parts.suffix}` : String(parts.number);
}

/**
 * An example `backlog task edit` command that changes `field`, or null when Backlog.md's CLI has no
 * flag for it (created_date). Drafts use `backlog draft edit`.
 */
export function editExample(
  task: Pick<Task, 'status' | 'priority' | 'milestone' | 'backlog'>,
  field: TaskOwnedField,
  milestones?: readonly MilestoneWithProgress[],
): string | null {
  const backlog = task.backlog;
  if (!backlog) return null;
  const command = `backlog ${backlog.data.kind === 'draft' ? 'draft' : 'task'} edit ${backlogCliId(backlog.id)}`;
  switch (field) {
    case 'status':
      return `${command} -s ${shellWord(task.status === 'done' ? 'In Progress' : 'Done')}`;
    case 'priority':
      return `${command} --priority ${task.priority === 'high' ? 'medium' : 'high'}`;
    case 'assignee':
      return `${command} -a @name`;
    case 'milestone': {
      const current = milestoneBacklogId(task.milestone, milestones);
      const other = milestones?.find((item) => item.backlogId && item.id !== task.milestone?.id)?.backlogId;
      return `${command} -m ${shellWord(other ?? current ?? 'm-1')}`;
    }
    case 'title':
      return `${command} -t "New title"`;
    case 'description':
      return `${command} -d "New description"`;
    case 'createdAt':
      return null;
  }
}

/** The Backlog.md id of a task's milestone (m-3), when the milestone list has it. */
export function milestoneBacklogId(
  milestone: MilestoneRef | null,
  milestones: readonly MilestoneWithProgress[] | undefined,
): string | null {
  if (!milestone) return null;
  return milestones?.find((item) => item.id === milestone.id)?.backlogId ?? null;
}

/** The field, file and hint of a TASK_MIRRORED answer; null for any other error. */
export function mirroredProblem(
  error: unknown,
): (MirroredProblemExtensions & { field: TaskOwnedField; message: string }) | null {
  if (!(error instanceof ORPCError) || error.code !== 'TASK_MIRRORED') return null;
  const data = (error.data ?? {}) as MirroredProblemExtensions;
  const field = data.field as TaskOwnedField | undefined;
  if (!field || !(field in OWNED_FIELD_LABELS)) return null;
  return { ...data, field, message: error.message };
}

// ---------------------------------------------------------------------------
// Description built from Backlog.md sections
// ---------------------------------------------------------------------------

/** Number of Backlog.md sections in a rendered description: the leading text plus each ## heading. */
export function countSections(source: string | null | undefined): number {
  if (!source?.trim()) return 0;
  let count = 0;
  let fence: string | null = null;
  let sawText = false;
  for (const line of source.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0] ?? null;
      else if (marker[0] === fence) fence = null;
      if (count === 0) sawText = true;
      continue;
    }
    if (fence === null && /^## \S/.test(line)) {
      count++;
      continue;
    }
    if (count === 0 && line.trim()) sawText = true;
  }
  return count + (sawText ? 1 : 0);
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "7 sections from Backlog.md, 3 of 6 checklist items done" (folded description note). */
export function describeMirroredDescription(source: string | null | undefined): string {
  const sections = countSections(source);
  if (!sections) return 'empty in the file';
  const checks = findCheckboxes(source);
  const parts = [`${plural(sections, 'section')} from Backlog.md`];
  if (checks.length) {
    const done = checks.filter((item) => item.checked).length;
    parts.push(`${done} of ${plural(checks.length, 'checklist item')} done`);
  }
  return parts.join(', ');
}

/** "built from 7 Backlog.md sections" (open description note). */
export function describeBuiltFrom(source: string | null | undefined): string {
  const sections = countSections(source);
  return `built from ${sections} Backlog.md ${sections === 1 ? 'section' : 'sections'}`;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** Names of the Backlog.md-only fields a refresh changed, as Activity.backlogFields lists them. */
const BACKLOG_FIELD_NAMES: Record<string, string> = {
  labels: 'the labels',
  dependencies: 'the dependencies',
  parentId: 'the parent task',
  subtasks: 'the subtasks',
  dueDate: 'the due date',
  type: 'the type',
  references: 'the references',
  documentation: 'the documentation links',
  modifiedFiles: 'the modified files',
  reporter: 'the reporter',
  assignees: 'the assignees',
  createdAt: 'the created date',
  createdDate: 'the created date',
  updatedDate: 'the updated date',
  ordinal: 'the ordinal',
  other: 'other fields',
  kind: 'the folder',
  status: 'the status',
  priority: 'the priority',
  milestone: 'the milestone',
  key: 'the key',
  id: 'the Backlog.md ID',
};

/** "changed the labels and the due date" for the fields only the Backlog.md block holds. */
export function describeBacklogFields(fields: readonly string[] | undefined): string | null {
  // updatedDate changes on nearly every edit; it says nothing on its own.
  const names = [
    ...new Set(
      (fields ?? []).filter((field) => field !== 'updatedDate').map((f) => BACKLOG_FIELD_NAMES[f] ?? f),
    ),
  ];
  if (!names.length) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `changed ${list}`;
}

/** "hid the task: its file is gone from main", "brought the task back: its file is on main again". */
export function describeVisibilityChange(type: Activity['type'], branch: string | null | undefined) {
  const where = branch ?? 'the default branch';
  if (type === 'task.hidden') return `hid the task: its file is gone from ${where}`;
  if (type === 'task.restored') return `brought the task back: its file is on ${where} again`;
  return null;
}

/** Project-level history entries a task's timeline shows. */
export interface ProjectTimelineEntry {
  id: string;
  kind: 'project';
  entry: ProjectActivity;
  createdAt: string;
}

/**
 * The project-level rows that belong in a task's history: the first read, unless the task arrived in a
 * later one (it has its own "created" entry), and the detach.
 */
export function projectRowsForTask(
  history: readonly ProjectActivity[] | undefined,
  taskItems: readonly { kind: string; type?: string }[],
): ProjectTimelineEntry[] {
  if (!history?.length) return [];
  const arrivedLater = taskItems.some((item) => item.kind === 'activity' && item.type === 'task.created');
  return history
    .filter(
      (entry) =>
        entry.type === 'project.backlog_detached' ||
        (entry.type === 'project.backlog_imported' && !arrivedLater),
    )
    .map((entry) => ({ id: entry.id, kind: 'project', entry, createdAt: entry.createdAt }));
}

/** "imported the task with 411 others", "detached Payments from Backlog.md. Every field is editable now." */
export function describeProjectEntry(entry: ProjectActivity, projectName: string): string {
  if (entry.type === 'project.backlog_detached') {
    return `detached ${projectName} from Backlog.md. Every field is editable now.`;
  }
  const others = (entry.details.tasks ?? 1) - 1;
  return others > 0
    ? `imported the task with ${others} ${others === 1 ? 'other' : 'others'}`
    : 'imported the task';
}

/** Short commit hash: a1b2c3d. */
export const shortCommit = (commit: string) => commit.slice(0, 7);

/** The comment box placeholder for a task from Backlog.md (frames 5a and 5i); undefined keeps the default. */
export function commentPlaceholder(mirror: MirrorInfo): string | undefined {
  if (mirror.isHidden) return 'Comments still work on hidden tasks.';
  if (mirror.isMirrored) return 'Comment here. Comments stay in this app and never go to the file.';
  return undefined;
}

/** "Was mirrored from" or "Was imported from", after the mirror ended. */
export function detachedLead(summary: ProjectBacklogSummary | null | undefined): string {
  return summary?.mode === 'import' ? 'Was imported from' : 'Was mirrored from';
}
