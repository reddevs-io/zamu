import { describe, expect, test } from 'vitest';
import { parseBacklogDate, parseDueDate } from './dates';
import { canonicalTaskRef, parseBacklogId, parseMilestoneId } from './ids';

describe('parseBacklogId', () => {
  test.each([
    ['BACK-786', { id: 'BACK-786', prefix: 'BACK', number: 786, suffix: null }],
    ['back-786.1', { id: 'BACK-786.1', prefix: 'BACK', number: 786, suffix: '1' }],
    ['Back-786.1.2', { id: 'BACK-786.1.2', prefix: 'BACK', number: 786, suffix: '1.2' }],
    ['task-007', { id: 'TASK-7', prefix: 'TASK', number: 7, suffix: null }],
    ['task-001.01', { id: 'TASK-1.1', prefix: 'TASK', number: 1, suffix: '1' }],
    ['  DRAFT-14  ', { id: 'DRAFT-14', prefix: 'DRAFT', number: 14, suffix: null }],
  ])('%s', (input, expected) => {
    expect(parseBacklogId(input)).toEqual(expected);
  });

  test('a bare number takes the default prefix', () => {
    expect(parseBacklogId('12.3', 'pay')).toEqual({ id: 'PAY-12.3', prefix: 'PAY', number: 12, suffix: '3' });
    expect(parseBacklogId('12')).toBeNull();
  });

  test.each([
    'task-abc',
    'BACK-786.',
    'BACK-',
    'BACK-7..1',
    'task 7',
    '',
    'BACK-99999999999999999999',
    'BA2-1',
  ])('rejects %j', (input) => {
    expect(parseBacklogId(input)).toBeNull();
  });

  test('canonicalTaskRef keeps unreadable references as written', () => {
    expect(canonicalTaskRef('task-002', 'TASK')).toBe('TASK-2');
    expect(canonicalTaskRef('002', 'PAY')).toBe('PAY-2');
    expect(canonicalTaskRef(' see BACK-1 ', 'BACK')).toBe('see BACK-1');
  });
});

describe('parseMilestoneId', () => {
  test.each([
    ['m-7', { id: 'm-7', number: 7 }],
    ['M-07', { id: 'm-7', number: 7 }],
    ['3', { id: 'm-3', number: 3 }],
    ['m-0', { id: 'm-0', number: 0 }],
  ])('%s', (input, expected) => {
    expect(parseMilestoneId(input)).toEqual(expected);
  });

  test.each(['v1.0', 'm-', 'milestone-1'])('rejects %j', (input) => {
    expect(parseMilestoneId(input)).toBeNull();
  });
});

describe('parseBacklogDate', () => {
  test.each([
    ['2026-10-21T14:26:00Z', '2026-10-21T14:26:00.000Z'],
    ['2026-10-21T14:26Z', '2026-10-21T14:26:00.000Z'],
    ['2026-10-21T16:26:00+02:00', '2026-10-21T14:26:00.000Z'],
    ['2026-10-21T14:26:00.250Z', '2026-10-21T14:26:00.250Z'],
    ['2025-09-01 09:30', '2025-09-01T09:30:00.000Z'],
    ['2025-09-01 09:30:15', '2025-09-01T09:30:15.000Z'],
    ["'2025-09-01 09:30'", '2025-09-01T09:30:00.000Z'],
    ['2025-06-03', '2025-06-03T00:00:00.000Z'],
    ['05-06-25', '2025-06-05T00:00:00.000Z'],
    ['04/06/25', '2025-06-04T00:00:00.000Z'],
    ['10.06.25', '2025-06-10T00:00:00.000Z'],
  ])('%s', (input, iso) => {
    expect(parseBacklogDate(input)?.toISOString()).toBe(iso);
  });

  test.each([
    'yesterday',
    '2025-02-30',
    '2025-13-01 10:00',
    '31-02-25',
    '2025-06-03 25:00',
    '',
    null,
    undefined,
  ])('rejects %j', (input) => {
    expect(parseBacklogDate(input)).toBeNull();
  });
});

describe('parseDueDate', () => {
  test('keeps the written day and tolerates a trailing time', () => {
    expect(parseDueDate('2026-11-15')).toBe('2026-11-15');
    expect(parseDueDate('2026-11-15T23:30:00-05:00')).toBe('2026-11-15');
    expect(parseDueDate("'2026-11-15'")).toBe('2026-11-15');
  });

  test('null for unreadable, undefined for missing', () => {
    expect(parseDueDate('soon')).toBeNull();
    expect(parseDueDate('2026-02-30')).toBeNull();
    expect(parseDueDate(undefined)).toBeUndefined();
    expect(parseDueDate('')).toBeUndefined();
  });
});
