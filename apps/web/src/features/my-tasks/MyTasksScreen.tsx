import { CYCLE_CURRENT, CYCLE_NEXT, FILTER_NONE, safeParseTaskKey, type TaskListItem } from '@pm/contracts';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePageSearchRef } from '~/features/shell/page-search';
import { PROJECTS_HREF } from '~/features/shell/paths';
import { useOptionalQuickCreate } from '~/features/shell/quick-create';
import { useNow } from '~/features/tasks/clock';
import { describeError } from '~/features/tasks/errors';
import { meQuery, projectsQuery, taskListQuery } from '~/features/tasks/queries';
import { useUrlSelection } from '~/features/tasks/selection';
import { RequestHint, TaskDetailPane } from '~/features/tasks/TaskDetailPane';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '~/features/tasks/TaskFields';
import { orpc } from '~/lib/orpc';
import {
  Banner,
  Button,
  cn,
  DataTable,
  EmptyState,
  FilterBar,
  MilestoneGlyph,
  NoneGlyph,
  type OptionItem,
  PageHeader,
  SearchField,
  Select,
  useHotkeys,
} from '~/ui';
import { myTaskColumns } from './columns';
import { buildMyGroups, myTasksSubtitle, rowOrder } from './groups';
import {
  filtersOf,
  hasFilters,
  listInput,
  type MyCycleFilter,
  type MyTasksSearch,
  shownStatuses,
} from './search';

// /my-tasks: tasks assigned to the caller across every readable project, grouped by status and sorted by
// priority. Selecting a row opens the task panel on the right; filters and the selection live in the URL.

export interface MyTasksScreenProps {
  search: MyTasksSearch;
}

const ANY = 'any';
const SEARCH_DEBOUNCE_MS = 200;

const CYCLE_OPTIONS: OptionItem[] = [
  { id: ANY, label: 'Any' },
  { id: CYCLE_CURRENT, label: 'Current' },
  { id: CYCLE_NEXT, label: 'Next' },
  { id: FILTER_NONE, label: 'No cycle', prefix: <NoneGlyph shape="circle" /> },
];

/** The project key of a task key ("WEB-88" gives "WEB"). */
function projectKeyOf(taskKey: string): string | undefined {
  return safeParseTaskKey(taskKey)?.projectKey;
}

