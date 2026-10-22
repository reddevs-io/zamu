import type { TaskListItem, TaskStatus } from '@pm/contracts';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePageSearchRef } from '~/features/shell/page-search';
import { useOptionalQuickCreate } from '~/features/shell/quick-create';
import {
  Banner,
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  type OptionItem,
  PageHeader,
  SearchField,
  Select,
  useHotkeys,
} from '~/ui';
import { useNow } from './clock';
import { describeError } from './errors';
import { buildGroups, visibleKeys } from './groups';
import { rememberListSearch } from './list-memory';
import { membersQuery, projectsQuery, type TaskListData, taskListQuery, taskQuery } from './queries';
import {
  eagerStatuses,
  filtersOf,
  hasFilters,
  LAZY_STATUSES,
  listInput,
  type TaskListFilters,
  type TaskListSearch,
  visibleStatuses,
} from './search';
import { useUrlSelection } from './selection';
import { PaneSkeleton, RequestHint, TaskDetailPane } from './TaskDetailPane';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from './TaskFields';
import { taskColumns } from './TaskTable';

// /p/$projectKey: the task table grouped by status, with the selected task in a permanent pane.
// Selection and filters live in the URL (?task=PAY-142&q=…), so reloads and shared links restore them.

export interface TaskListScreenProps {
  projectKey: string;
  search: TaskListSearch;
}

const ANY = 'any';
const SEARCH_DEBOUNCE_MS = 200;

const pickItems = (results: { data?: TaskListData }[]) => results.map((result) => result.data?.items);

