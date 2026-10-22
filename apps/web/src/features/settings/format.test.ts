import { describe, expect, it } from 'vitest';
import {
  emailInitials,
  formatAgo,
  formatExpiry,
  formatShortDate,
  membersSummary,
  scopeSentence,
  scopeText,
} from './format';

const now = new Date('2026-10-22T12:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const pay = { id: '20000000-0000-4000-8000-000000000001', key: 'PAY', name: 'Payments' };
const cli = { id: '20000000-0000-4000-8000-000000000002', key: 'CLI', name: 'pm CLI' };
const docs = { id: '20000000-0000-4000-8000-000000000003', key: 'DOCS', name: 'Docs' };

describe('settings format', () => {
  it('formats last active like the design', () => {
    expect(formatAgo(minutesAgo(0.5), now)).toBe('Now');
    expect(formatAgo(minutesAgo(20), now)).toBe('20m');
    expect(formatAgo(minutesAgo(3 * 60), now)).toBe('3h');
    expect(formatAgo(minutesAgo(2 * 24 * 60), now)).toBe('2d');
    expect(formatAgo(minutesAgo(40 * 24 * 60), now)).toBe(formatShortDate(minutesAgo(40 * 24 * 60), now));
  });

  it('formats dates, adding the year only outside the current one', () => {
    expect(formatShortDate('2026-10-20T12:00:00Z', now)).toBe('Oct 20');
    expect(formatShortDate('2025-08-02T12:00:00Z', now)).toBe('Aug 2, 2025');
  });

  it('rounds invitation expiry up to whole days', () => {
    expect(formatExpiry('2026-10-28T09:00:00Z', now)).toBe('expires in 6 days');
    expect(formatExpiry('2026-10-23T11:00:00Z', now)).toBe('expires in 23 hours');
    expect(formatExpiry('2026-10-22T11:00:00Z', now)).toBe('expired');
  });

  it('describes key scopes for the table and the reveal dialog', () => {
    expect(scopeText({ projects: 'all', access: 'write' })).toBe('Workspace · read and write');
    expect(scopeText({ projects: [pay, cli], access: 'read' })).toBe('PAY, CLI · read only');
    expect(scopeSentence({ projects: [docs, cli], access: 'write' })).toBe(
      'Scope: DOCS and CLI, read and write.',
    );
    expect(scopeSentence({ projects: [docs, cli, pay], access: 'write' })).toBe(
      'Scope: DOCS, CLI and PAY, read and write.',
    );
    expect(scopeSentence({ projects: 'all', access: 'read' })).toBe('Scope: whole workspace, read only.');
  });

  it('summarises members and derives invitation initials', () => {
    expect(membersSummary(4, 3, 'Reddevs')).toBe('4 people and 3 agents in Reddevs');
    expect(membersSummary(1, 1, undefined)).toBe('1 person and 1 agent');
    expect(emailInitials('jo.park@reddevs.io')).toBe('JP');
    expect(emailInitials('tomas@reddevs.io')).toBe('T');
  });
});
