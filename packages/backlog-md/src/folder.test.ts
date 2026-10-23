import { describe, expect, test } from 'vitest';
import { parseRootConfig } from './config';
import { parseBacklogFolder } from './folder';
import { readFixtureTree } from './testing/fixtures';

function summary(root: string, folder: string) {
  const parsed = parseBacklogFolder(readFixtureTree(root), folder);
  return {
    parsed,
    files: parsed.files.map((file) => [
      file.path,
      file.kind,
      file.result.ok ? file.result.value.id : `error: ${file.result.error.code}`,
    ]),
  };
}

function idOf(value: { id: string } | { id: { id: string } }): string {
  return typeof value.id === 'string' ? value.id : value.id.id;
}

describe('parseBacklogFolder per era', () => {
  test('2025-06: completed/, legacy config milestones, old-style drafts ignored', () => {
    const { parsed } = summary('eras/2025-06-plain', 'backlog');
    expect(parsed.config?.path).toBe('backlog/config.yml');
    expect(parsed.files.map((file) => [file.kind, file.result.ok && idOf(file.result.value)])).toEqual([
      ['archived', 'TASK-2'],
      ['task', 'TASK-1'],
      ['task', 'TASK-1.1'],
      ['task', 'TASK-3'],
    ]);
    expect(parsed.legacyMilestones.map((milestone) => milestone.id)).toEqual(['Beta launch', 'v1.0']);
  });

  test('2025-09: every folder kind', () => {
    const { parsed } = summary('eras/2025-09-markers', 'backlog');
    expect(parsed.effectiveConfig.taskPrefix).toBe('PAY');
    expect(parsed.files.map((file) => [file.kind, file.result.ok && idOf(file.result.value)])).toEqual([
      ['archived_milestone', 'm-0'],
      ['archived', 'PAY-3'],
      ['draft', 'DRAFT-1'],
      ['milestone', 'm-1'],
      ['task', 'PAY-12'],
      ['task', 'PAY-12.1'],
      ['task', 'PAY-12.1.2'],
    ]);
    expect(parsed.legacyMilestones).toEqual([]);
  });

  test('2026-10: folder named by a root backlog.config.yml that is also the config', () => {
    const files = readFixtureTree('eras/2026-10-iso');
    const root = files.find((file) => file.path === 'backlog.config.yml');
    const rootConfig = root && parseRootConfig(root.text);
    expect(rootConfig?.ok && rootConfig.value).toEqual({
      backlogDirectory: 'planning',
      projectName: 'Backlog Demo',
    });
    const parsed = parseBacklogFolder(files, 'planning');
    expect(parsed.config?.path).toBe('backlog.config.yml');
    expect(parsed.effectiveConfig.taskPrefix).toBe('BACK');
    expect(parsed.files.map((file) => [file.kind, file.result.ok && idOf(file.result.value)])).toEqual([
      ['archived_milestone', 'm-3'],
      ['draft', 'DRAFT-14'],
      ['milestone', 'm-7'],
      ['task', 'BACK-786'],
      ['task', 'BACK-786.1'],
    ]);
  });

  test('broken files are error values next to good ones', () => {
    const { files } = summary('errors', 'backlog');
    expect(files).toEqual([
      ['backlog/tasks/task-1 - Nested-dependencies.md', 'task', 'error: invalid_dependencies'],
      ['backlog/tasks/task-2 - Broken-yaml.md', 'task', 'error: invalid_yaml'],
      ['backlog/tasks/task-3 - No-frontmatter.md', 'task', 'error: missing_frontmatter'],
      ['backlog/tasks/task-4 - Word-id.md', 'task', 'error: invalid_id'],
      ['backlog/tasks/task-5 - Unreadable-date.md', 'task', expect.objectContaining({ id: 'TASK-5' })],
      ['backlog/tasks/task-6 - No-id.md', 'task', expect.objectContaining({ id: 'TASK-6' })],
    ]);
  });

  test('a broken config is reported and files are read with defaults', () => {
    const parsed = parseBacklogFolder(
      [
        { path: 'backlog/config.yml', text: 'statuses: To Do\n' },
        { path: 'backlog/tasks/task-1 - A.md', text: '---\nid: task-1\ntitle: A\n---\n' },
      ],
      'backlog',
    );
    expect(parsed.config?.result).toMatchObject({ ok: false, error: { code: 'invalid_config', line: 1 } });
    expect(parsed.files[0]?.result).toMatchObject({ ok: true, value: { status: 'To Do' } });
  });

  test('config.yml wins over config.yaml', () => {
    const parsed = parseBacklogFolder(
      [
        { path: 'backlog/config.yaml', text: 'project_name: yaml\n' },
        { path: 'backlog/config.yml', text: 'project_name: yml\n' },
      ],
      'backlog',
    );
    expect(parsed.config?.path).toBe('backlog/config.yml');
    expect(parsed.effectiveConfig.projectName).toBe('yml');
  });
});
