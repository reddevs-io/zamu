// The refresh planner: turns the files of a Backlog.md folder at one commit, the mappings and the
// project's current rows into a diff (creates, updates with changed fields, hides, restores,
// milestone changes, file rows, problems, counts). Pure: no database, no I/O, no clock (the caller
// passes `now`). Preview and refresh both run it, so a preview shows what the first read writes.
// Rules: M3 plan, section 5 "Task keys", "Field mapping" and "Refresh".
import {
  type BacklogConfig,
  type BacklogMilestone,
  type BacklogTask,
  legacyConfigMilestones,
  matchMilestone,
  type ParseResult,
  type ParseWarning,
  renderDescription,
} from '@pm/backlog-md';
import {
  BacklogBlock,
  type BacklogConfigSummary,
  type BacklogMappings,
  type BacklogPreview,
  type BacklogPreviewRow,
  type BacklogProblem,
  type BacklogTaskKind,
  formatTaskKey,
  isOpenStatus,
  type MilestoneStatus,
  PRIORITY_LABELS,
  type Priority,
  parseBacklogId,
  priorityFromValue,
  priorityToValue,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from '@pm/contracts';
import type { z } from 'zod';
import { emptySeenValues, MappingIndex, type SeenValues, valueKey } from './mappings';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type TaskFileKind = 'task' | 'draft' | 'archived';
export type MilestoneFileKind = 'milestone' | 'archived_milestone';
export type ContentFileKind = TaskFileKind | MilestoneFileKind;

/** A task row of the project as the planner needs it. */
export interface ExistingTask {
  id: string;
  number: number;
  keySuffix: string | null;
  backlogId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  /** 0 to 4. */
  priority: number;
  assigneeId: string | null;
  milestoneId: string | null;
  createdAt: Date;
  backlogData: Record<string, unknown> | null;
  hiddenAt: Date | null;
}

export interface ExistingMilestone {
  id: string;
  backlogId: string | null;
  name: string;
  description: string | null;
  targetDate: string | null;
  status: MilestoneStatus;
  completedAt: Date | null;
  hiddenAt: Date | null;
}

/** A backlog_file row of the previous read. */
export interface ExistingFile {
  path: string;
  blobSha: string;
  kind: ContentFileKind | 'config';
  backlogId: string | null;
  taskId: string | null;
  milestoneId: string | null;
  error: string | null;
}

/**
 * One file under the folder. `read`: downloaded and parsed now. `unchanged`: same blob as the last
 * read and linked to a row, so the planner takes its content from that row (the reader only marks a
 * file unchanged when the linked row exists).
 */
export type PlanFile =
  | { path: string; blobSha: string; kind: TaskFileKind; read: ParseResult<BacklogTask> }
  | { path: string; blobSha: string; kind: MilestoneFileKind; read: ParseResult<BacklogMilestone> }
  | { path: string; blobSha: string; kind: ContentFileKind; unchanged: ExistingFile };

export interface PlanInput {
  /** The app project key, for sample keys. */
  projectKey: string;
  /** The Backlog.md folder (backlog, .backlog, planning). */
  folder: string;
  commit: string;
  now: Date;
  config: BacklogConfig;
  /** The config file read (folder config.yml or root backlog.config.yml); null when none. */
  configFile: { path: string; blobSha: string } | null;
  /** Every task, draft, archived and milestone file under the folder. */
  files: PlanFile[];
  mappings: BacklogMappings;
  /** Current workspace members; mapped users outside it count as no one. Null: no check (preview). */
  memberIds: Set<string> | null;
  existing: ExistingState;
}

export interface ExistingState {
  tasks: ExistingTask[];
  milestones: ExistingMilestone[];
  files: ExistingFile[];
  /** project.next_task_number. */
  nextTaskNumber: number;
  /** No successful read yet: the apply writes one project row instead of per-task activity. */
  firstRead: boolean;
  /** File warnings of the last read, carried for unchanged files. */
  problems: BacklogProblem[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** A milestone a task points at: an existing row, or one this plan creates (by Backlog.md id). */
export type MilestoneTarget = { id: string } | { backlogId: string };

/** task.backlog_data as stored: BacklogBlock input with JSON values only. */
export type StoredBlock = z.input<typeof BacklogBlock>;

export interface TaskValues {
  number: number;
  keySuffix: string | null;
  backlogId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  /** 0 to 4. */
  priority: number;
  assigneeId: string | null;
  milestone: MilestoneTarget | null;
  createdAt: Date;
  backlogData: StoredBlock;
}

export interface TaskCreate extends TaskValues {
  /** From ordinal, set only here: later reads never touch rank. */
  rank: number;
  path: string;
  kind: TaskFileKind;
}

/** A change for task.updated activity. Milestones may point at rows created by the same plan. */
export type PlannedChange =
  | { field: 'title' | 'description'; from: string | null; to: string | null }
  | { field: 'status'; from: TaskStatus; to: TaskStatus }
  | { field: 'priority'; from: Priority; to: Priority }
  | { field: 'assignee'; from: string | null; to: string | null }
  | { field: 'milestone'; from: string | null; to: MilestoneTarget | null }
  | { field: 'backlog'; from: null; to: string[] };

export interface TaskUpdate {
  id: string;
  set: Partial<TaskValues>;
  changes: PlannedChange[];
  /** The file is back: clear hidden_at, write task.restored. */
  restore: boolean;
}

export interface MilestoneValues {
  backlogId: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  status: MilestoneStatus;
  completedAt: Date | null;
}

export interface MilestoneUpdate {
  id: string;
  set: Partial<MilestoneValues>;
  restore: boolean;
}

/** A backlog_file row to store. */
export interface FileRow {
  path: string;
  blobSha: string;
  kind: ContentFileKind | 'config';
  backlogId: string | null;
  task: { id: string } | { backlogId: string } | null;
  milestone: MilestoneTarget | null;
  error: string | null;
}

export type PreviewCounts = BacklogPreview['counts'];

export interface BacklogPlan {
  commit: string;
  folder: string;
  config: BacklogConfigSummary;
  firstRead: boolean;
  tasks: { creates: TaskCreate[]; updates: TaskUpdate[]; hides: { id: string }[] };
  milestones: { creates: MilestoneValues[]; updates: MilestoneUpdate[]; hides: { id: string }[] };
  files: FileRow[];
  /** Files first (by path), then values. Skipped files have `skipped: true`. */
  problems: BacklogProblem[];
  counts: PreviewCounts;
  /** The first rows in Backlog.md order. */
  sample: BacklogPreviewRow[];
  nextTaskNumber: number;
  /** Values seen (drafts' statuses left out), for mapping views. */
  seen: SeenValues;
}

/** Rows in the preview sample. */
export const SAMPLE_SIZE = 8;

/** Rank base for tasks without an ordinal: after every ordinal Backlog.md writes, in id order. */
const NO_ORDINAL_RANK = 1e9;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parser warnings that become file problems. A missing status is normal (Backlog.md's default applies). */
const REPORTED_WARNINGS = new Set<ParseWarning['code']>([
  'unreadable_date',
  'invalid_due_date',
  'missing_title',
  'id_mismatch',
  'ignored_value',
  'malformed_markers',
]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** JSON with object keys sorted, for comparing blocks read back from jsonb (which reorders keys). */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>).sort(([a], [b]) => compareText(a, b)),
      );
    }
    return item;
  });
}

