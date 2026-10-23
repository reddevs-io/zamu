import { type ProjectWithCounts, parseRepositoryUrl } from '@pm/contracts';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-aria-components';
import { isDetached, isMirrored, SOURCE_TITLES, sourceDotState } from '~/features/project-header/mirror';
import { projectHref } from '~/features/shell/paths';
import {
  Avatar,
  Button,
  type DataColumn,
  DataTable,
  SourceStatusDot,
  StatusBar,
  Tooltip,
  TooltipTrigger,
} from '~/ui';
import { shortAge } from './time';

const MAX_AVATARS = 4;

/** Project name linking to its task list; the full name shows in a tooltip when it is cut off. */
function ProjectName({ project }: { project: ProjectWithCounts }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);
  // Measured when the tooltip wants to open: widths change with fonts and the window.
  const onOpenChange = (next: boolean) => {
    const element = ref.current;
    setOpen(next && element != null && element.scrollWidth > element.clientWidth + 1);
  };
  return (
    <TooltipTrigger isOpen={open} onOpenChange={onOpenChange}>
      <Link
        ref={ref}
        href={projectHref(project.key)}
        className="block truncate text-[13.5px] font-semibold text-fg outline-none hover:underline focus-visible:focus-ring"
      >
        {project.name}
      </Link>
      <Tooltip placement="top start">{project.name}</Tooltip>
    </TooltipTrigger>
  );
}

/**
 * Linked repository as its short form, opening the repository page in a new tab. Long paths are cut
 * from the left so the repository name stays visible (rtl box, ltr text). The row action does not run:
 * the link handles its own presses.
 */
