import { describe, expect, it } from 'vitest';
import { normalizeKeyInput, suggestKey, validateNewProject } from './validation';

describe('suggestKey', () => {
  it.each([
    ['Billing reconciliation', 'BIL'],
    ['Payments', 'PAY'],
    ['pm CLI', 'PMC'],
    ['Web app', 'WEB'],
    ['Q3 roadmap', 'Q3R'],
    ['2026 roadmap', 'ROA'],
    ['Café opening', 'CAF'],
    ['  ', ''],
    ['', ''],
    ['42', ''],
    ['!!!', ''],
  ])('%j → %j', (name, key) => {
    expect(suggestKey(name)).toBe(key);
  });
});

describe('normalizeKeyInput', () => {
  it('upper-cases, drops spaces and caps at 6 characters', () => {
    expect(normalizeKeyInput('bil')).toBe('BIL');
    expect(normalizeKeyInput(' b i l ')).toBe('BIL');
    expect(normalizeKeyInput('abcdefgh')).toBe('ABCDEF');
  });
});

describe('validateNewProject', () => {
  it('returns the contract input with a trimmed name and no empty description', () => {
    expect(validateNewProject({ name: '  Billing  ', key: 'bil', description: '   ' })).toEqual({
      ok: true,
      input: { name: 'Billing', key: 'BIL' },
    });
    expect(validateNewProject({ name: 'Billing', key: 'BIL', description: ' Stripe payouts ' })).toEqual({
      ok: true,
      input: { name: 'Billing', key: 'BIL', description: 'Stripe payouts' },
    });
  });

  it('reports one message per field', () => {
    expect(validateNewProject({ name: ' ', key: '', description: '' })).toEqual({
      ok: false,
      errors: {
        name: 'Enter a project name.',
        key: 'Use 2 to 6 letters or digits, starting with a letter.',
      },
    });
  });

  it.each(['B', '1AB', 'AB-C', 'ABCDEFG'])('rejects the key %j', (key) => {
    const result = validateNewProject({ name: 'Billing', key, description: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(['key']);
  });

  it('rejects names over 100 and descriptions over 2,000 characters', () => {
    const result = validateNewProject({ name: 'x'.repeat(101), key: 'BIL', description: 'y'.repeat(2001) });
    expect(result).toEqual({
      ok: false,
      errors: { name: 'Use 100 characters or fewer.', description: 'Use 2,000 characters or fewer.' },
    });
  });
});
