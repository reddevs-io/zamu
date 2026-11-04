import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  readTaskNavigation,
  rememberTaskNavigation,
  TASK_NAV_STORAGE_KEY,
  taskNavigationFor,
  useTaskNavigation,
} from './navigation';

function Header({ taskKey }: { taskKey: string }) {
  const nav = useTaskNavigation(taskKey);
  return (
    <output data-testid="nav">
      {nav.label ?? 'none'}|{nav.prev ?? '-'}|{nav.next ?? '-'}|{nav.returnTo ?? '-'}
    </output>
  );
}

beforeEach(() => sessionStorage.clear());

describe('navigation memory', () => {
  it('keeps the view’s keys in session storage and finds the task in them', () => {
    rememberTaskNavigation({
      keys: ['PAY-1', 'PAY-7', 'PAY-3'],
      from: 'List',
      returnTo: '/p/PAY?status=todo',
    });
    expect(JSON.parse(sessionStorage.getItem(TASK_NAV_STORAGE_KEY) ?? 'null')).toEqual({
      keys: ['PAY-1', 'PAY-7', 'PAY-3'],
      from: 'List',
      returnTo: '/p/PAY?status=todo',
    });
    render(<Header taskKey="PAY-7" />);
    expect(screen.getByTestId('nav')).toHaveTextContent('2 of 3 in List|PAY-1|PAY-3|/p/PAY?status=todo');
  });

  it('follows a new list and has no position for tasks outside it', () => {
    rememberTaskNavigation({ keys: ['PAY-1', 'PAY-7'], from: 'List' });
    const { rerender } = render(<Header taskKey="PAY-1" />);
    expect(screen.getByTestId('nav')).toHaveTextContent('1 of 2 in List|-|PAY-7|-');
    act(() => rememberTaskNavigation({ keys: ['HBR-4', 'PAY-1', 'PAY-9'], from: 'Home' }));
    expect(screen.getByTestId('nav')).toHaveTextContent('2 of 3 in Home|HBR-4|PAY-9|-');
    rerender(<Header taskKey="PAY-42" />);
    expect(screen.getByTestId('nav')).toHaveTextContent('none|-|-|-');
  });

  it('keeps long lists centred on the opened task', () => {
    const keys = Array.from({ length: 5000 }, (_, index) => `PAY-${index + 1}`);
    rememberTaskNavigation({ keys, from: 'Board' }, 'PAY-4000');
    const list = readTaskNavigation();
    expect(list?.keys).toHaveLength(2000);
    expect(taskNavigationFor(list, 'PAY-4000').next).toBe('PAY-4001');
  });

  it('ignores unreadable storage', () => {
    sessionStorage.setItem(TASK_NAV_STORAGE_KEY, '{not json');
    expect(readTaskNavigation()).toBeNull();
    expect(taskNavigationFor(null, 'PAY-1')).toMatchObject({ position: null, label: null });
  });
});
