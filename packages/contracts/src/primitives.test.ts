import { describe, expect, it } from 'vitest';
import {
  formatTaskKey,
  isOpenStatus,
  OPEN_TASK_STATUSES,
  PRIORITIES,
  PRIORITY_LABELS,
  Priority,
  ProjectKey,
  ProjectKeyInput,
  parseTaskKey,
  priorityFromValue,
  priorityToValue,
  safeParseTaskKey,
  suggestProjectKey,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  TaskKey,
  TaskKeyInput,
  TaskStatus,
  Timestamp,
} from './primitives';

describe('ProjectKey', () => {
  it.each(['AB', 'PAY', 'WEB', 'A1', 'ABCDEF', 'X2Y3Z4'])('accepts %s', (key) => {
    expect(ProjectKey.parse(key)).toBe(key);
  });

  it.each([
    ['too short', 'A'],
    ['too long', 'ABCDEFG'],
    ['starts with a digit', '1AB'],
    ['lowercase', 'pay'],
    ['dash', 'PA-Y'],
    ['underscore', 'PA_Y'],
    ['space', 'PA Y'],
    ['empty', ''],
    ['non-ASCII letter', 'PÄY'],
  ])('rejects %s', (_label, key) => {
    expect(ProjectKey.safeParse(key).success).toBe(false);
  });

  it('input form trims and upper-cases before validating', () => {
    expect(ProjectKeyInput.parse(' pay ')).toBe('PAY');
    expect(ProjectKeyInput.parse('web2')).toBe('WEB2');
    expect(ProjectKeyInput.safeParse('1ab').success).toBe(false);
    expect(ProjectKeyInput.safeParse('abcdefg').success).toBe(false);
  });

  it('reports a readable message', () => {
    const result = ProjectKey.safeParse('1AB');
    expect(result.error?.issues[0]?.message).toBe('Use 2 to 6 letters or digits, starting with a letter');
  });
});

describe('suggestProjectKey', () => {
  it.each([
    ['Payments', 'PAY'],
    ['Billing reconciliation', 'BIL'],
    ['Web app', 'WEB'],
    ['Infra', 'INF'],
    ['pm CLI', 'PMC'],
    ['2026 roadmap', 'ROA'],
    ['Ö-Bahn', 'OBA'],
    ['X', null],
    ['', null],
    ['!!!', null],
  ])('%s gives %s', (name, key) => {
    expect(suggestProjectKey(name)).toBe(key);
  });
});

describe('TaskKey', () => {
  it('parses into project key and number', () => {
    expect(parseTaskKey('PAY-142')).toEqual({ projectKey: 'PAY', number: 142 });
    expect(parseTaskKey('A1B2C3-7')).toEqual({ projectKey: 'A1B2C3', number: 7 });
  });

  it('accepts any case and surrounding spaces when parsing input', () => {
    expect(parseTaskKey(' pay-142 ')).toEqual({ projectKey: 'PAY', number: 142 });
    expect(TaskKeyInput.parse('web-1')).toBe('WEB-1');
  });

  it('accepts the largest Postgres integer', () => {
    expect(parseTaskKey('PAY-2147483647').number).toBe(2147483647);
  });

  it.each([
    ['number zero', 'PAY-0'],
    ['leading zero', 'PAY-01'],
    ['negative', 'PAY--1'],
    ['no dash', 'PAY142'],
    ['no number', 'PAY-'],
    ['bad project key', 'P-1'],
    ['project key too long', 'ABCDEFG-1'],
    ['project starts with digit', '1PAY-1'],
    ['over int4', 'PAY-2147483648'],
    ['eleven digits', 'PAY-12345678901'],
    ['trailing text', 'PAY-1x'],
    ['decimal', 'PAY-1.5'],
    ['empty', ''],
  ])('rejects %s', (_label, key) => {
    expect(safeParseTaskKey(key)).toBeNull();
    expect(() => parseTaskKey(key)).toThrow();
    expect(TaskKey.safeParse(key).success).toBe(false);
  });

  it('canonical schema is strict about case', () => {
    expect(TaskKey.safeParse('pay-1').success).toBe(false);
    expect(TaskKey.parse('PAY-1')).toBe('PAY-1');
  });

  it('formats and parses back', () => {
    const key = formatTaskKey('PAY', 142);
    expect(key).toBe('PAY-142');
    expect(parseTaskKey(key)).toEqual({ projectKey: 'PAY', number: 142 });
  });
});

describe('TaskStatus', () => {
  it('has a label for every status, in order', () => {
    expect(Object.keys(TASK_STATUS_LABELS)).toEqual([...TASK_STATUSES]);
    expect(TASK_STATUS_LABELS.in_progress).toBe('In progress');
    expect(TASK_STATUS_LABELS.in_review).toBe('In review');
  });

  it('knows which statuses are open', () => {
    expect(TASK_STATUSES.filter(isOpenStatus)).toEqual([...OPEN_TASK_STATUSES]);
    expect(isOpenStatus('done')).toBe(false);
    expect(isOpenStatus('canceled')).toBe(false);
  });

  it('rejects unknown values', () => {
    expect(TaskStatus.safeParse('in-progress').success).toBe(false);
    expect(TaskStatus.safeParse('Done').success).toBe(false);
  });
});

describe('Priority', () => {
  it('maps to and from database values 0 to 4', () => {
    expect(PRIORITIES.map(priorityToValue)).toEqual([0, 1, 2, 3, 4]);
    expect([0, 1, 2, 3, 4].map(priorityFromValue)).toEqual([...PRIORITIES]);
  });

  it('rejects database values out of range', () => {
    expect(() => priorityFromValue(5)).toThrow(RangeError);
    expect(() => priorityFromValue(-1)).toThrow(RangeError);
    expect(() => priorityFromValue(1.5)).toThrow(RangeError);
  });

  it('has display labels', () => {
    expect(Object.keys(PRIORITY_LABELS)).toEqual([...PRIORITIES]);
    expect(PRIORITY_LABELS.high).toBe('High');
  });

  it('rejects numeric input on the API', () => {
    expect(Priority.safeParse(3).success).toBe(false);
  });
});

describe('Timestamp', () => {
  it('turns a Date into an ISO string', () => {
    expect(Timestamp.parse(new Date('2026-10-22T18:19:06.997Z'))).toBe('2026-10-22T18:19:06.997Z');
  });

  it('normalises offsets to UTC', () => {
    expect(Timestamp.parse('2026-10-22T20:19:06+02:00')).toBe('2026-10-22T18:19:06.000Z');
  });

  it('is idempotent', () => {
    const once = Timestamp.parse(new Date('2026-10-22T18:19:06.997Z'));
    expect(Timestamp.parse(once)).toBe(once);
  });

  it.each([['not a date'], ['2026-10-22'], [new Date('invalid')], [1729621146997]])('rejects %s', (value) => {
    expect(Timestamp.safeParse(value).success).toBe(false);
  });
});
