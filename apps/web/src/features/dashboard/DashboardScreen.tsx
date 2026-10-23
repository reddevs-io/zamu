import { type Dashboard, safeParseTaskKey } from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useOptionalNewProject } from '~/features/shell/new-project';
import { usePageSearchRef } from '~/features/shell/page-search';
import { useOptionalQuickCreate } from '~/features/shell/quick-create';
import { useNow } from '~/features/tasks/clock';
import { describeError } from '~/features/tasks/errors';
import { membersQuery, meQuery, useUpdateTask } from '~/features/tasks/queries';
import { useUrlSelection } from '~/features/tasks/selection';
import { RequestHint, TaskDetailPane } from '~/features/tasks/TaskDetailPane';
import {
  Banner,
  Button,
  cn,
  Kbd,
  PageHeader,
  QUEUE_COLUMNS,
  SearchField,
  SegmentedControl,
  useHotkeys,
} from '~/ui';
import { AgentCards } from './AgentCards';
import {
  COLLAPSED_ROWS,
  entryMatches,
  GROUPS,
  groupEntries,
  groupOfFocus,
  headerId,
  keepHeldRows,
  type QueueEntry,
  sinceText,
  stepFocus,
  taskKeyOf,
  waitAge,
  workspaceLine,
} from './model';
import { ProjectTable } from './ProjectTable';
import { NewWorkspace, RefreshLine, type RefreshState, useMediaQuery } from './parts';
import { type QueueGroupView, QueueView } from './QueueView';
import { dashboardQuery } from './queries';
import { type DashboardSearch, type QueueGroupId, scopeOf } from './search';

// /dashboard: what needs someone now across every project. The action queue on top (In review, Mentions,
// Stalled, Deadlines), one row per project, then the agents. Mine / Everyone, the expanded group and the
// open task live in the URL. Background refreshes never move focus: a row whose condition cleared stays,
// faded, until focus or the panel leaves it.

export interface DashboardScreenProps {
  search: DashboardSearch;
}

/** Below this width the panel layout drops to the narrow column set (frames 3c and 3d). */
const NARROW_QUERY = '(max-width: 1199px)';

const SCOPE_ITEMS = [
  { id: 'mine', label: 'Mine' },
  { id: 'everyone', label: 'Everyone' },
] as const;

