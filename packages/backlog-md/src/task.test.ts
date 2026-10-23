import { describe, expect, test } from 'vitest';
import { parseConfig } from './config';
import { parseTask } from './task';
import { readFixture } from './testing/fixtures';
import type { BacklogConfig, BacklogTask, ParseResult } from './types';

function configOf(path: string): BacklogConfig {
  const result = parseConfig(readFixture(path));
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function ok(result: ParseResult<BacklogTask>) {
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

function fixtureTask(path: string, config?: BacklogConfig) {
  return parseTask(path, readFixture(path), config);
}

describe('2025-06 era: plain headings, date-only and two-digit years, zero padding', () => {
  const config = configOf('eras/2025-06-plain/backlog/config.yml');

  test('task with (Optional) headings, @assignee without quotes, legacy milestone name', () => {
    const { value, warnings } = ok(
      fixtureTask('eras/2025-06-plain/backlog/tasks/task-001 - Setup-project.md', config),
    );
    expect(warnings).toEqual([]);
    expect(value).toMatchObject({
      id: { id: 'TASK-1', prefix: 'TASK', number: 1, suffix: null },
      title: 'Setup project (Node, TypeScript, linters)',
      status: 'In Progress',
      assignees: ['@sam'],
      reporter: '@lee',
      createdDate: new Date('2025-06-03T00:00:00Z'),
      updatedDate: null,
      labels: ['setup', 'meta'],
      milestone: 'Beta launch',
      dependencies: [],
      priority: null,
      ordinal: null,
    });
    expect(value.sections).toMatchObject({
      description: 'Initialise the repository and the toolchain.',
      acceptanceCriteria: {
        items: [
          { index: 1, checked: true, text: 'Project initialised.' },
          { index: 2, checked: false, text: 'Linter configured.' },
        ],
      },
      implementationPlan: '1. Run init.\n2. Add the linter.',
      implementationNotes: 'Started with the default template.',
    });
  });

  test('zero-padded subtask, DD/MM/YY date, references to padded IDs', () => {
    const { value } = ok(fixtureTask('eras/2025-06-plain/backlog/tasks/task-001.01 - Add-linter.md', config));
    expect(value.id).toEqual({ id: 'TASK-1.1', prefix: 'TASK', number: 1, suffix: '1' });
    expect(value.createdDate).toEqual(new Date('2025-06-04T00:00:00Z'));
    expect(value.parentId).toBe('TASK-1');
    expect(value.dependencies).toEqual(['TASK-2']);
    expect(value.assignees).toEqual([]);
  });

  test('flow list of @assignees, DD.MM.YY date, block dependencies with a bare number', () => {
    const { value } = ok(fixtureTask('eras/2025-06-plain/backlog/tasks/task-003 - Checkout-page.md', config));
    expect(value.assignees).toEqual(['@sam', '@lee']);
    expect(value.createdDate).toEqual(new Date('2025-06-10T00:00:00Z'));
    expect(value.dependencies).toEqual(['TASK-1', 'TASK-2']);
    expect(value.milestone).toBe('2');
    expect(value.sections.description).toBe(
      'Build the checkout page.\n\n### Notes for later\n\nThis sub-heading belongs to the description.',
    );
  });

  test('legacy completed/ task with DD-MM-YY date', () => {
    const { value } = ok(
      fixtureTask('eras/2025-06-plain/backlog/completed/task-002 - Product-list.md', config),
    );
    expect(value.status).toBe('Done');
    expect(value.assignees).toEqual(['sam']);
    expect(value.createdDate).toEqual(new Date('2025-06-05T00:00:00Z'));
  });
});

describe('2025-09 era: markers, timestamps without zone, custom prefix', () => {
  const config = configOf('eras/2025-09-markers/backlog/config.yml');

  test('every field and section of a full task', () => {
    const { value, warnings } = ok(
      fixtureTask('eras/2025-09-markers/backlog/tasks/pay-12 - Webhook-retries.md', config),
    );
    expect(warnings).toEqual([]);
    expect(value).toMatchObject({
      id: { id: 'PAY-12', prefix: 'PAY', number: 12, suffix: null },
      title: 'Webhook retries',
      status: 'In Review',
      assignees: ['@alex', '@codex'],
      reporter: '@sam',
      createdDate: new Date('2025-09-01T09:30:00Z'),
      updatedDate: new Date('2025-09-03T17:05:00Z'),
      dueDate: null,
      labels: ['webhooks'],
      milestone: 'm-1',
      dependencies: ['PAY-3'],
      references: ['docs/webhooks.md'],
      documentation: ['https://example.com/webhooks'],
      priority: 'high',
      ordinal: 2000,
      type: 'feature',
      unknown: { custom_field: 'kept as is' },
    });
    expect(value.sections.description).toBe(
      'Retry failed webhook deliveries with backoff.\n\n```md\n## Acceptance Criteria\n- [ ] #9 not a real criterion, it sits in a code fence\n```',
    );
    expect(value.sections.acceptanceCriteria?.items).toEqual([
      { index: 1, checked: true, text: 'Failed deliveries are retried' },
      { index: 2, checked: false, text: 'Retries back off exponentially' },
    ]);
    expect(value.sections.definitionOfDone?.items).toEqual([
      { index: 1, checked: false, text: 'Tests pass' },
    ]);
    expect(value.sections.implementationPlan).toBe('1. Add a retry queue.\n2. Schedule with backoff.');
    expect(value.sections.implementationNotes).toBe('Queue lives in Redis.');
    expect(value.sections.comments.map((comment) => [comment.author, comment.body])).toEqual([
      ['@alex', 'Started on the queue.'],
      ['@sam', 'Looks good, ship it.'],
    ]);
    expect(value.sections.finalSummary).toBe('Retries ship behind a flag.');
    expect(value.sections.extra).toBe('## Testing\n\nRan the load test twice.');
  });

  test('subtask and nested subtask', () => {
    const sub = ok(
      fixtureTask('eras/2025-09-markers/backlog/tasks/pay-12.1 - Retry-backoff.md', config),
    ).value;
    expect(sub.id).toEqual({ id: 'PAY-12.1', prefix: 'PAY', number: 12, suffix: '1' });
    expect(sub.parentId).toBe('PAY-12');
    const nested = ok(
      fixtureTask('eras/2025-09-markers/backlog/tasks/pay-12.1.2 - Backoff-jitter.md', config),
    ).value;
    expect(nested.id).toEqual({ id: 'PAY-12.1.2', prefix: 'PAY', number: 12, suffix: '1.2' });
    expect(nested.parentId).toBe('PAY-12.1');
  });

  test('draft keeps its own prefix', () => {
    const { value } = ok(
      fixtureTask('eras/2025-09-markers/backlog/drafts/draft-1 - Signed-webhooks.md', config),
    );
    expect(value.id).toEqual({ id: 'DRAFT-1', prefix: 'DRAFT', number: 1, suffix: null });
  });
});

describe('2026-10 era: ISO UTC timestamps, delimited comments', () => {
  const config = configOf('eras/2026-10-iso/backlog.config.yml');

  test('task with due date, subtasks, modified files and comments', () => {
    const { value, warnings } = ok(
      fixtureTask('eras/2026-10-iso/planning/tasks/back-786 - Mirror-Backlog-md.md', config),
    );
    expect(warnings).toEqual([]);
    expect(value).toMatchObject({
      id: { id: 'BACK-786', number: 786, suffix: null },
      createdDate: new Date('2026-10-21T14:26:00Z'),
      updatedDate: new Date('2026-10-22T08:05:00Z'),
      dueDate: '2026-11-15',
      milestone: 'Agent CLI Workflow',
      dependencies: ['BACK-785'],
      subtasks: ['BACK-786.1'],
      modifiedFiles: ['src/mirror.ts'],
      priority: 'low',
      ordinal: 500,
      onStatusChange: 'echo moved',
    });
    expect(value.sections.comments).toEqual([
      {
        index: 1,
        author: '@alex-agent',
        createdRaw: '2026-10-21 15:00',
        created: new Date('2026-10-21T15:00:00Z'),
        body: 'Picked this up.',
      },
      {
        index: 2,
        author: '@sam',
        createdRaw: '2026-10-22T09:00:00Z',
        created: new Date('2026-10-22T09:00:00Z'),
        body: 'Thanks. Keep the numbers.',
      },
    ]);
  });

  test('a file with frontmatter only has empty sections', () => {
    const { value } = ok(
      fixtureTask('eras/2026-10-iso/planning/tasks/back-786.1 - Parse-the-folder.md', config),
    );
    expect(value.sections).toEqual({
      description: null,
      acceptanceCriteria: null,
      definitionOfDone: null,
      implementationPlan: null,
      implementationNotes: null,
      comments: [],
      finalSummary: null,
      extra: null,
    });
  });
});

describe('identity', () => {
  test('frontmatter id wins over the file name, with a warning', () => {
    const result = ok(
      parseTask('tasks/task-9 - Renamed.md', '---\nid: task-10\ntitle: X\nstatus: To Do\n---\n'),
    );
    expect(result.value.id.id).toBe('TASK-10');
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'id_mismatch', line: 2, field: 'id' })]);
  });

  test('the file name is the fallback id and title', () => {
    const result = ok(
      parseTask('backlog/tasks/task-6 - No-id.md', readFixture('errors/backlog/tasks/task-6 - No-id.md')),
    );
    expect(result.value.id.id).toBe('TASK-6');
    expect(result.value.title).toBe('No id in frontmatter');
    const untitled = ok(parseTask('tasks/back-3 - Fix-the-thing.md', '---\nstatus: Done\n---\n'));
    expect(untitled.value.title).toBe('Fix the thing');
    expect(untitled.warnings).toEqual([expect.objectContaining({ code: 'missing_title' })]);
  });

  test('a numeric frontmatter id takes the file prefix', () => {
    expect(ok(parseTask('tasks/pay-4 - A.md', '---\nid: 4\ntitle: A\nstatus: x\n---\n')).value.id.id).toBe(
      'PAY-4',
    );
  });

  test('zero padding is dropped (BACK-007 is 7)', () => {
    expect(ok(parseTask('x.md', '---\nid: BACK-007\ntitle: A\nstatus: x\n---\n')).value.id.number).toBe(7);
  });

  test('missing status falls back to the config default with a warning', () => {
    const result = ok(parseTask('tasks/task-1 - A.md', '---\nid: task-1\ntitle: A\n---\n'));
    expect(result.value.status).toBe('To Do');
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'missing_status' })]);
  });

  test('CRLF and a byte order mark', () => {
    const text =
      '﻿---\r\nid: task-2\r\ntitle: Windows\r\nstatus: Done\r\n---\r\n\r\n## Description\r\n\r\nCRLF body.\r\n';
    const { value } = ok(parseTask('task-2 - Windows.md', text));
    expect(value.title).toBe('Windows');
    expect(value.sections.description).toBe('CRLF body.');
  });
});

