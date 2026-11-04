import { TaskListItem } from '@pm/contracts';
import { taskListItemFixture } from '@pm/contracts/testing/fixtures';
import { describe, expect, it } from 'vitest';
import { buildListGroups } from './groups';

const item = (key: string, parentKey: string | null): TaskListItem =>
  TaskListItem.parse({ ...taskListItemFixture, key, title: key, status: 'todo', parentKey });

describe('buildListGroups nesting', () => {
  it('puts a subtask of a subtask under the top-level ancestor', () => {
    const lists = [[item('API-12', null), item('API-12.1', 'API-12'), item('API-12.1.2', 'API-12.1')]];
    const [group] = buildListGroups({ lists, groupBy: 'status', nested: true });
    expect(group?.entries.map((entry) => entry.task.key)).toEqual(['API-12']);
    expect(group?.entries[0]?.children.map((child) => child.key)).toEqual(['API-12.1', 'API-12.1.2']);
  });

  it('keeps tasks whose parents loop at the top', () => {
    const lists = [[item('API-1', 'API-2'), item('API-2', 'API-1'), item('API-3', 'API-3')]];
    const [group] = buildListGroups({ lists, groupBy: 'status', nested: true });
    expect(group?.entries.map((entry) => entry.task.key).sort()).toEqual(['API-1', 'API-2', 'API-3']);
  });
});
