import { describe, expect, it } from 'vitest';
import { commentUrlTransform, insertMention, mentionAt, mentionId, mentionMarkdown } from './mentions';

describe('mentionAt', () => {
  it('finds the @word before the caret', () => {
    expect(mentionAt('Can you @cl', 11)).toEqual({ start: 8, query: 'cl' });
    expect(mentionAt('@', 1)).toEqual({ start: 0, query: '' });
    expect(mentionAt('(@ana', 5)).toEqual({ start: 1, query: 'ana' });
  });

  it('ignores emails, finished words and text after the caret', () => {
    expect(mentionAt('mail ana@example.com', 20)).toBeNull();
    expect(mentionAt('@cl done', 8)).toBeNull();
    expect(mentionAt('hi @cl', 2)).toBeNull();
  });
});

describe('insertMention', () => {
  const claude = { id: 'u-1', name: 'claude-dev' };

  it('replaces the @query with the link and a space, and moves the caret after it', () => {
    const text = 'Thanks @cl';
    const result = insertMention(text, { start: 7, query: 'cl' }, 10, claude);
    expect(result.text).toBe('Thanks [@claude-dev](mention:u-1) ');
    expect(result.caret).toBe(result.text.length);
  });

  it('keeps the text after the caret without doubling the space', () => {
    const result = insertMention('Hi @an there', { start: 3, query: 'an' }, 6, {
      id: 'u-2',
      name: 'Ana Ruiz',
    });
    expect(result.text).toBe('Hi [@Ana Ruiz](mention:u-2) there');
  });

  it('escapes brackets in names', () => {
    expect(mentionMarkdown({ id: 'u-3', name: 'bot [ci]' })).toBe('[@bot \\[ci\\]](mention:u-3)');
  });
});

describe('links', () => {
  it('keeps mention: and http(s) links only', () => {
    expect(commentUrlTransform('mention:u-1')).toBe('mention:u-1');
    expect(commentUrlTransform('https://example.com/a')).toBe('https://example.com/a');
    expect(commentUrlTransform('http://example.com')).toBe('http://example.com');
    expect(commentUrlTransform('javascript:alert(1)')).toBe('');
    expect(commentUrlTransform('data:text/html,x')).toBe('');
    expect(commentUrlTransform('/settings')).toBe('');
    expect(commentUrlTransform('mailto:a@b.c')).toBe('');
  });

  it('reads the user id of a mention link', () => {
    expect(mentionId('mention:u-1')).toBe('u-1');
    expect(mentionId('MENTION:u-1')).toBe('u-1');
    expect(mentionId('https://x')).toBeNull();
    expect(mentionId(undefined)).toBeNull();
  });
});