export function TaskListScreen({ projectKey, search }: TaskListScreenProps) {
  const navigate = useNavigate();
  const quickCreate = useOptionalQuickCreate();
  const filters = useMemo(() => filtersOf(search), [search]);

  useEffect(() => rememberListSearch(projectKey, search), [projectKey, search]);

  const writeSearch = (update: (previous: TaskListSearch) => TaskListSearch) =>
    navigate({ to: '/p/$projectKey', params: { projectKey }, search: update as never, replace: true });
  const { selected, select, selectedRef, noteWrite } = useUrlSelection(search.task ?? null, (task) =>
    writeSearch((previous) => ({ ...previous, task: task ?? undefined })),
  );
  /** Changes filters; the URL keeps the current selection, even one not written yet. */
  const setSearch = (update: (previous: TaskListSearch) => TaskListSearch) => {
    const task = selectedRef.current;
    noteWrite(task);
    return writeSearch((previous) => ({ ...update(previous), task: task ?? undefined }));
  };
  const setSearchRef = useRef(setSearch);
  setSearchRef.current = setSearch;
  const openPage = (key: string) =>
    navigate({ to: '/p/$projectKey/$taskKey', params: { projectKey, taskKey: key } });

  // ---- Data ---------------------------------------------------------------------------------------
  const project = useQuery({
    ...projectsQuery(),
    select: (data) => data.items.find((item) => item.key === projectKey),
  }).data;
  const members = useQuery(membersQuery()).data?.items;

  const [collapsed, setCollapsed] = useCollapsedGroups(filters);
  const eager = useQuery(taskListQuery(listInput(projectKey, filters, eagerStatuses(filters))));
  const lazyStatuses = filters.status ? [] : LAZY_STATUSES.filter((status) => !collapsed.has(status));
  const lazyItems = useQueries({
    queries: lazyStatuses.map((status) => taskListQuery(listInput(projectKey, filters, [status]))),
    combine: pickItems,
  });

  const counts = eager.data?.counts;
  const lazyKey = lazyItems.map((items) => items?.length ?? -1).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: lazyKey stands for lazyItems' contents
  const groups = useMemo(
    () =>
      buildGroups(
        [eager.data?.items ?? [], ...lazyItems.map((items) => items ?? [])],
        visibleStatuses(filters),
        counts,
      ),
    [eager.data, lazyKey, filters, counts],
  );
  const itemsByKey = useMemo(() => {
    const map = new Map<string, TaskListItem>();
    for (const group of groups) for (const item of group.items) map.set(item.key, item);
    return map;
  }, [groups]);
  const preview = selected ? itemsByKey.get(selected) : undefined;

  // Expand the group of a newly selected task (a task just created in Backlog, a link to a Done task).
  const selectedTask = useQuery({ ...taskQuery(selected ?? ''), enabled: selected != null && !preview }).data;
  const selectedStatus = preview?.status ?? selectedTask?.status;
  const expandedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!selected || !selectedStatus || expandedFor.current === selected) return;
    expandedFor.current = selected;
    if (collapsed.has(selectedStatus)) {
      setCollapsed((previous) => {
        const next = new Set(previous);
        next.delete(selectedStatus);
        return next;
      });
    }
  }, [selected, selectedStatus, collapsed, setCollapsed]);

  // ---- Keyboard -----------------------------------------------------------------------------------
  const tableRef = useRef<HTMLDivElement>(null);
  // The shell's / shortcut focuses this field.
  const searchRef = usePageSearchRef();
  const order = useMemo(() => visibleKeys(groups, collapsed), [groups, collapsed]);

  const focusRow = (key: string) =>
    requestAnimationFrame(() => {
      const root = tableRef.current;
      const row = root?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
      (row ?? root?.querySelector<HTMLElement>('[role="grid"]'))?.focus();
    });

  // Reads the last requested selection, not the rendered one, so quick presses each move one row.
  const move = (step: 1 | -1) => {
    if (!order.length) return;
    const current = selectedRef.current;
    const index = current ? order.indexOf(current) : -1;
    const next =
      index < 0
        ? order[step === 1 ? 0 : order.length - 1]
        : order[Math.min(order.length - 1, Math.max(0, index + step))];
    if (!next) return;
    select(next);
    focusRow(next);
  };
  // J/K move between tasks and skip group rows, inside the table and from anywhere on the page. (Arrow keys
  // keep the table's own behaviour, which also visits group rows so they can be collapsed.)
  const onTableKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'j' && key !== 'k') return;
    if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    move(key === 'j' ? 1 : -1);
  };

  useHotkeys({
    Escape: { handler: () => select(null), enabled: selected != null },
    j: () => move(1),
    k: () => move(-1),
    Enter: {
      enabled: selected != null,
      preventDefault: false,
      handler: (event) => {
        const current = selectedRef.current;
        if (current && (event.target === document.body || event.target === document.documentElement)) {
          event.preventDefault();
          openPage(current);
        }
      },
    },
  });

  // ---- Search box: local text, debounced into the URL ---------------------------------------------
  const [query, setQuery] = useState(search.q ?? '');
  const lastPushed = useRef(search.q ?? '');
  useEffect(() => {
    // Back/forward or a link changed q: show it.
    if ((search.q ?? '') !== lastPushed.current) {
      lastPushed.current = search.q ?? '';
      setQuery(search.q ?? '');
    }
  }, [search.q]);
  useEffect(() => {
    if (query === lastPushed.current) return;
    const timer = setTimeout(() => {
      lastPushed.current = query;
      setSearchRef.current((previous) => ({ ...previous, q: query.trim() ? query : undefined }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const clearFilters = () => {
    setQuery('');
    lastPushed.current = '';
    setSearch(() => ({}));
  };

  // ---- Rendering ----------------------------------------------------------------------------------
  const now = useNow();
  const columns = useMemo(() => taskColumns(now), [now]);
  const total = counts ? Object.values(counts).reduce((sum, value) => sum + value, 0) : undefined;
  const filtered = hasFilters(search);
  const isEmptyProject = total === 0 && !filtered;
  const listError = eager.isError && !eager.data ? describeError(eager.error) : null;

  const newTask = () => quickCreate?.open(projectKey);

  const assigneeItems = useMemo<OptionItem[]>(
    () => [
      { id: ANY, label: 'Any' },
      { id: 'me', label: 'Me' },
      { id: 'agents', label: 'Agents' },
      ...(members ?? []).map((member) => ({
        id: member.id,
        label: member.name,
        avatar: { name: member.name, kind: member.kind },
      })),
    ],
    [members],
  );

  const renderEmpty = () => {
    if (listError) {
      return (
        <div className="px-6 py-4">
          <Banner
            action={
              <Button
                variant="secondary"
                size="sm"
                isPending={eager.isFetching}
                onPress={() => eager.refetch()}
              >
                Retry
              </Button>
            }
          >
            Couldn't load tasks. {listError.message}
          </Banner>
          {listError.requestId ? (
            <RequestHint requestId={listError.requestId} prefix="Your filters are kept." />
          ) : (
            <p className="m-0 mt-2.5 text-[11.5px] text-muted">Your filters are kept.</p>
          )}
        </div>
      );
    }
    if (isEmptyProject) {
      return (
        <div className="flex px-6 py-12">
          <EmptyState
            title="No tasks yet"
            text="Create the first one here, or have an agent create it from the CLI."
            action={
              <Button kbd="C" onPress={newTask}>
                New task
              </Button>
            }
            cli={{ command: `pm tasks create --project ${projectKey} "Match Stripe payouts to invoices"` }}
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col items-start gap-2 px-6 py-8 text-muted">
        <span>No tasks match these filters.</span>
        <Button variant="secondary" size="sm" onPress={clearFilters}>
          Clear filters
        </Button>
      </div>
    );
  };

  // The header and filters do not depend on the selection, so J/K does not re-render them.
  const actions = useRef({ enterTable: () => {}, newTask: () => {}, clearFilters: () => {}, setSearch });
  actions.current = {
    enterTable: () => {
      const current = selectedRef.current;
      const first = current ?? order[0];
      if (!first) return;
      if (!current) select(first);
      focusRow(first);
    },
    newTask,
    clearFilters,
    setSearch,
  };
  const projectName = project?.name;
  const openCount = project?.openCount;
  const subtitleText = isEmptyProject
    ? 'no tasks yet'
    : openCount != null
      ? `${openCount} open · grouped by status`
      : 'grouped by status';
  const header = useMemo(
    () => (
      <>
        <PageHeader
          title={projectName ?? projectKey}
          subtitle={
            <>
              <span className="font-mono">{projectKey}</span> · {subtitleText}
            </>
          }
          actions={
            <>
              <SearchField
                width={140}
                value={query}
                onChange={setQuery}
                inputRef={searchRef}
                aria-label="Search tasks"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    actions.current.enterTable();
                  } else {
                    event.continuePropagation();
                  }
                }}
              />
              <Button kbd="C" onPress={() => actions.current.newTask()} aria-keyshortcuts="c">
                New
              </Button>
            </>
          }
        />
        <FilterBar
          end={
            filtered ? (
              <Button
                variant="ghost"
                size="sm"
                className="px-0 font-normal"
                onPress={() => actions.current.clearFilters()}
              >
                Clear
              </Button>
            ) : undefined
          }
        >
          <Select
            label="Status"
            variant="filter"
            selectionMode="multiple"
            items={STATUS_OPTIONS}
            value={search.status ?? []}
            onChange={(keys) =>
              actions.current.setSearch((previous) => ({
                ...previous,
                status: keys.length ? (keys.map(String) as TaskStatus[]) : undefined,
              }))
            }
          />
          <Select
            label="Priority"
            variant="filter"
            selectionMode="multiple"
            items={PRIORITY_OPTIONS}
            value={search.priority ?? []}
            onChange={(keys) =>
              actions.current.setSearch((previous) => ({
                ...previous,
                priority: keys.length ? (keys.map(String) as TaskListFilters['priority']) : undefined,
              }))
            }
          />
          <Select
            label="Assignee"
            variant="filter"
            items={assigneeItems}
            value={search.assignee ?? ANY}
            onChange={(key) =>
              actions.current.setSearch((previous) => ({
                ...previous,
                assignee: key == null || key === ANY ? undefined : String(key),
              }))
            }
          />
        </FilterBar>
      </>
    ),
    [
      projectKey,
      projectName,
      subtitleText,
      query,
      searchRef,
      filtered,
      search.status,
      search.priority,
      search.assignee,
      assigneeItems,
    ],
  );

  return (
    <div className="grid h-dvh min-h-0 flex-1 grid-cols-[600px_minmax(0,1fr)] bg-bg text-fg">
      <section aria-label="Tasks" className="flex min-h-0 min-w-0 flex-col border-r border-line">
        {header}
        <div ref={tableRef} onKeyDownCapture={onTableKeyDownCapture} className="flex min-h-0 flex-1 flex-col">
          <DataTable
            aria-label={`Tasks in ${project?.name ?? projectKey}`}
            columns={columns}
            groups={listError || isEmptyProject ? [] : groups}
            getKey={(task) => task.key}
            isLoading={eager.isPending}
            selectedKey={selected}
            onSelectionChange={(key) => select(key)}
            onRowAction={(key) => openPage(key)}
            collapsedGroups={collapsed}
            onCollapsedGroupsChange={setCollapsed}
            renderEmptyState={renderEmpty}
          />
        </div>
      </section>
      <section aria-label="Task detail" className="flex min-h-0 min-w-0 flex-col">
        {selected ? (
          <TaskDetailPane
            key={selected}
            projectKey={projectKey}
            taskKey={selected}
            preview={preview}
            onClose={() => {
              select(null);
            }}
          />
        ) : eager.isPending ? (
          <PaneSkeleton />
        ) : (
          <div className="grid flex-1 place-items-center text-faint">
            {isEmptyProject ? 'Tasks you select show here.' : 'Nothing selected'}
          </div>
        )}
      </section>
    </div>
  );
}

/** Backlog, Done and Canceled start collapsed; with a status filter every chosen group is open. */
function useCollapsedGroups(filters: TaskListFilters) {
  const initial = () => new Set<string>(filters.status ? [] : LAZY_STATUSES);
  const [collapsed, setCollapsed] = useState<Set<string>>(initial);
  const statusKey = filters.status?.join(',') ?? '';
  const previousKey = useRef(statusKey);
  useEffect(() => {
    if (previousKey.current === statusKey) return;
    previousKey.current = statusKey;
    setCollapsed(new Set<string>(statusKey ? [] : LAZY_STATUSES));
  }, [statusKey]);
  return [collapsed, setCollapsed] as const;
}