function RepositoryLink({ url }: { url: string }) {
  const repository = parseRepositoryUrl(url);
  if (!repository) return null;
  return (
    <TooltipTrigger>
      <Link
        href={repository.webUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="block w-fit max-w-full truncate text-left font-mono text-[10.5px] text-faint outline-none [direction:rtl] hover:text-accent hover:underline hover:underline-offset-2 focus-visible:focus-ring"
      >
        <span className="[direction:ltr] [unicode-bidi:isolate]">{repository.short}</span>
      </Link>
      <Tooltip placement="bottom start" className="max-w-none font-mono text-[10.5px] whitespace-nowrap">
        {repository.webUrl}
        <span aria-hidden> ↗</span>
      </Tooltip>
    </TooltipTrigger>
  );
}

function Members({ project }: { project: ProjectWithCounts }) {
  const shown = project.assignees.slice(0, MAX_AVATARS);
  const more = project.assignees.length - shown.length;
  if (!shown.length) return null;
  return (
    <span className="flex items-center gap-[3px]">
      {shown.map((member) => (
        <Avatar key={member.id} name={member.name} kind={member.kind} />
      ))}
      {more > 0 ? (
        <span className="pl-0.5 font-mono text-[10px] text-faint">
          <span className="sr-only">and </span>+{more}
          <span className="sr-only"> more</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * "Tasks come from" (frame 4j): a Backlog.md mirror with its state dot, "This app · imported" after an
 * import, "This app · detached" after a detached mirror, or "This app".
 */
export function TasksSource({ project }: { project: ProjectWithCounts }) {
  const backlog = project.backlog;
  if (backlog && isMirrored(project)) {
    const state = sourceDotState(backlog.state);
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] whitespace-nowrap text-muted">
        <SourceStatusDot state={state} label={SOURCE_TITLES[backlog.state]} />
        Backlog.md {backlog.mode === 'import' ? 'import' : 'mirror'}
      </span>
    );
  }
  const note = isDetached(project) ? (backlog?.mode === 'import' ? ' · imported' : ' · detached') : '';
  return <span className="text-[11.5px] whitespace-nowrap text-faint">This app{note}</span>;
}

const BASE_COLUMNS: readonly DataColumn<ProjectWithCounts>[] = [
  {
    id: 'key',
    header: 'Key',
    width: 72,
    cell: (project) => <span className="font-mono text-[10.5px] text-muted">{project.key}</span>,
  },
  {
    id: 'project',
    header: 'Project',
    width: '1fr',
    isRowHeader: true,
    cell: (project) => (
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <ProjectName project={project} />
        {project.description ? (
          <div className="truncate text-[12px] text-muted">{project.description}</div>
        ) : null}
        {project.repository ? <RepositoryLink url={project.repository} /> : null}
      </div>
    ),
  },
  {
    id: 'status',
    header: 'Open tasks by status',
    width: 220,
    cell: (project) => <StatusBar counts={project.openCounts} width={200} />,
    skeleton: 200,
  },
  {
    id: 'open',
    header: 'Open',
    width: 56,
    align: 'end',
    cell: (project) => <span className="font-mono text-[11px] font-medium">{project.openCount}</span>,
  },
  {
    id: 'source',
    header: 'Tasks come from',
    width: 150,
    skeleton: 100,
    cell: (project) => <TasksSource project={project} />,
  },
  {
    id: 'members',
    header: 'Members',
    width: 110,
    cell: (project) => <Members project={project} />,
  },
  {
    id: 'updated',
    header: 'Upd',
    width: 56,
    align: 'end',
    cell: (project) => (
      <time
        dateTime={project.lastActivityAt}
        title={new Date(project.lastActivityAt).toLocaleString()}
        suppressHydrationWarning
        className="font-mono text-[10px] text-faint"
      >
        {shortAge(project.lastActivityAt)}
      </time>
    ),
  },
];

/** Base columns plus a trailing Edit button when the page can edit projects. */
function columnsFor(onEdit: ((key: string) => void) | undefined): readonly DataColumn<ProjectWithCounts>[] {
  if (!onEdit) return BASE_COLUMNS;
  return [
    ...BASE_COLUMNS,
    {
      id: 'edit',
      header: '',
      width: 40,
      align: 'end',
      skeleton: 0,
      cell: (project) => (
        <Button
          variant="ghost"
          size="sm"
          className="px-0"
          aria-label={`Edit ${project.name}`}
          onPress={() => onEdit(project.key)}
        >
          Edit
        </Button>
      ),
    },
  ];
}

export interface ProjectsTableProps {
  projects: readonly ProjectWithCounts[];
  isLoading?: boolean;
  /** Shown in the body when `projects` is empty (search without matches). */
  emptyMessage?: string;
  onOpen: (key: string) => void;
  /** Opens the project's settings (General: name, key, description, repository, switches). */
  onEdit?: (key: string) => void;
}

/**
 * Projects table from frame 03 with the M2.1 repository line (option 1b): key, name, description and
 * repository, open-task bar, open count, where tasks come from (M3), members, age. When a project
 * mirrors Backlog.md, a line under the rows explains the rail's marker.
 */
export function ProjectsTable({ projects, isLoading, emptyMessage, onOpen, onEdit }: ProjectsTableProps) {
  const editRef = useRef(onEdit);
  editRef.current = onEdit;
  const hasEdit = onEdit != null;
  // Stable columns: DataTable re-renders every row when they change.
  const columns = useMemo(() => columnsFor(hasEdit ? (key) => editRef.current?.(key) : undefined), [hasEdit]);
  const anyMirrored = !isLoading && projects.some((project) => isMirrored(project));
  const table = (
    <DataTable
      aria-label="Projects"
      columns={columns}
      items={projects}
      getKey={(project) => project.key}
      onRowAction={(key) => onOpen(key)}
      // 64px rows plus the divider; rows without a repository keep the same height.
      rowHeight={65}
      isLoading={isLoading}
      skeletonRows={5}
      renderEmptyState={
        emptyMessage ? () => <p className="m-0 px-6 py-4 text-muted">{emptyMessage}</p> : undefined
      }
      rowClassName={() => 'cursor-pointer'}
      className={anyMirrored ? 'flex-[0_1_auto]' : undefined}
    />
  );
  if (!anyMirrored) return table;
  return (
    <>
      {table}
      <p className="m-0 shrink-0 px-6 py-3.5 text-[11.5px] text-muted">
        The small square next to a project key in the sidebar marks a Backlog.md mirror.
      </p>
    </>
  );
}
