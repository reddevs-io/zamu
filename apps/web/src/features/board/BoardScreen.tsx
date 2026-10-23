import type { TaskListItem, TaskStatus } from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  type FocusEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DetachedToast,
  DRAG_REFUSAL_TEXT,
  isDetached,
  isMirrored,
  MirrorCreateButton,
  MirrorEmptyState,
  MirrorFailedBanner,
  ProjectHeader,
  statusRefusalText,
  TaskFilterBar,
  useProjectSummary,
  ViewSwitch,
} from '~/features/project-header';
import { useSearchText } from '~/features/project-header/useSearchText';
import { usePageSearchRef } from '~/features/shell/page-search';
import { useOptionalQuickCreate } from '~/features/shell/quick-create';
import { useNow } from '~/features/tasks/clock';
import { describeError } from '~/features/tasks/errors';
import { formatDay } from '~/features/tasks/format';
import { rememberListSearch, rememberView } from '~/features/tasks/list-memory';
import { membersQuery } from '~/features/tasks/queries';
import {
  applyProjectFeatures,
  BOARD_FOLDED,
  type BoardLanes as BoardLanesMode,
  boardStatuses,
  filtersOf,
  hasFilters,
  type TaskListSearch,
  type TaskView,
} from '~/features/tasks/search';
import { useUrlSelection } from '~/features/tasks/selection';
import { RequestHint, TaskDetailPane } from '~/features/tasks/TaskDetailPane';
import { orpc } from '~/lib/orpc';
import {
  Banner,
  Button,
  cn,
  EmptyState,
  isEditableTarget,
  Kbd,
  SearchField,
  STATUS_LABELS,
  Toast,
  useHotkeys,
} from '~/ui';
import { BoardColumns, BoardLanes, BoardSkeleton } from './BoardColumns';
import type { Placement } from './board-cache';
import type { CardDrop } from './CardList';
import { useBoardData } from './data';
import { describeFilters, emptyBoardText } from './describe';
import { buildLanes, type Lane, laneOf, NO_LANE } from './lanes';
import { type Direction, focusTarget, type NavColumn, reorderPlacement, statusStep } from './layout';
import { type LanePatch, useBoardMoves } from './moves';

// /p/$projectKey?view=board: one column per status, cards in hand-made order, the selected card in the
// task panel at the right. Keyboard: H/L columns, J/K cards, Shift+H/L change status, Shift+J/K reorder,
// Enter opens the panel, Esc closes it, Ctrl/Cmd+Z undoes the last move, V switches to the list.
// Mirrored projects (frames 4f to 4h): a card's status comes from Backlog.md, so while one is dragged
// the other columns hatch and refuse the drop; Shift+H/L explain instead of moving; Shift+J/K and
// drops within the column still reorder. Swimlane drops that would change a Backlog.md field refuse too.

export interface BoardScreenProps {
  projectKey: string;
  search: TaskListSearch;
}

const TOAST_MS = 6000;

/** A toast that explains a refused move (mirrored projects). */
interface Notice {
  id: number;
  text: string;
  /** Adds "⇧J/K reorders" after the text. */
  reorderHint?: boolean;
}

const isApple = () =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

