import { describe, expect, test } from 'vitest';
import { matchMilestone, parseMilestone } from './milestone';
import { readFixture } from './testing/fixtures';

describe('parseMilestone', () => {
  test('milestone file with a due date', () => {
    const path = 'eras/2026-10-iso/planning/milestones/m-7 - agent-cli-workflow.md';
    expect(parseMilestone(path, readFixture(path))).toEqual({
      ok: true,
      value: {
        path,
        id: 'm-7',
        number: 7,
        title: 'Agent CLI Workflow',
        description: 'Make the CLI the default entry point.',
        dueDate: '2026-12-01',
        legacy: false,
        unknown: {},
      },
      warnings: [],
    });
  });

  test('zero-padded archived milestone', () => {
    const path = 'eras/2026-10-iso/planning/archive/milestones/m-03 - gui.md';
    const result = parseMilestone(path, readFixture(path));
    expect(result).toMatchObject({ ok: true, value: { id: 'm-3', number: 3, title: 'GUI', dueDate: null } });
  });

  test('milestone with markers in its description', () => {
    const result = parseMilestone(
      'm-2 - x.md',
      '---\nid: m-2\ntitle: X\n---\n\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nMarked.\n<!-- SECTION:DESCRIPTION:END -->\n',
    );
    expect(result).toMatchObject({ ok: true, value: { description: 'Marked.' } });
  });

  test('errors', () => {
    expect(parseMilestone('m-1 - x.md', '---\nid: v1\n---\n')).toMatchObject({
      ok: false,
      error: { code: 'invalid_id', line: 2 },
    });
    expect(parseMilestone('notes.md', '---\ntitle: X\n---\n')).toMatchObject({
      ok: false,
      error: { code: 'missing_id' },
    });
    expect(parseMilestone('m-1 - x.md', 'no frontmatter')).toMatchObject({
      ok: false,
      error: { code: 'missing_frontmatter' },
    });
  });

  test('id from the file name, title from the file name', () => {
    const result = parseMilestone('milestones/m-4 - gui-kanban.md', '---\ndue_date: nope\n---\n');
    expect(result).toMatchObject({ ok: true, value: { id: 'm-4', title: 'gui kanban', dueDate: null } });
    expect(result.ok && result.warnings.map((warning) => warning.code)).toEqual([
      'missing_title',
      'invalid_due_date',
    ]);
  });
});

describe('matchMilestone', () => {
  const milestones = [
    { id: 'm-1', title: 'CLI' },
    { id: 'm-7', title: 'Agent CLI Workflow' },
    { id: 'm-8', title: 'Twin' },
    { id: 'm-9', title: 'twin' },
    { id: 'm-3', title: 'GUI', archived: true },
    { id: 'm-4', title: 'Agent CLI Workflow', archived: true },
  ];

  test.each([
    ['m-7', 'm-7'],
    ['M-07', 'm-7'],
    ['7', 'm-7'],
    ['agent cli workflow', 'm-7'],
    ['  CLI ', 'm-1'],
    ['m-3', 'm-3'],
    ['gui', 'm-3'],
  ])('%j matches %s', (value, id) => {
    expect(matchMilestone(value, milestones)?.id).toBe(id);
  });

  test.each(['twin', 'unknown', '', null, undefined, 'm-99'])('%j matches nothing', (value) => {
    expect(matchMilestone(value, milestones)).toBeNull();
  });

  test('an archived title shared with an active milestone resolves to the active one', () => {
    expect(matchMilestone('Agent CLI Workflow', milestones)?.id).toBe('m-7');
  });

  test('legacy config milestones match by name', () => {
    const legacy = [
      { id: 'Beta launch', title: 'Beta launch' },
      { id: 'v1.0', title: 'v1.0' },
    ];
    expect(matchMilestone('beta launch', legacy)?.id).toBe('Beta launch');
    expect(matchMilestone('V1.0', legacy)?.id).toBe('v1.0');
  });

  test('a numeric title can still match when no ID does', () => {
    expect(matchMilestone('2026', [{ id: 'm-1', title: '2026' }])?.id).toBe('m-1');
  });
});