/** Plain JSON: Dates (js-yaml reads timestamps as Dates) become ISO strings. */
function toJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function keyOf(number: number, suffix: string | null): string {
  return suffix ? `${number}.${suffix}` : String(number);
}

/** Compares suffixes part by part: 1 < 1.2 < 2 < 10. */
function compareSuffix(left: string | null, right: string | null): number {
  const a = left ? left.split('.').map(Number) : [];
  const b = right ? right.split('.').map(Number) : [];
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const x = a[index] ?? -1;
    const y = b[index] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Fallback rank: after all ordinals, in Backlog.md id order. */
function fallbackRank(number: number, suffix: string | null): number {
  let rank = NO_ORDINAL_RANK + number;
  let scale = 1;
  for (const part of suffix ? suffix.split('.').map(Number) : []) {
    scale /= 100_000;
    rank += part * scale;
  }
  return rank;
}

/** The Backlog.md id of a file name like "back-12.1 - Title.md", canonical, or null. */
export function idFromFileName(path: string): string | null {
  const name = path.split('/').at(-1) ?? '';
  const match = /^([A-Za-z]+-[0-9]+(?:\.[0-9]+)*)(?: - |\.md$)/.exec(name);
  const parts = match ? parseBacklogId(match[1] as string) : null;
  return parts ? formatTaskKey(parts.prefix, parts.number, parts.suffix) : null;
}

function milestoneName(title: string, id: string): string {
  const name = title.trim() || id;
  return name.length > 100 ? `${name.slice(0, 99)}…` : name;
}

function emptyCounts(): PreviewCounts {
  return {
    tasks: 0,
    open: 0,
    drafts: 0,
    archived: 0,
    completed: 0,
    subtasks: 0,
    milestones: 0,
    archivedMilestones: 0,
  };
}

/** The config summary stored on the source and shown in detection. */
export function configSummary(config: BacklogConfig): BacklogConfigSummary {
  return {
    projectName: config.projectName,
    taskPrefix: config.taskPrefix,
    statuses: config.statuses,
    defaultStatus: config.defaultStatus,
    priorities: config.priorities ?? ['high', 'medium', 'low'],
    labels: config.labels,
    milestones: config.legacyMilestones,
    zeroPaddedIds: config.zeroPaddedIds,
  };
}

// ---------------------------------------------------------------------------
// Snapshots: one shape for files read now and files taken from their rows
// ---------------------------------------------------------------------------

interface TaskSnapshot {
  path: string;
  kind: TaskFileKind;
  /** Canonical Backlog.md id. */
  backlogId: string;
  /** Number and suffix of the Backlog.md id (the draft number for drafts). */
  idNumber: number;
  suffix: string | null;
  title: string;
  description: string | null;
  /** Null: missing or unreadable; the task keeps (or gets) the first read's time. */
  createdAt: Date | null;
  createdDate: string | null;
  updatedDate: Date | null;
  ordinal: number | null;
  raw: { status: string | null; priority: string | null; milestone: string | null; assignees: string[] };
  /** Block fields that need no mapping. */
  rest: {
    reporter: string | null;
    labels: string[];
    dependencies: string[];
    parentId: string | null;
    subtasks: string[];
    dueDate: string | null;
    type: string | null;
    references: string[];
    documentation: string[];
    modifiedFiles: string[];
    other: Record<string, unknown>;
  };
  /** The row this snapshot was taken from (unchanged files). */
  from: ExistingTask | null;
}

interface MilestoneSnapshot {
  path: string | null;
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  archived: boolean;
}

function snapshotFromTask(task: BacklogTask, kind: TaskFileKind): TaskSnapshot {
  const other: Record<string, unknown> = { ...task.unknown };
  if (task.project !== null) other.project = task.project;
  if (task.onStatusChange !== null) other.onStatusChange = task.onStatusChange;
  const description = renderDescription(task);
  return {
    path: task.path,
    kind,
    backlogId: task.id.id,
    idNumber: task.id.number,
    suffix: task.id.suffix,
    title: task.title,
    description: description === '' ? null : description,
    createdAt: task.createdDate,
    createdDate: task.createdDate ? task.createdDate.toISOString() : null,
    updatedDate: task.updatedDate,
    ordinal: task.ordinal,
    raw: {
      status: task.status,
      priority: task.priority,
      milestone: task.milestone,
      assignees: task.assignees,
    },
    rest: {
      reporter: task.reporter,
      labels: task.labels,
      dependencies: task.dependencies,
      parentId: task.parentId,
      subtasks: task.subtasks,
      dueDate: task.dueDate,
      type: task.type,
      references: task.references,
      documentation: task.documentation,
      modifiedFiles: task.modifiedFiles,
      other: toJson(other),
    },
    from: null,
  };
}

/** Reads a stored block back; null when it does not parse (the reader then downloads the file). */
export function readStoredBlock(data: Record<string, unknown> | null): BacklogBlock | null {
  if (!data) return null;
  const parsed = BacklogBlock.safeParse(data);
  return parsed.success ? parsed.data : null;
}

function snapshotFromRow(row: ExistingTask, path: string, kind: TaskFileKind): TaskSnapshot | null {
  const block = readStoredBlock(row.backlogData);
  const parts = row.backlogId ? parseBacklogId(row.backlogId) : null;
  if (!block || !parts || !row.backlogId) return null;
  // Parent and subtasks in the block are derived from the whole read and derived again here.
  return {
    path,
    kind,
    backlogId: row.backlogId,
    idNumber: parts.number,
    suffix: parts.suffix,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt,
    createdDate: block.createdDate,
    updatedDate: block.updatedDate ? new Date(block.updatedDate) : null,
    ordinal: block.ordinal,
    raw: {
      status: block.status,
      priority: block.priority,
      milestone: block.milestone,
      assignees: block.assignees.map((entry) => entry.value),
    },
    rest: {
      reporter: block.reporter,
      labels: block.labels,
      dependencies: block.dependencies,
      parentId: block.parentId,
      subtasks: block.subtasks,
      dueDate: block.dueDate,
      type: block.type,
      references: block.references,
      documentation: block.documentation,
      modifiedFiles: block.modifiedFiles,
      other: block.other,
    },
    from: row,
  };
}

// ---------------------------------------------------------------------------
// The planner
// ---------------------------------------------------------------------------

/** Plans a refresh. See the file comment. */
export function planRefresh(input: PlanInput): BacklogPlan {
  const { existing, now } = input;
  const mapping = new MappingIndex(input.mappings, input.memberIds);
  const seen = emptySeenValues();
  for (const status of input.config.statuses) seen.status.declare(status);
  for (const priority of input.config.priorities ?? ['high', 'medium', 'low'])
    seen.priority.declare(priority);

  const fileProblems: BacklogProblem[] = [];
  const fileRows: FileRow[] = [];
  const fileProblem = (path: string, backlogId: string | null, skipped: boolean, message: string) =>
    fileProblems.push({ kind: 'file', path, backlogId, skipped, message });

  const existingFileByPath = new Map(existing.files.map((file) => [file.path, file]));
  const existingTaskById = new Map(existing.tasks.map((task) => [task.id, task]));
  const existingMilestoneById = new Map(existing.milestones.map((row) => [row.id, row]));
  const previousWarnings = new Map<string, BacklogProblem[]>();
  for (const problem of existing.problems) {
    if (problem.kind !== 'file' || problem.skipped) continue;
    const list = previousWarnings.get(problem.path) ?? [];
    list.push(problem);
    previousWarnings.set(problem.path, list);
  }
  const existingByBacklogId = new Map<string, ExistingTask>();
  for (const task of existing.tasks) if (task.backlogId) existingByBacklogId.set(task.backlogId, task);

  if (input.configFile) {
    fileRows.push({
      ...input.configFile,
      kind: 'config',
      backlogId: null,
      task: null,
      milestone: null,
      error: null,
    });
  }

  // 1. Snapshots, errors and kept-alive rows ------------------------------------------------
  const taskSnapshots: TaskSnapshot[] = [];
  const milestoneSnapshots: MilestoneSnapshot[] = [];
  const keptAlive = new Set<string>();
  const snapshotRow = new Map<TaskSnapshot, FileRow>();
  const milestoneRow = new Map<MilestoneSnapshot, FileRow>();

  const skip = (
    file: { path: string; blobSha: string; kind: ContentFileKind },
    message: string,
    id?: string,
  ) => {
    const nameId = id ?? idFromFileName(file.path);
    const previous = existingFileByPath.get(file.path);
    let task: FileRow['task'] = null;
    let milestone: FileRow['milestone'] = null;
    // The task keeps its last good version: linked through the previous row of this path, or by
    // the id in the file name.
    if (file.kind === 'milestone' || file.kind === 'archived_milestone') {
      if (previous?.milestoneId && existingMilestoneById.has(previous.milestoneId)) {
        milestone = { id: previous.milestoneId };
      }
    } else {
      const kept =
        (previous?.taskId ? existingTaskById.get(previous.taskId) : undefined) ??
        (nameId ? existingByBacklogId.get(nameId) : undefined);
      if (kept) {
        keptAlive.add(kept.id);
        task = { id: kept.id };
      }
    }
    fileProblem(file.path, nameId ?? previous?.backlogId ?? null, true, message);
    fileRows.push({
      path: file.path,
      blobSha: file.blobSha,
      kind: file.kind,
      backlogId: nameId ?? previous?.backlogId ?? null,
      task,
      milestone,
      error: message,
    });
  };

  for (const file of input.files) {
    if ('unchanged' in file) {
      const previous = file.unchanged;
      for (const warning of previousWarnings.get(file.path) ?? []) fileProblems.push(warning);
      if (file.kind === 'milestone' || file.kind === 'archived_milestone') {
        const row = previous.milestoneId ? existingMilestoneById.get(previous.milestoneId) : undefined;
        if (!row?.backlogId) throw new Error(`unchanged milestone file without its row: ${file.path}`);
        const snapshot: MilestoneSnapshot = {
          path: file.path,
          id: row.backlogId,
          title: row.name,
          description: row.description,
          dueDate: row.targetDate,
          archived: file.kind === 'archived_milestone',
        };
        milestoneSnapshots.push(snapshot);
        milestoneRow.set(snapshot, fileRowFor(file, row.backlogId));
      } else {
        const row = previous.taskId ? existingTaskById.get(previous.taskId) : undefined;
        const snapshot = row ? snapshotFromRow(row, file.path, file.kind) : null;
        if (!snapshot) throw new Error(`unchanged task file without a readable row: ${file.path}`);
        taskSnapshots.push(snapshot);
        snapshotRow.set(snapshot, fileRowFor(file, snapshot.backlogId));
      }
      continue;
    }

    if (!file.read.ok) {
      skip(file, file.read.error.message);
      continue;
    }
    const warnings = file.read.warnings.filter((warning) => REPORTED_WARNINGS.has(warning.code));
    if (file.kind === 'milestone' || file.kind === 'archived_milestone') {
      const value = file.read.value as BacklogMilestone;
      for (const warning of warnings) fileProblem(file.path, value.id, false, warning.message);
      const snapshot: MilestoneSnapshot = {
        path: file.path,
        id: value.id,
        title: value.title,
        description: value.description,
        dueDate: value.dueDate,
        archived: file.kind === 'archived_milestone',
      };
      milestoneSnapshots.push(snapshot);
      milestoneRow.set(snapshot, fileRowFor(file, value.id));
      continue;
    }
    const value = file.read.value as BacklogTask;
    // Backlog.md accepts ids the app cannot key (TASK-0, very long numbers); skip those.
    const parts = parseBacklogId(value.id.id);
    if (!parts) {
      skip(
        file,
        `id ${value.id.id} cannot become a task key (numbers start at 1 and have at most 10 digits)`,
        value.id.id,
      );
      continue;
    }
    for (const warning of warnings) fileProblem(file.path, value.id.id, false, warning.message);
    const snapshot = snapshotFromTask(value, file.kind);
    taskSnapshots.push(snapshot);
    snapshotRow.set(snapshot, fileRowFor(file, snapshot.backlogId));
  }

  function fileRowFor(
    file: { path: string; blobSha: string; kind: ContentFileKind },
    backlogId: string,
  ): FileRow {
    const row: FileRow = {
      path: file.path,
      blobSha: file.blobSha,
      kind: file.kind,
      backlogId,
      task: null,
      milestone: null,
      error: null,
    };
    fileRows.push(row);
    return row;
  }

  // 2. Milestones ----------------------------------------------------------------------------
  const hasMilestoneFiles = input.files.some(
    (file) => file.kind === 'milestone' || file.kind === 'archived_milestone',
  );
  if (!hasMilestoneFiles) {
    for (const legacy of legacyConfigMilestones(input.config)) {
      milestoneSnapshots.push({
        path: null,
        id: legacy.id,
        title: legacy.title,
        description: legacy.description,
        dueDate: legacy.dueDate,
        archived: false,
      });
    }
  }
  const milestoneWinners = new Map<string, MilestoneSnapshot>();
  for (const snapshot of milestoneSnapshots) {
    const winner = milestoneWinners.get(snapshot.id);
    if (!winner) {
      milestoneWinners.set(snapshot.id, snapshot);
      continue;
    }
    const row = milestoneRow.get(snapshot);
    const message = `Duplicate milestone id ${snapshot.id}: ${winner.path ?? 'config.yml'} is used instead`;
    if (snapshot.path) fileProblem(snapshot.path, snapshot.id, true, message);
    if (row) row.error = message;
  }
  const candidates = [...milestoneWinners.values()].map((snapshot) => ({
    id: snapshot.id,
    title: snapshot.title,
    archived: snapshot.archived,
  }));
  const existingMilestoneByBacklogId = new Map<string, ExistingMilestone>();
  for (const row of existing.milestones)
    if (row.backlogId) existingMilestoneByBacklogId.set(row.backlogId, row);
  const milestoneTarget = (backlogId: string): MilestoneTarget => {
    const row = existingMilestoneByBacklogId.get(backlogId);
    return row ? { id: row.id } : { backlogId };
  };
  for (const [snapshot, row] of milestoneRow) {
    if (row.error === null) row.milestone = milestoneTarget(snapshot.id);
  }

  // 3. Task identity: duplicates and draft numbers ------------------------------------------
  const winners = new Map<string, TaskSnapshot>();
  const drafts: TaskSnapshot[] = [];
  const draftIds = new Map<string, TaskSnapshot>();
  const loseTo = (loser: TaskSnapshot, winner: TaskSnapshot) => {
    const message = `Duplicate id ${loser.backlogId}: ${winner.path} is used instead`;
    fileProblem(loser.path, loser.backlogId, true, message);
    const row = snapshotRow.get(loser);
    if (row) row.error = message;
  };
  const newer = (a: TaskSnapshot, b: TaskSnapshot) => {
    const x = a.updatedDate?.getTime() ?? Number.NEGATIVE_INFINITY;
    const y = b.updatedDate?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (x !== y) return x > y;
    return compareText(a.path, b.path) < 0;
  };
  for (const snapshot of taskSnapshots) {
    if (snapshot.kind === 'draft') {
      const other = draftIds.get(snapshot.backlogId);
      if (!other) {
        draftIds.set(snapshot.backlogId, snapshot);
        continue;
      }
      const [keep, lose] = newer(snapshot, other) ? [snapshot, other] : [other, snapshot];
      draftIds.set(snapshot.backlogId, keep);
      loseTo(lose, keep);
      continue;
    }
    const key = keyOf(snapshot.idNumber, snapshot.suffix);
    const other = winners.get(key);
    if (!other) {
      winners.set(key, snapshot);
      continue;
    }
    const [keep, lose] = newer(snapshot, other) ? [snapshot, other] : [other, snapshot];
    winners.set(key, keep);
    loseTo(lose, keep);
  }
  drafts.push(...[...draftIds.values()].sort((a, b) => compareText(a.path, b.path)));

  // Match snapshots to existing rows: by Backlog.md id, then (tasks only) by key.
  const used = new Set<string>();
  const matchOf = new Map<TaskSnapshot, ExistingTask>();
  const existingByKey = new Map<string, ExistingTask>();
  for (const task of existing.tasks) {
    if (task.backlogId && !task.backlogId.startsWith('DRAFT-')) {
      existingByKey.set(keyOf(task.number, task.keySuffix), task);
    }
  }
  const all = [...winners.values(), ...drafts];
  for (const snapshot of all) {
    const row = existingByBacklogId.get(snapshot.backlogId);
    if (row && !used.has(row.id)) {
      matchOf.set(snapshot, row);
      used.add(row.id);
    }
  }
  for (const snapshot of winners.values()) {
    if (matchOf.has(snapshot)) continue;
    const row = existingByKey.get(keyOf(snapshot.idNumber, snapshot.suffix));
    if (row && !used.has(row.id)) {
      matchOf.set(snapshot, row);
      used.add(row.id);
    }
  }

  // Keys: tasks keep their Backlog.md numbers; drafts get numbers above the highest task number.
  const appKey = new Map<TaskSnapshot, { number: number; suffix: string | null }>();
  const occupied = new Set<number>();
  for (const snapshot of winners.values()) {
    appKey.set(snapshot, { number: snapshot.idNumber, suffix: snapshot.suffix });
    occupied.add(snapshot.idNumber);
  }
  // Rows not matched by a draft keep their numbers (hidden tasks come back with the same key).
  const draftRowIds = new Set(drafts.map((draft) => matchOf.get(draft)?.id).filter(Boolean));
  for (const task of existing.tasks) if (!draftRowIds.has(task.id)) occupied.add(task.number);
  // Drafts by draft number: DRAFT-3 and DRAFT-3.1 share one app number.
  const groups = new Map<number, TaskSnapshot[]>();
  for (const draft of drafts) {
    const group = groups.get(draft.idNumber) ?? [];
    group.push(draft);
    groups.set(draft.idNumber, group);
  }
  const assigned = new Map<number, number>();
  const unassigned: number[] = [];
  const moved = new Map<number, number>();
  for (const [draftNumber, group] of groups) {
    const previous = group.map((draft) => matchOf.get(draft)?.number).find((n) => n !== undefined);
    if (previous !== undefined && !occupied.has(previous)) {
      assigned.set(draftNumber, previous);
      occupied.add(previous);
    } else {
      if (previous !== undefined) moved.set(draftNumber, previous);
      unassigned.push(draftNumber);
    }
  }
  let next = Math.max(existing.nextTaskNumber - 1, 0, ...occupied);
  for (const draftNumber of unassigned) {
    next += 1;
    assigned.set(draftNumber, next);
    occupied.add(next);
  }
  // A draft row nobody matches (its file is gone) gives its number up when a task file takes it.
  const winnerNumbers = new Set([...winners.values()].map((snapshot) => snapshot.idNumber));
  const relocations: TaskUpdate[] = [];
  for (const task of existing.tasks) {
    if (used.has(task.id) || keptAlive.has(task.id) || !task.backlogId?.startsWith('DRAFT-')) continue;
    if (!winnerNumbers.has(task.number)) continue;
    next += 1;
    relocations.push({ id: task.id, set: { number: next }, changes: [], restore: false });
  }
  for (const draft of drafts) {
    const number = assigned.get(draft.idNumber) as number;
    appKey.set(draft, { number, suffix: draft.suffix });
    const from = moved.get(draft.idNumber);
    if (from !== undefined) {
      fileProblem(
        draft.path,
        draft.backlogId,
        false,
        `${draft.backlogId} moved from ${formatTaskKey(input.projectKey, from, draft.suffix)} to ${formatTaskKey(input.projectKey, number, draft.suffix)}: a task file now uses that number`,
      );
    }
  }

  // Parent and subtasks are derived from this read, so they stay right when other files change:
  // the parent is parent_task_id, else the id without its last part (BACK-786.1 -> BACK-786);
  // subtasks are the tasks that name this one as parent.
  const parentOf = (snapshot: TaskSnapshot): string | null => {
    if (snapshot.rest.parentId) return snapshot.rest.parentId;
    if (!snapshot.suffix) return null;
    const parts = snapshot.suffix.split('.');
    const prefix = snapshot.backlogId.slice(0, snapshot.backlogId.indexOf('-'));
    return formatTaskKey(prefix, snapshot.idNumber, parts.slice(0, -1).join('.') || null);
  };
  const childrenOf = new Map<string, Set<string>>();
  for (const snapshot of all) {
    const parent = parentOf(snapshot);
    if (!parent) continue;
    const set = childrenOf.get(parent) ?? new Set<string>();
    set.add(snapshot.backlogId);
    childrenOf.set(parent, set);
  }
  const sortIds = (ids: Iterable<string>) =>
    [...new Set(ids)].sort((a, b) => {
      const x = parseBacklogId(a);
      const y = parseBacklogId(b);
      if (!x || !y) return compareText(a, b);
      return compareText(x.prefix, y.prefix) || x.number - y.number || compareSuffix(x.suffix, y.suffix);
    });

  // 4. Desired values, problems ----------------------------------------------------------------
  const values = new Map<string, Extract<BacklogProblem, { kind: 'value' }>>();
  const valueProblem = (
    field: 'status' | 'priority' | 'assignee' | 'milestone',
    value: string,
    fallback: string | null,
    message: string,
  ) => {
    const key = `${field}:${valueKey(value)}`;
    const entry = values.get(key);
    if (entry) entry.count += 1;
    else values.set(key, { kind: 'value', field, value, count: 1, fallback, message });
  };

  const desired = new Map<TaskSnapshot, TaskValues>();
  for (const snapshot of all) {
    const { raw } = snapshot;
    let status: TaskStatus = 'backlog';
    if (snapshot.kind !== 'draft') {
      if (raw.status) {
        seen.status.add(raw.status);
        const mapped = mapping.status(raw.status);
        status = mapped.value;
        if (mapped.fellBack) {
          valueProblem(
            'status',
            raw.status,
            TASK_STATUS_LABELS[mapped.value],
            `Status "${raw.status}" is not mapped; shown as ${TASK_STATUS_LABELS[mapped.value]}. Map it in Edit mappings.`,
          );
        }
      } else {
        status = 'todo';
      }
    }
    let priority: Priority = 'none';
    if (raw.priority) {
      seen.priority.add(raw.priority);
      const mapped = mapping.priority(raw.priority);
      priority = mapped.value;
      if (mapped.fellBack) {
        valueProblem(
          'priority',
          raw.priority,
          PRIORITY_LABELS[mapped.value],
          `Priority "${raw.priority}" is not mapped; shown as ${PRIORITY_LABELS[mapped.value]}. Map it in Edit mappings.`,
        );
      }
    }
    let assigneeId: string | null = null;
    const assignees = raw.assignees.map((value) => {
      seen.assignee.add(value);
      const mapped = mapping.assignee(value);
      if (mapped.fellBack) {
        valueProblem(
          'assignee',
          value,
          'No one',
          `${value} matches no member; the task stays unassigned and keeps the name in its Backlog.md block.`,
        );
      }
      if (!assigneeId && mapped.value) assigneeId = mapped.value;
      return { value, userId: mapped.value };
    });
    let milestone: MilestoneTarget | null = null;
    if (raw.milestone) {
      const match = matchMilestone(raw.milestone, candidates);
      if (match) milestone = milestoneTarget(match.id);
      else {
        valueProblem(
          'milestone',
          raw.milestone,
          'No milestone',
          `Milestone "${raw.milestone}" matches no milestone file; the task has no milestone.`,
        );
      }
    }

    const key = appKey.get(snapshot) as { number: number; suffix: string | null };
    const row = matchOf.get(snapshot);
    const block: StoredBlock = {
      kind: snapshot.kind as BacklogTaskKind,
      status: raw.status,
      priority: raw.priority,
      milestone: raw.milestone,
      assignees,
      reporter: snapshot.rest.reporter,
      labels: snapshot.rest.labels,
      dependencies: snapshot.rest.dependencies,
      parentId: parentOf(snapshot),
      subtasks: sortIds(childrenOf.get(snapshot.backlogId) ?? []),
      dueDate: snapshot.rest.dueDate,
      type: snapshot.rest.type,
      references: snapshot.rest.references,
      documentation: snapshot.rest.documentation,
      modifiedFiles: snapshot.rest.modifiedFiles,
      createdDate: snapshot.createdDate,
      updatedDate: snapshot.updatedDate ? snapshot.updatedDate.toISOString() : null,
      ordinal: snapshot.ordinal,
      other: snapshot.rest.other,
    };
    desired.set(snapshot, {
      number: key.number,
      keySuffix: key.suffix,
      backlogId: snapshot.backlogId,
      title: snapshot.title,
      description: snapshot.description,
      status,
      priority: priorityToValue(priority),
      assigneeId,
      milestone,
      createdAt: snapshot.createdAt ?? row?.createdAt ?? now,
      backlogData: toJson(block),
    });
  }

  // 5. Task diff ------------------------------------------------------------------------------
  const creates: TaskCreate[] = [];
  const updates: TaskUpdate[] = [];
  const sameTarget = (current: string | null, target: MilestoneTarget | null) =>
    target === null ? current === null : 'id' in target ? target.id === current : false;
  for (const snapshot of all) {
    const want = desired.get(snapshot) as TaskValues;
    const row = matchOf.get(snapshot);
    const fileRow = snapshotRow.get(snapshot);
    if (!row) {
      creates.push({
        ...want,
        rank: snapshot.ordinal ?? fallbackRank(want.number, want.keySuffix),
        path: snapshot.path,
        kind: snapshot.kind,
      });
      if (fileRow) fileRow.task = { backlogId: snapshot.backlogId };
      continue;
    }
    if (fileRow) fileRow.task = { id: row.id };
    const set: Partial<TaskValues> = {};
    const changes: PlannedChange[] = [];
    const backlogFields: string[] = [];
    if (want.title !== row.title) {
      set.title = want.title;
      changes.push({ field: 'title', from: row.title, to: want.title });
    }
    if (want.description !== row.description) {
      set.description = want.description;
      changes.push({ field: 'description', from: row.description, to: want.description });
    }
    if (want.status !== row.status) {
      set.status = want.status;
      changes.push({ field: 'status', from: row.status, to: want.status });
    }
    if (want.priority !== row.priority) {
      set.priority = want.priority;
      changes.push({
        field: 'priority',
        from: priorityFromValue(row.priority),
        to: priorityFromValue(want.priority),
      });
    }
    if (want.assigneeId !== row.assigneeId) {
      set.assigneeId = want.assigneeId;
      changes.push({ field: 'assignee', from: row.assigneeId, to: want.assigneeId });
    }
    if (!sameTarget(row.milestoneId, want.milestone)) {
      set.milestone = want.milestone;
      changes.push({ field: 'milestone', from: row.milestoneId, to: want.milestone });
    }
    if (want.createdAt.getTime() !== row.createdAt.getTime()) {
      set.createdAt = want.createdAt;
      backlogFields.push('createdAt');
    }
    if (want.number !== row.number || want.keySuffix !== row.keySuffix) {
      set.number = want.number;
      set.keySuffix = want.keySuffix;
      backlogFields.push('key');
    }
    if (want.backlogId !== row.backlogId) {
      set.backlogId = want.backlogId;
      backlogFields.push('id');
    }
    const before = readStoredBlock(row.backlogData);
    const after = BacklogBlock.parse(want.backlogData);
    const changedKeys = (Object.keys(after) as (keyof BacklogBlock)[]).filter(
      (key) => !before || stableJson(before[key]) !== stableJson(after[key]),
    );
    if (changedKeys.length > 0 || !row.backlogData) {
      set.backlogData = want.backlogData;
      // Raw values of mapped fields show through their own change; list the block-only ones.
      backlogFields.push(
        ...changedKeys.filter(
          (key) => !['status', 'priority', 'milestone', 'assignees'].includes(key) || !before,
        ),
      );
    }
    if (backlogFields.length > 0)
      changes.push({ field: 'backlog', from: null, to: [...new Set(backlogFields)] });
    const restore = row.hiddenAt !== null;
    if (Object.keys(set).length > 0 || restore) updates.push({ id: row.id, set, changes, restore });
  }
  updates.push(...relocations);
  const hides: { id: string }[] = [];
  for (const task of existing.tasks) {
    if (!task.backlogId || used.has(task.id) || keptAlive.has(task.id) || task.hiddenAt) continue;
    hides.push({ id: task.id });
  }

  // 6. Milestone diff -------------------------------------------------------------------------
  // M2's rule: a Planned milestone turns Active when one of its tasks is in progress or in review.
  const startedMilestones = new Set<string>();
  for (const want of desired.values()) {
    if (want.milestone && (want.status === 'in_progress' || want.status === 'in_review')) {
      startedMilestones.add('id' in want.milestone ? want.milestone.id : want.milestone.backlogId);
    }
  }
  const takenNames = new Set<string>();
  const milestoneUsed = new Set<string>();
  for (const snapshot of milestoneWinners.values()) {
    const row = existingMilestoneByBacklogId.get(snapshot.id);
    if (row) milestoneUsed.add(row.id);
  }
  // Names of rows that stay as they are (native milestones, hidden ones) are taken.
  for (const row of existing.milestones) {
    if (!row.backlogId || !milestoneWinners.has(row.backlogId)) takenNames.add(row.name.toLowerCase());
  }
  const uniqueName = (title: string, id: string) => {
    let name = milestoneName(title, id);
    if (takenNames.has(name.toLowerCase())) name = milestoneName(`${title.trim() || id} (${id})`, id);
    takenNames.add(name.toLowerCase());
    return name;
  };
  const milestoneCreates: MilestoneValues[] = [];
  const milestoneUpdates: MilestoneUpdate[] = [];
  for (const snapshot of milestoneWinners.values()) {
    const row = existingMilestoneByBacklogId.get(snapshot.id);
    const started = startedMilestones.has(row ? row.id : snapshot.id);
    const name = uniqueName(snapshot.title, snapshot.id);
    if (!row) {
      milestoneCreates.push({
        backlogId: snapshot.id,
        name,
        description: snapshot.description,
        targetDate: snapshot.dueDate,
        status: snapshot.archived ? 'completed' : started ? 'active' : 'planned',
        completedAt: snapshot.archived ? now : null,
      });
      continue;
    }
    let status: MilestoneStatus;
    if (snapshot.archived) status = 'completed';
    else if (row.status === 'completed') status = started ? 'active' : 'planned';
    else status = row.status === 'planned' && started ? 'active' : row.status;
    const set: Partial<MilestoneValues> = {};
    if (name !== row.name) set.name = name;
    if (snapshot.description !== row.description) set.description = snapshot.description;
    if (snapshot.dueDate !== row.targetDate) set.targetDate = snapshot.dueDate;
    if (status !== row.status) {
      set.status = status;
      set.completedAt = status === 'completed' ? now : null;
    }
    const restore = row.hiddenAt !== null;
    if (Object.keys(set).length > 0 || restore) milestoneUpdates.push({ id: row.id, set, restore });
  }
  const milestoneHides = existing.milestones
    .filter((row) => row.backlogId && !milestoneUsed.has(row.id) && !row.hiddenAt)
    .map((row) => ({ id: row.id }));

  // 7. Counts, sample, next number --------------------------------------------------------------
  const counts = emptyCounts();
  const completedPrefix = `${input.folder.replace(/\/+$/, '')}/completed/`;
  for (const snapshot of all) {
    const want = desired.get(snapshot) as TaskValues;
    if (snapshot.kind === 'draft') counts.drafts += 1;
    else if (snapshot.kind === 'archived') {
      counts.archived += 1;
      if (snapshot.path.startsWith(completedPrefix)) counts.completed += 1;
    } else {
      counts.tasks += 1;
      if (isOpenStatus(want.status)) counts.open += 1;
      if (want.keySuffix) counts.subtasks += 1;
    }
  }
  for (const snapshot of milestoneWinners.values()) {
    if (snapshot.archived) counts.archivedMilestones += 1;
    else counts.milestones += 1;
  }
  const kindOrder: Record<TaskFileKind, number> = { task: 0, archived: 1, draft: 2 };
  const sample = all
    .map((snapshot) => ({ snapshot, want: desired.get(snapshot) as TaskValues }))
    .sort(
      (a, b) =>
        kindOrder[a.snapshot.kind] - kindOrder[b.snapshot.kind] ||
        a.want.number - b.want.number ||
        compareSuffix(a.want.keySuffix, b.want.keySuffix),
    )
    .slice(0, SAMPLE_SIZE)
    .map(({ snapshot, want }) => ({
      backlogId: snapshot.backlogId,
      key: formatTaskKey(input.projectKey, want.number, want.keySuffix),
      title: want.title,
      status: want.status,
      kind: snapshot.kind,
    }));
  let highest = existing.nextTaskNumber - 1;
  for (const want of desired.values()) highest = Math.max(highest, want.number);
  for (const task of existing.tasks) highest = Math.max(highest, task.number);

  fileProblems.sort((a, b) => compareText((a as { path: string }).path, (b as { path: string }).path));
  return {
    commit: input.commit,
    folder: input.folder,
    config: configSummary(input.config),
    firstRead: existing.firstRead,
    tasks: { creates, updates, hides },
    milestones: { creates: milestoneCreates, updates: milestoneUpdates, hides: milestoneHides },
    files: fileRows.sort((a, b) => compareText(a.path, b.path)),
    problems: [...fileProblems, ...values.values()],
    counts,
    sample,
    nextTaskNumber: highest + 1,
    seen,
  };
}

/** True when applying the plan changes tasks or milestones (activity-worthy). */
export function planChangesContent(plan: BacklogPlan): boolean {
  return (
    plan.tasks.creates.length +
      plan.tasks.updates.length +
      plan.tasks.hides.length +
      plan.milestones.creates.length +
      plan.milestones.updates.length +
      plan.milestones.hides.length >
    0
  );
}