describe('errors are values with a line', () => {
  const errors = 'errors/backlog/tasks';

  test('dependencies as a nested list', () => {
    expect(fixtureTask(`${errors}/task-1 - Nested-dependencies.md`)).toEqual({
      ok: false,
      error: { code: 'invalid_dependencies', message: 'dependencies must be a flat list (line 8)', line: 8 },
    });
  });

  test('dependencies as a mapping', () => {
    const result = parseTask('t.md', '---\nid: task-1\ntitle: A\ndependencies:\n  task-2: yes\n---\n');
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_dependencies', line: 4 } });
  });

  test('invalid YAML', () => {
    const result = fixtureTask(`${errors}/task-2 - Broken-yaml.md`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_yaml');
    expect(result.error.message).toMatch(/^frontmatter is not valid YAML: .+ \(line \d\)$/);
    expect(result.error.line).toBeGreaterThanOrEqual(3);
  });

  test('duplicate keys are invalid YAML', () => {
    const result = parseTask('t.md', '---\nid: task-1\ntitle: A\ntitle: B\n---\n');
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_yaml', line: 4 } });
  });

  test('no frontmatter', () => {
    expect(fixtureTask(`${errors}/task-3 - No-frontmatter.md`)).toEqual({
      ok: false,
      error: {
        code: 'missing_frontmatter',
        message: 'file does not start with --- frontmatter (line 1)',
        line: 1,
      },
    });
    expect(parseTask('t.md', '---\nid: task-1\n')).toMatchObject({
      ok: false,
      error: { code: 'missing_frontmatter' },
    });
  });

  test('frontmatter that is not a mapping', () => {
    expect(parseTask('t.md', '---\n- a\n- b\n---\n')).toMatchObject({
      ok: false,
      error: { code: 'invalid_frontmatter' },
    });
  });

  test('a word id', () => {
    expect(fixtureTask(`${errors}/task-4 - Word-id.md`)).toEqual({
      ok: false,
      error: {
        code: 'invalid_id',
        message: 'id "task-abc" is not a task ID like TASK-12 or TASK-12.1 (line 2)',
        line: 2,
      },
    });
  });

  test('no id anywhere', () => {
    expect(fixtureTask(`${errors}/notes - No-id-anywhere.md`)).toEqual({
      ok: false,
      error: {
        code: 'missing_id',
        message: 'no id in the frontmatter and none in the file name (line 2)',
        line: 2,
      },
    });
  });

  test('unreadable dates are warnings, not errors', () => {
    const result = ok(fixtureTask(`${errors}/task-5 - Unreadable-date.md`));
    expect(result.value.createdDate).toBeNull();
    expect(result.value.dueDate).toBeNull();
    expect(result.value.sections.description).toBe('Body without any heading becomes the description.');
    expect(result.warnings).toEqual([
      {
        code: 'unreadable_date',
        field: 'created_date',
        message: 'created_date "yesterday" is not a date Backlog.md writes (line 5)',
        line: 5,
      },
      {
        code: 'invalid_due_date',
        field: 'due_date',
        message: 'due_date "soon" is not a YYYY-MM-DD date (line 6)',
        line: 6,
      },
    ]);
  });

  test('values of the wrong shape are dropped with a warning', () => {
    const result = ok(
      parseTask(
        't.md',
        '---\nid: task-1\ntitle: A\nstatus: x\nmilestone: [a, b]\nordinal: high\nlabels: [a, {b: 1}]\n---\n',
      ),
    );
    expect(result.value).toMatchObject({ milestone: null, ordinal: null, labels: ['a'] });
    expect(result.warnings.map((warning) => [warning.code, warning.field])).toEqual([
      ['ignored_value', 'labels'],
      ['ignored_value', 'milestone'],
      ['ignored_value', 'ordinal'],
    ]);
  });
});

describe('frontmatter quirks Backlog.md tolerates', () => {
  test('@names in block lists and as a quoted reporter', () => {
    const { value } = ok(
      parseTask(
        't.md',
        '---\nid: task-1\ntitle: A\nstatus: x\nassignee:\n  - @sam\n  - lee\nreporter: "@kim"\n---\n',
      ),
    );
    expect(value.assignees).toEqual(['@sam', 'lee']);
    expect(value.reporter).toBe('@kim');
  });

  test('unquoted dates and numbers stay as written, not YAML timestamps', () => {
    const { value } = ok(
      parseTask('t.md', '---\nid: task-1\ntitle: 2024\nstatus: x\ncreated_date: 2025-06-03 14:30\n---\n'),
    );
    expect(value.title).toBe('2024');
    expect(value.createdDate).toEqual(new Date('2025-06-03T14:30:00Z'));
  });

  test('empty frontmatter falls back to the file name', () => {
    const { value } = ok(parseTask('tasks/task-8 - Empty.md', '---\n---\nBody.'));
    expect(value).toMatchObject({ id: { id: 'TASK-8' }, title: 'Empty', status: 'To Do' });
    expect(value.sections.description).toBe('Body.');
  });
});
