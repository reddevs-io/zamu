import { describe, expect, it } from 'vitest';
import {
  checkedText,
  connectionsSubtitle,
  DEFAULT_HOSTS,
  deleteSentence,
  scopeHint,
  suggestedName,
  tokenPreview,
} from './format';

const NOW = Date.parse('2026-10-23T12:00:00Z');

describe('connections format', () => {
  it('describes when a connection was checked', () => {
    expect(checkedText('2026-10-23T11:59:40Z', NOW)).toBe('just now');
    expect(checkedText('2026-10-23T11:56:00Z', NOW)).toBe('4m ago');
    expect(checkedText('2026-10-23T11:00:00Z', NOW)).toBe('1h ago');
    expect(checkedText('2026-10-21T10:00:00Z', NOW)).toBe('Oct 21');
    expect(checkedText('2025-10-21T10:00:00Z', NOW)).toBe('Oct 21, 2025');
  });

  it('previews a pasted token without showing it', () => {
    expect(tokenPreview('glpat-abcdefghijklmnop3kd')).toBe('glpat-…3kd');
    expect(tokenPreview('  short  ')).toBe('');
  });

  it('suggests a name from the login', () => {
    expect(suggestedName('gitlab', 'reddevs')).toBe('GitLab · reddevs');
    expect(suggestedName('gitea', null)).toBe('Forgejo');
  });

  it('has hosts and scopes per provider', () => {
    expect(DEFAULT_HOSTS).toEqual({ github: 'github.com', gitlab: 'gitlab.com', gitea: '' });
    expect(scopeHint('gitlab').code).toEqual(['read_api']);
    expect(scopeHint('gitea').code).toEqual(['read:repository', 'read:user']);
  });

  it('words the subtitle per state', () => {
    expect(connectionsSubtitle('list', 4, true)).toBe(
      '4 connections. Projects use them to read Backlog.md from a repository.',
    );
    expect(connectionsSubtitle('list', 1, true)).toMatch(/^1 connection\./);
    expect(connectionsSubtitle('list', 4, false)).toBe(
      'Connections to git providers. Projects use them to read Backlog.md.',
    );
    expect(connectionsSubtitle('empty', 0, true)).toMatch(/^Read access to GitHub/);
    expect(connectionsSubtitle('loading', 0, true)).toBe(
      'Projects use connections to read Backlog.md from a repository.',
    );
  });

  it('says which mirrors a delete pauses', () => {
    expect(deleteSentence(3)).toBe(
      'Three projects read Backlog.md through this connection. Their mirrors pause until you pick another connection for them. Their tasks stay as they are.',
    );
    expect(deleteSentence(1)).toMatch(/^One project reads .* Its mirror pauses .* for it\. Its tasks stay/);
    expect(deleteSentence(0)).toBe('No project reads Backlog.md through this connection.');
    expect(deleteSentence(7)).toMatch(/^7 projects read/);
  });
});