export function DashboardScreen({ search }: DashboardScreenProps) {
  const navigate = useNavigate();
  const quickCreate = useOptionalQuickCreate();
  const newProject = useOptionalNewProject();
  const scope = scopeOf(search);
  const now = useNow();
  const narrowScreen = useMediaQuery(NARROW_QUERY);

  const writeSearch = (update: (previous: DashboardSearch) => DashboardSearch) =>
    navigate({ to: '/dashboard', search: update as never, replace: true });
  const { selected, select, selectedRef, noteWrite } = useUrlSelection(search.task ?? null, (task) =>
    writeSearch((previous) => ({ ...previous, task: task ?? undefined })),
  );
  /** Changes scope or the open group; the URL keeps the current selection, even one not written yet. */
  const setSearch = (update: (previous: DashboardSearch) => DashboardSearch) => {
    const task = selectedRef.current;
    noteWrite(task);
    return writeSearch((previous) => ({ ...update(previous), task: task ?? undefined }));
  };

  // ---- Data ---------------------------------------------------------------------------------------
  const query = useQuery(dashboardQuery(scope));
  const me = useQuery(meQuery()).data;
  const members = useQuery(membersQuery()).data?.items;
  const data: Dashboard | undefined = query.data;
  const shownScope = data?.scope ?? scope;
  const workspace = me?.workspace.name ?? '';
  const isFirstLoad = data === undefined && query.isPending;
  const loadError = data === undefined && query.isError ? describeError(query.error) : null;
  const isNewWorkspace = data !== undefined && data.projects.length === 0;
  const today = data?.generatedAt.slice(0, 10);
  const memberNames = useMemo(() => (members ?? []).map((member) => member.name), [members]);

  // ---- Queue rows ---------------------------------------------------------------------------------
  const [text, setText] = useState('');
  const searching = text.trim() !== '';
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [revealFor, setRevealFor] = useState<string | null>(null);
  const [showAllProjects, setShowAllProjects] = useState(false);

  // A scope switch starts over: rows of the other scope are not "held".
  const [lastScope, setLastScope] = useState(scope);
  if (lastScope !== scope) {
    setLastScope(scope);
    setFocusedId(null);
    setSelectedRowId(null);
  }

  const held = [focusedId, selected ? selectedRowId : null].filter((id): id is string => id != null);
  const heldKey = held.join('|');
  const shownRef = useRef<Partial<Record<QueueGroupId, QueueEntry[]>>>({});
  const groups = useMemo<QueueGroupView[]>(() => {
    const heldIds = new Set(heldKey ? heldKey.split('|') : []);
    return GROUPS.map((meta) => {
      const all = data ? groupEntries(data, meta.id) : [];
      const isExpanded = search.open === meta.id && !searching;
      const matching = searching ? all.filter((entry) => entryMatches(entry, text)) : all;
      const next = searching || isExpanded ? matching : matching.slice(0, COLLAPSED_ROWS);
      // Rows the answer still has (only cut by the 5-row cap or the search) are not held back.
      const present = new Set(all.map((entry) => entry.id));
      const kept = keepHeldRows(shownRef.current[meta.id] ?? [], next, heldIds, present);
      const total = data ? (searching ? matching.length : data.groups[meta.id].total) : 0;
      return { meta, total, rows: kept, isExpanded, canExpand: !searching && total > COLLAPSED_ROWS };
    });
  }, [data, search.open, searching, text, heldKey]);
  useEffect(() => {
    shownRef.current = Object.fromEntries(groups.map((group) => [group.meta.id, group.rows]));
  }, [groups]);

  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const focusedEntry = focusedId ? rowById.get(focusedId) : undefined;
  // The row with the accent edge: the one Enter opened, else the first row of the task in the URL.
  const openedRow = selectedRowId ? rowById.get(selectedRowId) : undefined;
  const selectedEntryId =
    selected == null
      ? null
      : openedRow && taskKeyOf(openedRow) === selected
        ? openedRow.id
        : (rows.find((row) => taskKeyOf(row) === selected)?.id ?? null);
  const queueTotal = groups.reduce((sum, group) => sum + group.total, 0);
  const isClear = data !== undefined && !searching && queueTotal === 0 && rows.length === 0;

  // ---- Panel --------------------------------------------------------------------------------------
  const panelProjectKey = selected ? safeParseTaskKey(selected)?.projectKey : undefined;
  const isPanelOpen = selected != null && panelProjectKey != null;
  const narrow = isPanelOpen && narrowScreen;
  const columns = isPanelOpen ? (narrow ? QUEUE_COLUMNS.narrow : QUEUE_COLUMNS.panel) : QUEUE_COLUMNS.wide;

  // ---- Keyboard -----------------------------------------------------------------------------------
  const pageRef = useRef<HTMLDivElement>(null);
  const focusRow = (id: string) => {
    setFocusedId(id);
    const find = () => pageRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`);
    // At once when the row is on screen, so a key pressed right after lands on it; else after the render.
    const row = find();
    if (row) row.focus();
    else requestAnimationFrame(() => find()?.focus());
  };
  const move = (step: 1 | -1) => {
    const next = stepFocus(
      groups.map((group) => ({ group: group.meta.id, rows: group.rows })),
      focusedId,
      step,
    );
    if (next) focusRow(next);
  };
  const jumpTo = (group: QueueGroupId) => {
    const view = groups.find((entry) => entry.meta.id === group);
    if (!view || isClear || !data) return;
    focusRow(view.rows[0]?.id ?? headerId(group));
  };
  const toggleGroup = (group: QueueGroupId) => {
    const collapsing = search.open === group;
    if (collapsing && focusedEntry?.group === group) {
      // Keep focus on a row that stays visible.
      const view = groups.find((entry) => entry.meta.id === group);
      const index = view?.rows.findIndex((row) => row.id === focusedEntry.id) ?? -1;
      const last = view?.rows[Math.min(index, COLLAPSED_ROWS - 1)];
      if (index >= COLLAPSED_ROWS && last) focusRow(last.id);
    }
    setSearch((previous) => ({ ...previous, open: collapsing ? undefined : group }));
  };
  const switchScope = (next = shownScope === 'everyone' ? 'mine' : 'everyone') =>
    setSearch((previous) => ({ ...previous, scope: next === 'everyone' ? 'everyone' : undefined }));

  const openEntry = (entry: QueueEntry) => {
    setFocusedId(entry.id);
    if (entry.group === 'deadlines') {
      const item = entry.item;
      if (item.kind === 'milestone') {
        void navigate({
          to: '/p/$projectKey/milestones/$milestoneId',
          params: { projectKey: item.project.key, milestoneId: item.milestone.id },
        });
      } else {
        void navigate({
          to: '/p/$projectKey/cycles/$cycleNumber',
          params: { projectKey: item.project.key, cycleNumber: String(item.cycle.number) },
        });
      }
      return;
    }
    const key = entry.item.task.key;
    setSelectedRowId(entry.id);
    setRevealFor(entry.group === 'mentions' ? key : null);
    select(key);
  };
  const openTask = (key: string) => {
    setSelectedRowId(null);
    setRevealFor(null);
    select(key);
  };
  const closePanel = () => {
    const back = selectedEntryId ?? focusedId;
    select(null);
    setSelectedRowId(null);
    if (back) focusRow(back);
  };

  const update = useUpdateTask();
  const assignFocusedToMe = () => {
    const key = focusedEntry ? taskKeyOf(focusedEntry) : null;
    if (!key || !me) return;
    const { id, name, kind, responsible } = me.user;
    update.mutate({ key, patch: { assignee: { id, name, kind, responsible } } });
  };

  const queueReady = data !== undefined && !isNewWorkspace;
  useHotkeys({
    j: queueReady ? () => move(1) : null,
    k: queueReady ? () => move(-1) : null,
    '1': queueReady ? () => jumpTo('review') : null,
    '2': queueReady ? () => jumpTo('mentions') : null,
    '3': queueReady ? () => jumpTo('stalled') : null,
    '4': queueReady ? () => jumpTo('deadlines') : null,
    a: queueReady
      ? () => {
          const group = groupOfFocus(focusedId);
          if (group) toggleGroup(group);
        }
      : null,
    e: isNewWorkspace ? null : () => switchScope(),
    i: focusedEntry && taskKeyOf(focusedEntry) && me ? assignFocusedToMe : null,
    Enter: {
      enabled: focusedEntry != null,
      preventDefault: false,
      handler: (event) => {
        if (focusedEntry && (event.target === document.body || event.target === document.documentElement)) {
          event.preventDefault();
          openEntry(focusedEntry);
        }
      },
    },
    Escape: { handler: closePanel, enabled: selected != null },
  });

  // ---- Header -------------------------------------------------------------------------------------
  const searchRef = usePageSearchRef();
  const updatedIso = data && now != null ? new Date(Math.min(query.dataUpdatedAt, now)).toISOString() : null;
  const age = updatedIso && now != null ? sinceText(updatedIso, now) : '';
  const refresh: RefreshState = isFirstLoad
    ? { kind: 'loading' }
    : query.isFetching
      ? { kind: 'refreshing' }
      : query.isError
        ? {
            kind: 'stale',
            // The data is at least one refresh old: "1m ago", never "just now".
            age: updatedIso && now != null ? `${waitAge(updatedIso, now)} ago` : '',
            onRetry: () => void query.refetch(),
          }
        : { kind: 'fresh', age };
  const subtitle =
    data && !isNewWorkspace ? workspaceLine(workspace, shownScope, members, me?.user.id) : workspace;
  const agentTotal = members?.filter((member) => member.kind === 'agent').length;
  const agentNote =
    shownScope === 'everyone'
      ? 'Everyone'
      : agentTotal
        ? `Yours · Everyone shows all ${agentTotal}`
        : 'Yours';

  const openQuickCreate = () => quickCreate?.open(undefined, { pickProject: true });

  return (
    <div
      ref={pageRef}
      className={cn(
        'grid h-dvh min-h-0 flex-1 bg-bg text-fg',
        isPanelOpen ? 'grid-cols-[minmax(0,1fr)_440px]' : 'grid-cols-[minmax(0,1fr)]',
      )}
    >
      <section aria-label="Dashboard" className="flex min-h-0 min-w-0 flex-col">
        <PageHeader
          title="Dashboard"
          subtitle={subtitle || ' '}
          actions={
            <>
              {isNewWorkspace || loadError ? null : <RefreshLine state={refresh} dotOnly={narrow} />}
              {isNewWorkspace ? null : (
                <span className="inline-flex items-center gap-1.5">
                  <SegmentedControl
                    aria-label="Scope"
                    items={SCOPE_ITEMS}
                    value={scope}
                    onChange={(next) => switchScope(next)}
                  />
                  <Kbd aria-hidden>E</Kbd>
                </span>
              )}
              {isPanelOpen ? null : (
                <SearchField
                  width={140}
                  value={text}
                  onChange={setText}
                  inputRef={searchRef}
                  aria-label="Search the dashboard"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === 'ArrowDown') {
                      event.preventDefault();
                      const first = rows[0];
                      if (first) focusRow(first.id);
                    } else {
                      event.continuePropagation();
                    }
                  }}
                />
              )}
              <Button kbd="C" onPress={openQuickCreate} aria-keyshortcuts="c">
                New
              </Button>
            </>
          }
        />
        <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 pt-5 pb-6">
          {loadError ? (
            <div>
              <Banner
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    isPending={query.isFetching}
                    onPress={() => query.refetch()}
                  >
                    Retry
                  </Button>
                }
              >
                Couldn't load the dashboard. {loadError.message}
              </Banner>
              {loadError.requestId ? <RequestHint requestId={loadError.requestId} /> : null}
            </div>
          ) : isNewWorkspace ? (
            <NewWorkspace
              workspace={workspace || 'this workspace'}
              onNewProject={() => newProject?.open()}
              onAddAgent={() => void navigate({ to: '/settings/members' })}
            />
          ) : (
            <>
              {update.isError ? (
                <Banner
                  action={
                    <Button variant="secondary" size="sm" onPress={() => update.reset()}>
                      Dismiss
                    </Button>
                  }
                >
                  Couldn't assign the task to you. {describeError(update.error).message}
                </Banner>
              ) : null}
              <QueueView
                scope={shownScope}
                workspace={workspace}
                isLoading={isFirstLoad}
                groups={groups}
                total={data ? queueTotal : undefined}
                isClear={isClear}
                checkedText={age}
                columns={columns}
                wide={!isPanelOpen}
                showNote={!isPanelOpen}
                focusedId={focusedId}
                selectedId={isPanelOpen ? selectedEntryId : null}
                now={now}
                today={today}
                memberNames={memberNames}
                onFocusRow={setFocusedId}
                onOpen={openEntry}
                onToggleGroup={toggleGroup}
              />
              <ProjectTable
                projects={
                  searching
                    ? data?.projects.filter((project) =>
                        `${project.key} ${project.name}`.toLowerCase().includes(text.trim().toLowerCase()),
                      )
                    : data?.projects
                }
                isLoading={isFirstLoad}
                wide={!isPanelOpen}
                showAll={showAllProjects}
                onShowAll={() => setShowAllProjects(true)}
                now={now}
                today={today}
                deadlines={data?.groups.deadlines.items ?? []}
              />
              {data && data.agents.length > 0 ? (
                <AgentCards
                  agents={data.agents}
                  stalled={data.groups.stalled.items}
                  note={agentNote}
                  narrow={isPanelOpen}
                  now={now}
                  onOpenTask={openTask}
                />
              ) : null}
            </>
          )}
        </div>
      </section>
      {isPanelOpen && selected && panelProjectKey ? (
        <section aria-label="Task detail" className="flex min-h-0 min-w-0 flex-col border-l border-line">
          <TaskDetailPane
            key={`${selected}:${revealFor === selected ? 'reveal' : 'plain'}`}
            projectKey={panelProjectKey}
            taskKey={selected}
            showProject
            revealNewestComment={revealFor === selected}
            onClose={closePanel}
          />
        </section>
      ) : null}
    </div>
  );
}
