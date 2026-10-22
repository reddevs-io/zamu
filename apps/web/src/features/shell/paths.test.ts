import { describe, expect, it } from 'vitest';
import { projectHref, projectKeyFromPath } from './paths';

describe('projectKeyFromPath', () => {
  it('reads the key from task list and task URLs', () => {
    expect(projectKeyFromPath('/p/PAY')).toBe('PAY');
    expect(projectKeyFromPath('/p/pay/PAY-142')).toBe('PAY');
    expect(projectKeyFromPath('/projects')).toBeUndefined();
    expect(projectKeyFromPath('/settings/members')).toBeUndefined();
    expect(projectKeyFromPath('/p/%E0%A4%A')).toBeUndefined();
  });

  it('builds the task list URL', () => {
    expect(projectHref('PAY')).toBe('/p/PAY');
  });
});
