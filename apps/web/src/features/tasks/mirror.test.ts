import type { ProjectActivity, Task } from '@pm/contracts';
import { describe, expect, it } from 'vitest';
import { formatDueDate, formatUtcDayTime } from './MirroredTask';
import {
  backlogCliId,
  countSections,
  describeBacklogFields,
  describeMirroredDescription,
  describeProjectEntry,
  describeVisibilityChange,
  editExample,
  mirrorOf,
  projectRowsForTask,
  shellWord,
} from './mirror';

const backlog = (id: string, kind: 'task' | 'draft' = 'task') =>
  ({ id, file: null, fileUrl: null, data: { kind } }) as unknown as Task['backlog'];

describe('mirrorOf', () => {
  it('tells mirrored, detached and native tasks apart', () => {
    expect(mirrorOf({ locked: ['status'], backlog: backlog('BACK-1') } as Task)).toMatchObject({
      isMirrored: true,
      isDetached: false,
      backlogId: 'BACK-1',
    });
    expect(mirrorOf({ locked: [], backlog: backlog('BACK-1') } as unknown as Task)).toMatchObject({
      isMirrored: false,
      isDetached: true,
    });
    expect(mirrorOf({ backlogId: 'BACK-2', hidden: true } as unknown as Task)).toMatchObject({
      backlogId: 'BACK-2',
      isHidden: true,
    });
    expect(mirrorOf(undefined)).toMatchObject({ isMirrored: false, isDetached: false, backlogId: null });
  });
});

describe('edit examples', () => {
  it('drops the prefix and keeps subtask numbers', () => {
    expect(backlogCliId('BACK-786')).toBe('786');
    expect(backlogCliId('BACK-786.1.2')).toBe('786.1.2');
    expect(backlogCliId('not an id')).toBe('not an id');
  });

  it('quotes values like core hints do', () => {
    expect(shellWord('Done')).toBe('Done');
    expect(shellWord('In Progress')).toBe('"In Progress"');
    expect(shellWord('a$b')).toBe('"a\\$b"');
  });

  it('builds a command per field, and none for created_date', () => {
    const task = { status: 'in_progress', priority: 'high', milestone: null, backlog: backlog('BACK-786.1') };
    expect(editExample(task as Task, 'status')).toBe('backlog task edit 786.1 -s Done');
    expect(editExample({ ...task, status: 'done' } as Task, 'status')).toBe(
      'backlog task edit 786.1 -s "In Progress"',
    );
    expect(editExample(task as Task, 'priority')).toBe('backlog task edit 786.1 --priority medium');
    expect(editExample(task as Task, 'createdAt')).toBeNull();
    expect(editExample({ ...task, backlog: backlog('DRAFT-3', 'draft') } as Task, 'title')).toBe(
      'backlog draft edit 3 -t "New title"',
    );
  });
});

describe('description summary', () => {
  it('counts the leading text and each section, ignoring code fences', () => {
    expect(countSections(null)).toBe(0);
    expect(countSections('Text')).toBe(1);
    expect(countSections('## Acceptance criteria\n\n- [ ] #1 a')).toBe(1);
    expect(countSections('Text\n\n```\n## not a heading\n```\n\n## Notes\n\nx')).toBe(2);
    expect(describeMirroredDescription('Text\n\n## AC\n\n- [x] #1 a\n- [ ] #2 b')).toBe(
      '2 sections from Backlog.md, 1 of 2 checklist items done',
    );
    expect(describeMirroredDescription('')).toBe('empty in the file');
  });
});

describe('history sentences', () => {
  it('names block-only fields and skips updated_date alone', () => {
    expect(describeBacklogFields(['labels', 'dueDate'])).toBe('changed the labels and the due date');
    expect(describeBacklogFields(['updatedDate'])).toBeNull();
    expect(describeVisibilityChange('task.hidden', 'main')).toBe('hid the task: its file is gone from main');
    expect(describeVisibilityChange('task.restored', null)).toBe(
      'brought the task back: its file is on the default branch again',
    );
  });

  const entry = (type: ProjectActivity['type'], tasks: number | null = null): ProjectActivity => ({
    id: type,
    type,
    actor: null,
    onBehalfOf: null,
    origin: 'backlog',
    originRef: 'abc',
    details: { mode: 'mirror', repository: null, tasks, milestones: null },
    createdAt: '2026-10-23T10:00:00Z',
  });

  it('shows the first read only for tasks it brought in, and always the detach', () => {
    const history = [entry('project.backlog_imported', 412), entry('project.backlog_detached')];
    expect(projectRowsForTask(history, [])).toHaveLength(2);
    expect(projectRowsForTask(history, [{ kind: 'activity', type: 'task.created' }])).toHaveLength(1);
    expect(describeProjectEntry(entry('project.backlog_imported', 412), 'Payments')).toBe(
      'imported the task with 411 others',
    );
    expect(describeProjectEntry(entry('project.backlog_imported', 1), 'Payments')).toBe('imported the task');
    expect(describeProjectEntry(entry('project.backlog_detached'), 'Payments')).toBe(
      'detached Payments from Backlog.md. Every field is editable now.',
    );
  });
});

describe('dates', () => {
  it('formats due dates with the year and created dates in UTC', () => {
    expect(formatDueDate('2026-11-14')).toBe('Nov 14, 2026');
    expect(formatDueDate('next week')).toBe('next week');
    const now = new Date('2026-10-23T12:00:00Z');
    expect(formatUtcDayTime('2026-10-02T09:14:00Z', now)).toBe('Oct 2, 09:14 UTC');
    expect(formatUtcDayTime('2025-10-02T09:14:00Z', now)).toBe('Oct 2, 2025, 09:14 UTC');
  });
});