export function BoardScreen({ projectKey, search }: BoardScreenProps) {
  const navigate = useNavigate();
  const quickCreate = useOptionalQuickCreate();
  const project = useProjectSummary(projectKey);
  const usesMilestones = project?.usesMilestones ?? false;
  const usesCycles = project?.usesCycles ?? false;
  const mirrored = isMirrored(project);
  const detached = isDetached(project);

  const searchKey = JSON.stringify(filtersOf(search));
  // biome-ignore lint/correctness/useExhaustiveDependencies: searchKey stands for the filter values
  const filters = useMemo(() => applyProjectFeatures(filtersOf(search), project), [searchKey, project]);
  const lanesMode: BoardLanesMode | null =
    search.lanes === 'milestone' && !usesMilestones ? null : (search.lanes ?? null);
  const features = useMemo(
    () => ({ usesMilestones, usesCycles, laneField: lanesMode }),
    [usesMilestones, usesCycles, lanesMode],
  );

  useEffect(() => rememberListSearch(projectKey, search), [projectKey, search]);

  // ---- URL: selection and filters (same rules as the list) ---------------------------------------
  const writeSearch = (update: (previous: TaskListSearch) => TaskListSearch) =>
    navigate({ to: '/p/$projectKey', params: { projectKey }, search: update as never, replace: true });
  const { selected, select, selectedRef, noteWrite } = useUrlSelection(search.task ?? null, (task) =>
    writeSearch((previous) => ({ ...previous, task: task ?? undefined })),
  );
  const setSearch = (update: (previous: TaskListSearch) => TaskListSearch) => {
    const task = selectedRef.current;
    noteWrite(task);
    return writeSearch((previous) => ({ ...update(previous), task: task ?? undefined }));
  };
  const setSearchRef = useRef(setSearch);
  setSearchRef.current = setSearch;

  const [query, setQuery, resetQuery] = useSearchText(search.q, (q) =>
    setSearchRef.current((previous) => ({ ...previous, q })),
  );
  const searchRef = usePageSearchRef();

  const setView = (view: TaskView) => {
    rememberView(projectKey, view);
    setSearch((previous) => ({ ...previous, view: view === 'board' ? 'board' : undefined }));
  };
  const clearFilters = () => {
    resetQuery();
    setSearch((previous) => ({ view: previous.view, lanes: previous.lanes }));
  };
  const newTask = () => quickCreate?.open(projectKey);

  // ---- Refusals (mirrored projects) ----------------------------------------------------------------
  const noticeId = useRef(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const showNotice = useCallback((text: string, reorderHint = false) => {
    noticeId.current++;
    setNotice({ id: noticeId.current, text, reorderHint });
  }, []);
  /** Status of the mirrored card being dragged: the other columns refuse it. */
  const [refuseFrom, setRefuseFrom] = useState<TaskStatus | null>(null);

  // ---- Columns -----------------------------------------------------------------------------------
  const statusKey = filters.status?.join(',') ?? '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: statusKey stands for filters.status
  const statuses = useMemo(() => boardStatuses(filters), [statusKey]);
  const panelOpen = selected != null;
  const [foldOverrides, setFoldOverrides] = useState<Partial<Record<TaskStatus, boolean>>>({});
  const isFolded = useCallback(
    (status: TaskStatus) =>
      foldOverrides[status] ??
      // Done and Canceled start folded (unless a status filter asks for them); Backlog folds while the
      // panel is open.
      ((!statusKey && BOARD_FOLDED.includes(status)) || (panelOpen && status === 'backlog')),
    [foldOverrides, statusKey, panelOpen],
  );
  const setFolded = useCallback(
    (status: TaskStatus, folded: boolean) =>
      setFoldOverrides((previous) => ({ ...previous, [status]: folded })),
    [],
  );
  const openKey = statuses.filter((status) => !isFolded(status)).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: openKey stands for the open statuses
  const open = useMemo(() => new Set(statuses.filter((status) => !isFolded(status))), [openKey]);

  const data = useBoardData(projectKey, filters, open, lanesMode != null);
  const moves = useBoardMoves(projectKey);
  const counts = data.counts;
  const countOf = useCallback(
    (status: TaskStatus) => Math.max(counts?.[status] ?? 0, data.columns[status]?.cards.length ?? 0),
    [counts, data.columns],
  );

  const members = useQuery(membersQuery()).data?.items;
  const milestones = useQuery({
    ...orpc.milestones.list.queryOptions({ input: { project: projectKey } }),
    enabled: usesMilestones,
  }).data?.items;

  const cardsByKey = useMemo(() => {
    const map = new Map<string, TaskListItem>();
    for (const column of Object.values(data.columns))
      for (const card of column?.cards ?? []) map.set(card.key, card);
    return map;
  }, [data.columns]);
  const cardsRef = useRef(cardsByKey);
  cardsRef.current = cardsByKey;
  /** The card's field comes from Backlog.md (its own lock list, or the project's while mirrored). */
  const isLocked = useCallback(
    (card: TaskListItem, field: 'status' | 'assignee' | 'milestone') =>
      card.locked ? card.locked.includes(field) : mirrored,
    [mirrored],
  );
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;
  const onCardDragStart = useCallback(
    (key: string) => {
      const card = cardsRef.current.get(key);
      if (!card || !isLockedRef.current(card, 'status')) return;
      setRefuseFrom(card.status);
      showNotice(DRAG_REFUSAL_TEXT);
    },
    [showNotice],
  );
  const onCardDragEnd = useCallback(() => setRefuseFrom(null), []);

  const lanes = useMemo<Lane[] | null>(() => {
    if (!lanesMode) return null;
    const columns = statuses
      .filter((status) => open.has(status))
      .map((status) => ({ status, cards: data.columns[status]?.cards ?? [] }));
    return buildLanes(
      lanesMode,
      columns,
      (milestones ?? []).map((milestone) => milestone.id),
    );
  }, [lanesMode, statuses, open, data.columns, milestones]);
  const [collapsedLanes, setCollapsedLanes] = useState<ReadonlySet<string>>(() => new Set());

  /** The keyboard map of the board as drawn. */
  const nav = useMemo<NavColumn[]>(
    () =>
      statuses
        .filter((status) => open.has(status))
        .map((status) => ({
          status,
          cells: lanes
            ? lanes
                .filter((lane) => !collapsedLanes.has(lane.id))
                .map((lane) => ({ lane: lane.id, keys: (lane.cells[status] ?? []).map((card) => card.key) }))
            : [{ lane: null, keys: (data.columns[status]?.cards ?? []).map((card) => card.key) }],
        })),
    [statuses, open, lanes, collapsedLanes, data.columns],
  );
  const navRef = useRef(nav);
  navRef.current = nav;

  // ---- Focus -------------------------------------------------------------------------------------
  const boardRef = useRef<HTMLDivElement>(null);
  /** The keyboard cursor: the last focused card. */
  const focusedRef = useRef<string | null>(null);
  const cardElement = useCallback(
    (key: string) => boardRef.current?.querySelector<HTMLElement>(`[data-card-key="${CSS.escape(key)}"]`),
    [],
  );
  /**
   * Focuses a card. After a move the card renders in another list first: wait two frames (one for the
   * cache update to render, one for React Aria to register the item). A card already on screen (J/K)
   * takes focus at once.
   */
  const focusCard = useCallback(
    (key: string, { afterRender = true }: { afterRender?: boolean } = {}) => {
      focusedRef.current = key;
      const element = afterRender ? null : cardElement(key);
      if (element) {
        element.focus();
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(() => cardElement(key)?.focus()));
    },
    [cardElement],
  );
  const current = () => focusedRef.current ?? selectedRef.current;

  const moveFocus = (direction: Direction) => {
    const target = focusTarget(navRef.current, current(), direction);
    if (!target) return;
    if ('end' in target) {
      const column = data.columns[target.end];
      const from = current();
      if (column?.hasMore && from) {
        // J past the last loaded card: load the next page, then move (see the effect below).
        pendingDown.current = from;
        if (!column.isFetchingMore) void column.fetchMore();
      }
      return;
    }
    pendingDown.current = null;
    goTo(target.key);
  };
  const pendingDown = useRef<string | null>(null);
  useEffect(() => {
    const from = pendingDown.current;
    if (!from) return;
    const next = focusTarget(nav, from, 'down');
    if (next && 'key' in next) {
      pendingDown.current = null;
      goTo(next.key);
    }
  });
  const goTo = (key: string) => {
    focusCard(key, { afterRender: false });
    if (selectedRef.current) select(key);
  };

  // ---- Moves -------------------------------------------------------------------------------------
  const laneValue = (laneId: string): LanePatch | undefined => {
    if (!lanesMode || !lanes) return undefined;
    const lane = lanes.find((candidate) => candidate.id === laneId);
    if (lanesMode === 'assignee') return { assignee: laneId === NO_LANE ? null : (lane?.assignee ?? null) };
    return { milestone: laneId === NO_LANE ? null : (lane?.milestone ?? null) };
  };

  const onDrop = (drop: CardDrop, status: TaskStatus, laneId: string | null) => {
    setRefuseFrom(null);
    const card = cardsByKey.get(drop.key);
    if (!card || drop.target?.key === drop.key) return;
    focusedRef.current = card.key;
    if (status !== card.status && isLocked(card, 'status')) {
      showNotice(statusRefusalText(card.key, STATUS_LABELS[card.status]), true);
      return;
    }
    if (laneId !== null && lanesMode && laneOf(lanesMode, card) !== laneId && isLocked(card, lanesMode)) {
      showNotice(`${card.key} keeps its ${lanesMode}: it comes from Backlog.md.`);
      return;
    }
    setNotice(null);
    const placement: Placement = drop.target
      ? drop.target.position === 'before'
        ? { before: drop.target.key }
        : { after: drop.target.key }
      : 'top';
    const lane =
      laneId !== null && lanesMode && laneOf(lanesMode, card) !== laneId ? laneValue(laneId) : undefined;
    moves.move({ key: card.key, to: status, placement, ...(lane ? { lane } : {}), via: 'drag' });
  };

  const moveStatus = (direction: 'left' | 'right') => {
    const key = current();
    const card = key ? cardsByKey.get(key) : undefined;
    if (!card) return;
    const to = statusStep(statuses, card.status, direction);
    if (!to) return;
    if (isLocked(card, 'status')) {
      showNotice(statusRefusalText(card.key, STATUS_LABELS[card.status]), true);
      return;
    }
    setNotice(null);
    if (isFolded(to)) setFolded(to, false);
    let placement: Placement = 'top';
    if (lanesMode && lanes) {
      // Top of the same lane in the next column.
      const first = lanes.find((lane) => lane.id === laneOf(lanesMode, card))?.cells[to]?.[0];
      if (first) placement = { before: first.key };
    }
    if (moves.move({ key: card.key, to, placement, via: 'keyboard' })) focusCard(card.key);
  };

  const reorder = (direction: 'up' | 'down') => {
    const key = current();
    const card = key ? cardsByKey.get(key) : undefined;
    if (!card) return;
    const placement = reorderPlacement(navRef.current, card.key, direction);
    if (!placement) return;
    setNotice(null);
    if (moves.move({ key: card.key, to: card.status, placement, via: 'keyboard' })) focusCard(card.key);
  };

  const undo = () => {
    const key = moves.undo();
    if (key) focusCard(key);
  };

  // ---- Keyboard ----------------------------------------------------------------------------------
  /** Board keys. True when the key was handled. */
  const handleKey = (key: string, shift: boolean, onCard: boolean): boolean => {
    switch (key) {
      case 'j':
        if (shift) reorder('down');
        else moveFocus('down');
        return true;
      case 'k':
        if (shift) reorder('up');
        else moveFocus('up');
        return true;
      case 'h':
        if (shift) moveStatus('left');
        else moveFocus('left');
        return true;
      case 'l':
        if (shift) moveStatus('right');
        else moveFocus('right');
        return true;
      case 'enter': {
        if (shift) return false;
        const focused = onCard ? focusedRef.current : current();
        if (!focused) return false;
        if (selectedRef.current === focused) openPage(focused);
        else select(focused);
        return true;
      }
      case 'escape':
        if (shift || !selectedRef.current) return false;
        select(null);
        if (focusedRef.current) focusCard(focusedRef.current);
        return true;
      default:
        return false;
    }
  };
  const handleKeyRef = useRef(handleKey);
  handleKeyRef.current = handleKey;

  // Keys pressed on a card: handled here before the GridList sees them.
  const onBoardKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;
    const onCard = (event.target as HTMLElement).closest('[data-card-key]') != null;
    if (!onCard) return;
    if (handleKeyRef.current(event.key.toLowerCase(), event.shiftKey, true)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const onBoardFocus = (event: FocusEvent<HTMLDivElement>) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-card-key]')?.dataset.cardKey;
    if (key) focusedRef.current = key;
  };

  const fromAnywhere =
    (key: string, shift = false) =>
    () =>
      handleKeyRef.current(key, shift, false);
  useHotkeys({
    j: fromAnywhere('j'),
    k: fromAnywhere('k'),
    h: fromAnywhere('h'),
    l: fromAnywhere('l'),
    'Shift+j': fromAnywhere('j', true),
    'Shift+k': fromAnywhere('k', true),
    'Shift+h': fromAnywhere('h', true),
    'Shift+l': fromAnywhere('l', true),
    v: () => setView('list'),
    Escape: { handler: () => handleKeyRef.current('escape', false, false), enabled: selected != null },
    Enter: {
      preventDefault: false,
      handler: (event) => {
        if (event.target !== document.body && event.target !== document.documentElement) return;
        if (handleKeyRef.current('enter', false, false)) event.preventDefault();
      },
    },
    'Mod+z': { handler: undo, enabled: moves.canUndo, allowInInputs: false },
  });

  const openPage = (key: string) =>
    navigate({ to: '/p/$projectKey/$taskKey', params: { projectKey, taskKey: key } });

  // A move that failed put the card back: keep the keyboard on it.
  const problemKey = moves.problem?.key;
  useEffect(() => {
    if (problemKey && focusedRef.current === problemKey) focusCard(problemKey);
  }, [problemKey, focusCard]);

  // Keep the cursor on a card that is still on the board.
  useEffect(() => {
    if (focusedRef.current && !cardsByKey.has(focusedRef.current)) focusedRef.current = null;
  }, [cardsByKey]);

  // ---- Rendering ---------------------------------------------------------------------------------
  const filtered = hasFilters(search);
  const total = counts ? statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0) : undefined;
  const names = useMemo(
    () => ({
      members: new Map((members ?? []).map((member) => [member.id, member.name])),
      milestones: new Map((milestones ?? []).map((milestone) => [milestone.id, milestone.name])),
    }),
    [members, milestones],
  );
  const now = useNow();
  const detachedAt = detached ? project?.backlog?.detachedAt : null;
  const viewNote =
    detachedAt && now != null
      ? `detached from Backlog.md on ${formatDay(detachedAt, new Date(now))}`
      : 'board';
  const subtitle = filtered
    ? `filtered: ${describeFilters(filters, names).join(', ')}`
    : project
      ? `${project.openCount} open · ${viewNote}`
      : 'board';
  const loadError = data.error ? describeError(data.error) : null;

  const renderBody = () => {
    if (loadError) {
      return (
        <div className="px-6 py-4">
          <Banner
            action={
              <Button variant="secondary" size="sm" onPress={() => data.refetch()}>
                Retry
              </Button>
            }
          >
            Couldn't load tasks. {loadError.message}
          </Banner>
          {loadError.requestId ? (
            <RequestHint requestId={loadError.requestId} prefix="Your filters are kept." />
          ) : (
            <p className="m-0 mt-2.5 text-[11.5px] text-muted">Your filters are kept.</p>
          )}
        </div>
      );
    }
    if (data.isLoading) return <BoardSkeleton columns={open.size} />;
    if (total === 0 && !filtered && mirrored && project) return <MirrorEmptyState project={project} />;
    if (total === 0) {
      return (
        <div className="flex px-6 py-12">
          {filtered ? (
            <EmptyState
              title="No tasks match these filters"
              text={emptyBoardText(filters, names)}
              action={
                <div className="flex gap-2">
                  <Button variant="secondary" onPress={clearFilters}>
                    Clear filters
                  </Button>
                  {mirrored ? null : (
                    <Button kbd="C" onPress={newTask}>
                      New task
                    </Button>
                  )}
                </div>
              }
            />
          ) : (
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
          )}
        </div>
      );
    }
    const body = {
      statuses,
      isFolded,
      onFoldChange: setFolded,
      columns: data.columns,
      countOf,
      selected,
      onOpen: (key: string) => {
        focusedRef.current = key;
        select(key);
      },
      onDrop,
      // The column's "+" preselects that column's status. Mirrored projects take no new tasks.
      onAdd:
        quickCreate && !mirrored
          ? (status: TaskStatus) => quickCreate.open(projectKey, { status })
          : undefined,
      features,
      refuseFrom,
      onCardDragStart,
      onCardDragEnd,
    };
    return lanes ? (
      <BoardLanes
        {...body}
        lanes={lanes}
        collapsed={collapsedLanes}
        onCollapsedChange={(laneId, collapsed) =>
          setCollapsedLanes((previous) => {
            const next = new Set(previous);
            if (collapsed) next.add(laneId);
            else next.delete(laneId);
            return next;
          })
        }
      />
    ) : (
      <BoardColumns {...body} />
    );
  };

  const toast = moves.toast;
  const problem = moves.problem;

  return (
    <div
      className={cn(
        'grid h-dvh min-h-0 flex-1 bg-bg text-fg',
        panelOpen ? 'grid-cols-[minmax(0,1fr)_440px]' : 'grid-cols-[minmax(0,1fr)]',
      )}
    >
      <section aria-label="Board" className="relative flex min-h-0 min-w-0 flex-col">
        <ProjectHeader
          projectKey={projectKey}
          current="tasks"
          subtitle={subtitle}
          actions={
            <>
              <SearchField
                width={150}
                value={query}
                onChange={setQuery}
                inputRef={searchRef}
                aria-label="Search tasks"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    const first = focusTarget(navRef.current, null, 'down');
                    if (first && 'key' in first) focusCard(first.key);
                  } else {
                    event.continuePropagation();
                  }
                }}
              />
              {mirrored ? (
                <MirrorCreateButton
                  projectName={project?.name ?? projectKey}
                  onPress={newTask}
                  aria-keyshortcuts="c"
                />
              ) : (
                <Button kbd="C" onPress={newTask} aria-keyshortcuts="c">
                  New
                </Button>
              )}
            </>
          }
          filters={
            <TaskFilterBar
              projectKey={projectKey}
              search={search}
              onChange={setSearch}
              usesMilestones={usesMilestones}
              usesCycles={usesCycles}
              showLanes
            />
          }
          filtersEnd={
            <ViewSwitch view="board" onChange={setView} onClear={filtered ? clearFilters : undefined} />
          }
        />
        <MirrorFailedBanner project={project} />
        {problem ? (
          <div className="border-b border-line px-6 py-3">
            <Banner
              action={
                <Button variant="secondary" size="sm" onPress={problem.retry}>
                  Try again
                </Button>
              }
            >
              {problem.text}
            </Banner>
            {problem.hint ? <p className="m-0 mt-2 text-[11.5px] text-muted">{problem.hint}</p> : null}
          </div>
        ) : null}
        <div
          ref={boardRef}
          onKeyDownCapture={onBoardKeyDownCapture}
          onFocusCapture={onBoardFocus}
          className="flex min-h-0 flex-1 flex-col"
        >
          {renderBody()}
        </div>
        {notice ? (
          <Toast key={`notice-${notice.id}`} floating timeout={TOAST_MS} onDismiss={() => setNotice(null)}>
            {notice.text}
            {notice.reorderHint ? (
              <>
                <Kbd variant="inverse" aria-hidden className="ml-3 border-[oklch(0.6_0_0/0.5)]">
                  ⇧J/K
                </Kbd>
                <span className="ml-2 opacity-75">
                  <span className="sr-only">Shift J and K </span>reorders
                </span>
              </>
            ) : null}
          </Toast>
        ) : toast ? (
          <Toast
            key={toast.id}
            floating
            timeout={TOAST_MS}
            onDismiss={moves.dismissToast}
            action={toast.canUndo && moves.canUndo ? { label: 'Undo', onAction: undo } : undefined}
            kbd={toast.canUndo && moves.canUndo ? (isApple() ? '⌘Z' : 'Ctrl Z') : undefined}
          >
            {toast.text}
            <span className="sr-only">{toast.detail}</span>
          </Toast>
        ) : (
          <DetachedToast project={project} />
        )}
      </section>
      {selected ? (
        <section aria-label="Task detail" className="flex min-h-0 min-w-0 flex-col border-l border-line">
          <TaskDetailPane
            key={selected}
            projectKey={projectKey}
            taskKey={selected}
            preview={cardsByKey.get(selected)}
            onClose={() => select(null)}
          />
        </section>
      ) : null}
    </div>
  );
}
