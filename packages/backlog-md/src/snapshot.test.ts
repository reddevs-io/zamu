import { describe, expect, test } from 'vitest';
import { parseBacklogFolder } from './folder';
import { classifyPath } from './paths';
import { renderDescription } from './render';
import { readFixtureTree } from './testing/fixtures';
import type { ParseErrorCode } from './types';

// The backlog/ folder of github.com/MrLesk/Backlog.md (see test/fixtures/snapshot/README.md): hundreds
// of real files written across every format era. Files that fail must be listed here with their error.
const EXPECTED_ERRORS: Record<string, ParseErrorCode> = {};

describe('snapshot of Backlog.md’s own backlog folder', () => {
  const files = readFixtureTree('snapshot');
  const folder = parseBacklogFolder(files, 'backlog');

  test('the config parses', () => {
    expect(folder.config?.result).toMatchObject({ ok: true, value: { taskPrefix: 'BACK' }, warnings: [] });
  });

  test('every file is classified', () => {
    const counts: Record<string, number> = {};
    for (const file of files) {
      const kind = classifyPath(file.path, 'backlog', { taskPrefix: 'BACK' });
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    // ignored: LICENSE, README.md, readme.md files, docs/, decisions/, archive/drafts/.
    expect(counts).toEqual({
      config: 1,
      task: 161,
      draft: 15,
      archived: 634,
      milestone: 3,
      archived_milestone: 6,
      ignored: 16,
    });
  });

  test('every file parses or yields its expected, named error', () => {
    const failures = Object.fromEntries(
      folder.files.flatMap((file) => (file.result.ok ? [] : [[file.path, file.result.error.code]])),
    );
    expect(failures).toEqual(EXPECTED_ERRORS);
    for (const file of folder.files) {
      if (!file.result.ok) expect(file.result.error.message).toMatch(/\S/);
    }
  });

  test('IDs are unique and every task has a title, a status and a created date', () => {
    const seen = new Map<string, string>();
    for (const file of folder.files) {
      if (!file.result.ok || file.kind === 'milestone' || file.kind === 'archived_milestone') continue;
      const task = file.result.value;
      if (!('sections' in task)) continue;
      expect(seen.get(task.id.id), task.id.id).toBeUndefined();
      seen.set(task.id.id, file.path);
      expect(task.title, file.path).not.toBe('');
      expect(task.status, file.path).not.toBeNull();
      expect(task.createdDate, file.path).toBeInstanceOf(Date);
    }
    expect(seen.size).toBe(161 + 15 + 634);
  });

  test('subtasks, dates in both timestamp formats, comments and checklists are all present', () => {
    const tasks = folder.files.flatMap((file) =>
      file.result.ok && 'sections' in file.result.value ? [file.result.value] : [],
    );
    expect(tasks.filter((task) => task.id.suffix !== null).length).toBeGreaterThan(100);
    expect(tasks.filter((task) => task.parentId !== null).length).toBeGreaterThan(100);
    expect(tasks.filter((task) => task.sections.comments.length > 0).length).toBeGreaterThan(5);
    expect(
      tasks.filter((task) => (task.sections.acceptanceCriteria?.items.length ?? 0) > 0).length,
    ).toBeGreaterThan(700);
    expect(tasks.filter((task) => task.sections.description === null)).toHaveLength(11);
    const withMinutes = tasks.filter(
      (task) => task.createdDate && task.createdDate.getUTCHours() + task.createdDate.getUTCMinutes() > 0,
    );
    expect(withMinutes.length).toBeGreaterThan(500);
  });

  test('rendered descriptions carry no section markers', () => {
    for (const file of folder.files) {
      if (!file.result.ok || !('sections' in file.result.value)) continue;
      // Marker lines inside code fences are content (tasks that document the format quote them).
      const rendered = renderDescription(file.result.value).replace(
        /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[\t ]*$/gm,
        '',
      );
      expect(rendered, file.path).not.toMatch(
        /^<!-- (?:SECTION:[A-Z_]+|AC|DOD|COMMENTS?):(?:BEGIN|END) -->$/m,
      );
    }
  });

  test('milestones', () => {
    const milestones = folder.files.flatMap((file) =>
      file.result.ok && !('sections' in file.result.value) ? [[file.kind, file.result.value.id]] : [],
    );
    expect(milestones).toEqual([
      ['archived_milestone', 'm-0'],
      ['archived_milestone', 'm-1'],
      ['archived_milestone', 'm-2'],
      ['archived_milestone', 'm-3'],
      ['archived_milestone', 'm-4'],
      ['archived_milestone', 'm-5'],
      ['milestone', 'm-6'],
      ['milestone', 'm-7'],
      ['milestone', 'm-8'],
    ]);
  });
});