export function MyTasksScreen({ search }: MyTasksScreenProps) {
  const navigate = useNavigate();
  const quickCreate = useOptionalQuickCreate();
  const filters = useMemo(() => filtersOf(search), [search]);

  const writeSearch = (update: (previous: MyTasksSearch) => MyTasksSearch) =>
    navigate({ to: '/my-tasks', search: update as never, replace: true });
  const { selected, select, selectedRef, noteWrite } = useUrlSelection(search.task ?? null, (task) =>
    writeSearch((previous) => ({ ...previous, task: task ?? undefined })),
  );
  /** Changes filters; the URL keeps the current selection, even one not written yet. */
  const setSearch = (update: (previous: MyTasksSearch) => MyTasksSearch) => {
    const task = selectedRef.current;
    noteWrite(task);
    return writeSearch((previous) => ({ ...update(previous), task: task ?? undefined }));
  };
  const setSearchRef = useRef(setSearch);
  setSearchRef.current = setSearch;

  // ---- Data ---------------------------------------------------------------------------------------
  const list = useQuery(taskListQuery(listInput(filters)));
  const me = useQuery(meQuery()).data;
  const projects = useQuery(projectsQuery()).data?.items;
  const workspace = me?.workspace.name;

  // Milestone filter: the milestones of the projects in view that use them.
  const milestoneProjects = useMemo(
    () =>
      (projects ?? []).filter(
        (project) => project.usesMilestones && (!filters.project || filters.project.includes(project.key)),
      ),
    [projects, filters.project],
  );
  const milestones = useQueries({
    queries: milestoneProjects.map((project) =>
      orpc.milestones.list.queryOptions({ input: { project: project.key }, staleTime: 60_000 }),
    ),
    combine: (results) => results.flatMap((result) => result.data?.items ?? []),
  });

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const items = list.data?.items;
  const statuses = useMemo(() => shownStatuses(filters), [filters]);
  const groups = useMemo(() => buildMyGroups(items ?? [], statuses), [items, statuses]);
  const itemsByKey = useMemo(() => new Map((items ?? []).map((item) => [item.key, item])), [items]);
  const preview = selected ? itemsByKey.get(selected) : undefined;
  const panelProjectKey = selected ? (preview?.project.key ?? projectKeyOf(selected)) : undefined;
  const isPanelOpen = selected != null && panelProjectKey != null;

  // ---- Keyboard -----------------------------------------------------------------------------------
  const tableRef = useRef<HTMLDivElement>(null);
  const searchRef = usePageSearchRef();
  const order = useMemo(() => rowOrder(groups, collapsed), [groups, collapsed]);

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
  });

  // ---- Search box: local text, debounced into the URL ---------------------------------------------
  const [query, setQuery] = useState(search.q ?? '');
  const lastPushed = useRef(search.q ?? '');
  useEffect(() => {
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
  const columns = useMemo(() => myTaskColumns(now, isPanelOpen), [now, isPanelOpen]);
  const filtered = hasFilters(search);
  const listError = list.isError && !list.data ? describeError(list.error) : null;
  const isEmpty = list.data !== undefined && list.data.items.length === 0;
  const subtitle = list.data
    ? myTasksSubtitle({
        counts: list.data.counts,
        items: list.data.items,
        openOnly: !filters.status,
        workspace,
        compact: isPanelOpen,
      })
    : (workspace ?? '');

  const projectItems = useMemo<OptionItem[]>(
    () =>
      (projects ?? []).map((project) => ({
        id: project.key,
        label: project.name,
        prefix: <span className="w-9 font-mono text-[10px] text-muted">{project.key}</span>,
      })),
    [projects],
  );
  const milestoneItems = useMemo<OptionItem[]>(() => {
    const showProject = milestoneProjects.length > 1;
    return [
      { id: ANY, label: 'Any' },
      { id: FILTER_NONE, label: 'No milestone', prefix: <NoneGlyph /> },
      ...milestones.map((milestone) => ({
        id: milestone.id,
        label: milestone.name,
        description: showProject ? milestone.project.key : undefined,
        prefix: <MilestoneGlyph filled={milestone.status !== 'planned'} />,
      })),
    ];
  }, [milestones, milestoneProjects.length]);

  const renderEmpty = () => {
    if (listError) {
      return (
        <div className="px-6 py-4">
          <Banner
            action={
              <Button
                variant="secondary"
                size="sm"
                isPending={list.isFetching}
                onPress={() => list.refetch()}
              >
                Retry
              </Button>
            }
          >
            Couldn't load your tasks. {listError.message}
          </Banner>
          {listError.requestId ? (
            <RequestHint requestId={listError.requestId} prefix="Your filters are kept." />
          ) : null}
        </div>
      );
    }
    if (!filtered) {
      return (
        <div className="flex px-6 py-12">
          <EmptyState
            title="Nothing assigned to you"
            text={`Tasks assigned to you in any project of ${workspace ?? 'this workspace'} show up here.`}
            action={
              <Button variant="secondary" onPress={() => navigate({ to: PROJECTS_HREF })}>
                Browse projects
              </Button>
            }
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

  const enterTable = () => {
    const current = selectedRef.current;
    const first = current ?? order[0];
    if (!first) return;
    if (!current) select(first);
    focusRow(first);
  };

  return (
    <div
      className={cn(
        'grid h-dvh min-h-0 flex-1 bg-bg text-fg',
        isPanelOpen ? 'grid-cols-[minmax(0,1fr)_440px]' : 'grid-cols-[minmax(0,1fr)]',
      )}
    >
      <section aria-label="My tasks" className="flex min-h-0 min-w-0 flex-col">
        <PageHeader
          title="My tasks"
          subtitle={subtitle || ' '}
          actions={
            <>
              <SearchField
                width={150}
                value={query}
                onChange={setQuery}
                inputRef={searchRef}
                aria-label="Search your tasks"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    enterTable();
                  } else {
                    event.continuePropagation();
                  }
                }}
              />
              <Button kbd="C" onPress={() => quickCreate?.open()} aria-keyshortcuts="c">
                New
              </Button>
            </>
          }
        />
        <FilterBar
          end={
            <span className="flex items-center gap-4">
              {filtered ? (
                <Button variant="ghost" size="sm" className="px-0 font-normal" onPress={clearFilters}>
                  Clear
                </Button>
              ) : null}
              <span className="text-faint">Sorted by priority</span>
            </span>
          }
        >
          <Select
            label="Project"
            variant="filter"
            selectionMode="multiple"
            items={projectItems}
            value={search.project ?? []}
            onChange={(keys) =>
              setSearch((previous) => ({ ...previous, project: keys.length ? keys.map(String) : undefined }))
            }
          />
          <Select
            label="Status"
            variant="filter"
            selectionMode="multiple"
            placeholder="Open"
            items={STATUS_OPTIONS}
            value={search.status ?? []}
            onChange={(keys) =>
              setSearch((previous) => ({
                ...previous,
                status: keys.length ? (keys.map(String) as MyTasksSearch['status']) : undefined,
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
              setSearch((previous) => ({
                ...previous,
                priority: keys.length ? (keys.map(String) as MyTasksSearch['priority']) : undefined,
              }))
            }
          />
          {isPanelOpen ? null : (
            <>
              <Select
                label="Milestone"
                variant="filter"
                items={milestoneItems}
                value={search.milestone ?? ANY}
                onChange={(key) =>
                  setSearch((previous) => ({
                    ...previous,
                    milestone: key == null || key === ANY ? undefined : String(key),
                  }))
                }
              />
              <Select
                label="Cycle"
                variant="filter"
                items={CYCLE_OPTIONS}
                value={search.cycle ?? ANY}
                onChange={(key) =>
                  setSearch((previous) => ({
                    ...previous,
                    cycle: key == null || key === ANY ? undefined : (String(key) as MyCycleFilter),
                  }))
                }
              />
            </>
          )}
        </FilterBar>
        <div ref={tableRef} onKeyDownCapture={onTableKeyDownCapture} className="flex min-h-0 flex-1 flex-col">
          {listError || isEmpty ? (
            // Without rows the design drops the column header, so the message stands alone.
            renderEmpty()
          ) : (
            <DataTable
              aria-label="Tasks assigned to you"
              columns={columns}
              groups={groups}
              getKey={(task: TaskListItem) => task.key}
              isLoading={list.isPending}
              skeletonRows={10}
              selectedKey={selected}
              onSelectionChange={(key) => select(key)}
              onRowAction={(key) => select(key)}
              collapsedGroups={collapsed}
              onCollapsedGroupsChange={setCollapsed}
              renderEmptyState={renderEmpty}
            />
          )}
        </div>
      </section>
      {isPanelOpen && selected && panelProjectKey ? (
        <section aria-label="Task detail" className="flex min-h-0 min-w-0 flex-col border-l border-line">
          <TaskDetailPane
            key={selected}
            projectKey={panelProjectKey}
            taskKey={selected}
            preview={preview}
            showProject
            onClose={() => select(null)}
          />
        </section>
      ) : null}
    </div>
  );
}
