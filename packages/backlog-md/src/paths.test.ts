import { describe, expect, test } from 'vitest';
import { classifyPath } from './paths';

describe('classifyPath', () => {
  test.each([
    ['backlog/config.yml', 'config'],
    ['backlog/config.yaml', 'config'],
    ['backlog/tasks/back-1 - Title.md', 'task'],
    ['backlog/tasks/back-1.2.3 - Nested.md', 'task'],
    ['backlog/drafts/draft-4 - Idea.md', 'draft'],
    ['backlog/archive/tasks/back-9 - Old.md', 'archived'],
    ['backlog/completed/back-2 - Done.md', 'archived'],
    ['backlog/milestones/m-3 - gui.md', 'milestone'],
    ['backlog/archive/milestones/m-0 - setup.md', 'archived_milestone'],
    ['backlog/archive/drafts/draft-1 - Dropped.md', 'ignored'],
    ['backlog/docs/doc-1 - Guide.md', 'ignored'],
    ['backlog/decisions/decision-1 - Tailwind.md', 'ignored'],
    ['backlog/tasks/readme.md', 'ignored'],
    ['backlog/tasks/README.md', 'ignored'],
    ['backlog/tasks/notes.md', 'ignored'],
    ['backlog/tasks/sub/back-1 - Deep.md', 'ignored'],
    ['backlog/tasks/back-1 - Title.txt', 'ignored'],
    ['backlog/milestones/readme.md', 'ignored'],
    ['backlog/assets/images/a.png', 'ignored'],
    ['backlog/tasks/config.yml', 'ignored'],
    ['other/tasks/back-1 - Title.md', 'ignored'],
    ['backlog', 'ignored'],
    ['backlog-old/tasks/back-1 - Title.md', 'ignored'],
  ])('%s is %s', (path, kind) => {
    expect(classifyPath(path, 'backlog')).toBe(kind);
  });

  test('folder forms: hidden, nested, trailing slash, repository root', () => {
    expect(classifyPath('.backlog/tasks/task-1 - A.md', '.backlog')).toBe('task');
    expect(classifyPath('work/planning/drafts/draft-1 - A.md', 'work/planning/')).toBe('draft');
    expect(classifyPath('tasks/task-1 - A.md', '')).toBe('task');
  });

  test('with a task prefix, only that prefix counts as a task (as Backlog.md lists them)', () => {
    expect(classifyPath('backlog/tasks/back-1 - A.md', 'backlog', { taskPrefix: 'BACK' })).toBe('task');
    expect(classifyPath('backlog/tasks/BACK-1 - A.md', 'backlog', { taskPrefix: 'back' })).toBe('task');
    expect(classifyPath('backlog/tasks/task-1 - A.md', 'backlog', { taskPrefix: 'BACK' })).toBe('ignored');
    expect(classifyPath('backlog/completed/task-1 - A.md', 'backlog', { taskPrefix: 'BACK' })).toBe(
      'ignored',
    );
    expect(classifyPath('backlog/drafts/task-4 - Old.md', 'backlog')).toBe('ignored');
  });
});
