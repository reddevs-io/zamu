import type { ProjectWithCounts } from '@pm/contracts';
import { useRef, useState } from 'react';
import { Link } from 'react-aria-components';
import { projectHref } from '~/features/shell/paths';
import { Avatar, type DataColumn, DataTable, StatusBar, Tooltip, TooltipTrigger } from '~/ui';
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

const COLUMNS: readonly DataColumn<ProjectWithCounts>[] = [
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
      <div className="min-w-0 flex-1">
        <ProjectName project={project} />
        {project.description ? (
          <div className="truncate text-[12px] text-muted">{project.description}</div>
        ) : null}
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

export interface ProjectsTableProps {
  projects: readonly ProjectWithCounts[];
  isLoading?: boolean;
  /** Shown in the body when `projects` is empty (search without matches). */
  emptyMessage?: string;
  onOpen: (key: string) => void;
}

/** Projects table from frame 03: key, name and description, open-task bar, open count, members, age. */
export function ProjectsTable({ projects, isLoading, emptyMessage, onOpen }: ProjectsTableProps) {
  return (
    <DataTable
      aria-label="Projects"
      columns={COLUMNS}
      items={projects}
      getKey={(project) => project.key}
      onRowAction={(key) => onOpen(key)}
      rowHeight={53}
      isLoading={isLoading}
      skeletonRows={5}
      renderEmptyState={
        emptyMessage ? () => <p className="m-0 px-6 py-4 text-muted">{emptyMessage}</p> : undefined
      }
      rowClassName={() => 'cursor-pointer'}
    />
  );
}
