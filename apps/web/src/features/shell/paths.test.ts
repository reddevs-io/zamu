import { describe, expect, it } from 'vitest';
import {
  projectHref,
  projectKeyFromPath,
  projectPageFromLocation,
  projectPageHref,
  taskHref,
  taskKeyFromPath,
} from './paths';

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

describe('project pages', () => {
  it('links every page the sidebar lists', () => {
    expect(projectPageHref('PAY', 'list')).toBe('/p/PAY');
    expect(projectPageHref('PAY', 'board')).toBe('/p/PAY?view=board');
    expect(projectPageHref('PAY', 'milestones')).toBe('/p/PAY/milestones');
    expect(projectPageHref('PAY', 'cycles')).toBe('/p/PAY/cycles');
    expect(projectPageHref('PAY', 'settings')).toBe('/p/PAY/settings');
  });

  it('knows which page the URL shows', () => {
    expect(projectPageFromLocation('/p/PAY', {})).toBe('list');
    expect(projectPageFromLocation('/p/PAY', { view: 'board' })).toBe('board');
    expect(projectPageFromLocation('/p/PAY/milestones/abc', {})).toBe('milestones');
    expect(projectPageFromLocation('/p/PAY/cycles/12', {})).toBe('cycles');
    expect(projectPageFromLocation('/p/PAY/settings/backlog', {})).toBe('settings');
    expect(projectPageFromLocation('/p/PAY/PAY-142', {})).toBeUndefined();
    expect(projectPageFromLocation('/', {})).toBeUndefined();
  });
});

describe('task URLs', () => {
  it('reads the task key of the task view only', () => {
    expect(taskKeyFromPath('/p/PAY/PAY-142')).toBe('PAY-142');
    expect(taskKeyFromPath('/p/PAY/pay-786.1')).toBe('PAY-786.1');
    expect(taskKeyFromPath('/p/PAY/milestones')).toBeUndefined();
    expect(taskKeyFromPath('/p/PAY/settings')).toBeUndefined();
    expect(taskKeyFromPath('/p/PAY')).toBeUndefined();
    expect(taskKeyFromPath('/p/PAY/milestones/abc')).toBeUndefined();
  });

  it('builds the task view URL from the key', () => {
    expect(taskHref('PAY-142')).toBe('/p/PAY/PAY-142');
    expect(taskHref('PAY-786.1')).toBe('/p/PAY/PAY-786.1');
  });
});
