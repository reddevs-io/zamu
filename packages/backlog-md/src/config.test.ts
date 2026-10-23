import { describe, expect, test } from 'vitest';
import { defaultConfig, parseConfig, parseRootConfig } from './config';
import { legacyConfigMilestones } from './milestone';
import { readFixture } from './testing/fixtures';

function config(text: string) {
  const result = parseConfig(text);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

describe('parseConfig', () => {
  test('reads the keys the mirror uses from Backlog.md’s own config', () => {
    const { value, warnings } = config(readFixture('snapshot/backlog/config.yml'));
    expect(value).toMatchObject({
      projectName: 'Backlog.md',
      taskPrefix: 'BACK',
      statuses: ['To Do', 'In Progress', 'Done'],
      defaultStatus: 'To Do',
      priorities: null,
      labels: [],
      legacyMilestones: [],
      zeroPaddedIds: null,
      backlogDirectory: null,
    });
    expect(value.raw.default_port).toBe(6420);
    expect(value.raw.definition_of_done).toHaveLength(3);
    expect(warnings).toEqual([]);
  });

  test('legacy config milestones and zero padding (2025-06 era)', () => {
    const { value } = config(readFixture('eras/2025-06-plain/backlog/config.yml'));
    expect(value.legacyMilestones).toEqual(['Beta launch', 'v1.0']);
    expect(value.zeroPaddedIds).toBe(3);
    expect(value.taskPrefix).toBe('TASK');
    expect(legacyConfigMilestones(value)).toEqual([
      expect.objectContaining({ id: 'Beta launch', title: 'Beta launch', legacy: true, number: null }),
      expect.objectContaining({ id: 'v1.0', title: 'v1.0', legacy: true }),
    ]);
  });

  test('block lists, custom prefix and statuses (2025-09 era)', () => {
    const { value } = config(readFixture('eras/2025-09-markers/backlog/config.yml'));
    expect(value.taskPrefix).toBe('PAY');
    expect(value.statuses).toEqual(['To Do', 'In Progress', 'In Review', 'Done']);
    expect(value.priorities).toEqual(['high', 'medium', 'low']);
    expect(value.labels).toEqual(['api', 'webhooks']);
  });

  test('legacy milestones as a block list', () => {
    const { value } = config('project_name: X\nmilestones:\n  - "M0 - Setup"\n  - Beta\nlabels: []\n');
    expect(value.legacyMilestones).toEqual(['M0 - Setup', 'Beta']);
  });

  test('an empty file is the default config', () => {
    expect(config('').value).toEqual(defaultConfig());
  });

  test('accepts what Backlog.md accepts even when the whole file is not valid YAML', () => {
    const { value, warnings } = config(
      'project_name: Shop: the sequel\nstatuses: ["To Do", "Done"]\ntask_prefix: shop # comment\n',
    );
    expect(value.projectName).toBe('Shop: the sequel');
    expect(value.taskPrefix).toBe('SHOP');
    expect(value.statuses).toEqual(['To Do', 'Done']);
    expect(warnings).toEqual([expect.objectContaining({ code: 'unreadable_raw_config', line: 1 })]);
  });

  test('a list key that is not a list fails with its line', () => {
    const result = parseConfig('project_name: X\ndefault_status: To Do\nstatuses: To Do\n');
    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid_config', message: 'statuses must be a list of names (line 3)', line: 3 },
    });
  });

  test('a list key that is not YAML fails with its line', () => {
    const result = parseConfig('project_name: X\nlabels: ["a", "b"\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_config');
    expect(result.error.message).toMatch(/^labels is not valid YAML: .+ \(line \d+\)$/);
  });

  test.each(['task_prefix: draft', 'task_prefix: "pay-1"'])('rejects %s', (line) => {
    const result = parseConfig(`project_name: X\n${line}\n`);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_config', line: 2 } });
  });

  test('CRLF line endings', () => {
    const { value } = config('project_name: "CR"\r\nstatuses: ["A", "B"]\r\ntask_prefix: "cr"\r\n');
    expect(value).toMatchObject({ projectName: 'CR', statuses: ['A', 'B'], taskPrefix: 'CR' });
  });
});

describe('parseRootConfig', () => {
  test('reads backlog_directory and project_name', () => {
    const result = parseRootConfig(readFixture('eras/2026-10-iso/backlog.config.yml'));
    expect(result).toEqual({
      ok: true,
      value: { backlogDirectory: 'planning', projectName: 'Backlog Demo' },
      warnings: [],
    });
  });

  test.each([
    ['backlog_directory: "./work/backlog/"', 'work/backlog'],
    ['backlog_directory: /etc', null],
    ['backlog_directory: ../outside', null],
    ['backlogDirectory: .backlog', '.backlog'],
    ['other: 1', null],
  ])('%s', (line, expected) => {
    const result = parseRootConfig(`${line}\n`);
    expect(result.ok && result.value.backlogDirectory).toBe(expected);
  });
});
