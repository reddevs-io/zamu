import { describe, expect, it } from 'vitest';
import { byLastActivity, filterProjects, latestProjectKey } from './order';
import { shortAge } from './time';

const projects = [
  {
    key: 'PAY',
    name: 'Payments',
    description: 'Checkout and webhooks',
    lastActivityAt: '2026-10-20T10:00:00.000Z',
  },
  { key: 'WEB', name: 'Web app', description: null, lastActivityAt: '2026-10-22T09:00:00.000Z' },
  {
    key: 'CLI',
    name: 'pm CLI',
    description: 'Command-line client',
    lastActivityAt: '2026-10-22T09:00:00.000Z',
  },
];

describe('byLastActivity', () => {
  it('sorts the most recently updated first, then by key', () => {
    expect(byLastActivity(projects).map((p) => p.key)).toEqual(['CLI', 'WEB', 'PAY']);
  });

  it('gives the redirect target for "/"', () => {
    expect(latestProjectKey(projects)).toBe('CLI');
    expect(latestProjectKey([])).toBeUndefined();
  });
});

describe('filterProjects', () => {
  it('matches key, name and description without case', () => {
    expect(filterProjects(projects, 'web').map((p) => p.key)).toEqual(['PAY', 'WEB']);
    expect(filterProjects(projects, ' cli ').map((p) => p.key)).toEqual(['CLI']);
    expect(filterProjects(projects, '').length).toBe(3);
    expect(filterProjects(projects, 'nothing')).toEqual([]);
  });
});

describe('shortAge', () => {
  const now = new Date('2026-10-22T12:00:00.000Z');
  it.each([
    ['2026-10-22T11:59:30.000Z', 'now'],
    ['2026-10-22T11:57:00.000Z', '3m'],
    ['2026-10-22T11:00:00.000Z', '1h'],
    ['2026-10-20T11:00:00.000Z', '2d'],
    ['2026-08-01T12:00:00.000Z', 'Aug 1'],
    ['2025-08-01T12:00:00.000Z', 'Aug 1 2025'],
    ['not a date', '–'],
  ])('%s → %s', (iso, expected) => {
    expect(shortAge(iso, now)).toBe(expected);
  });
});
