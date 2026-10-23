import type { BacklogMode, BacklogPreview, BacklogProblem } from '@pm/contracts';
import { useState } from 'react';
import {
  Button,
  InlineCode,
  ProblemList,
  ProblemRow,
  STATUS_LABELS,
  StatStrip,
  StatTile,
  StatusSquare,
} from '~/ui';
import { Question, SectionCaption } from './parts';

// Step 4 (frames 3l to 3n): a dry run of the first read on the current head. Nothing is written.

/** Skipped files shown before "Show all N". */
const FIRST_FILES = 10;

type FileProblem = Extract<BacklogProblem, { kind: 'file' }>;
type ValueProblem = Extract<BacklogProblem, { kind: 'value' }>;

/** Every task the read creates: tasks/, drafts and archived ones. */
export function previewTotal(preview: Pick<BacklogPreview, 'counts'>): number {
  const { tasks, drafts, archived } = preview.counts;
  return tasks + drafts + archived;
}

const n = (value: number) => value.toLocaleString('en-US');
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

function FallbackText({ problem }: { problem: ValueProblem }) {
  const tasks = plural(problem.count, 'task', 'tasks');
  if (problem.field === 'status' || problem.field === 'priority') {
    const field = problem.field === 'status' ? 'Status' : 'Priority';
    return (
      <>
        {field} <InlineCode>{problem.value}</InlineCode> on {tasks} shows as {problem.fallback ?? 'nothing'}.
      </>
    );
  }
  if (problem.field === 'assignee') {
    return (
      <>
        <InlineCode>{problem.value}</InlineCode> on {tasks} matches no member;{' '}
        {problem.count === 1
          ? 'it stays unassigned and keeps the name in its Backlog.md section.'
          : 'they stay unassigned and keep the name in their Backlog.md section.'}
      </>
    );
  }
  return (
    <>
      Milestone <InlineCode>{problem.value}</InlineCode> on {tasks} matches no milestone file; no milestone is
      set.
    </>
  );
}

function FileList({
  label,
  files,
  severity,
}: {
  label: string;
  files: FileProblem[];
  severity: 'error' | 'warning';
}) {
  const [all, setAll] = useState(false);
  const shown = all ? files : files.slice(0, FIRST_FILES);
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={label}>
      <div className="flex items-baseline gap-2.5">
        <SectionCaption label={label} count={files.length} />
        <span className="flex-1" />
        {files.length > FIRST_FILES ? (
          <Button variant="ghost" size="sm" className="h-5 px-0 text-[12px]" onPress={() => setAll(!all)}>
            {all ? 'Show fewer' : `Show all ${n(files.length)}`}
          </Button>
        ) : null}
      </div>
      <ProblemList aria-label={label}>
        {shown.map((problem) => (
          // A file can have several warnings, so the path alone is not unique.
          <ProblemRow
            key={`${problem.path}:${problem.message}`}
            severity={severity}
            file={problem.path}
            layout="stacked"
          >
            {problem.message}
          </ProblemRow>
        ))}
      </ProblemList>
    </section>
  );
}

export interface PreviewStepProps {
  mode: BacklogMode;
  projectKey: string;
  projectName: string;
  preview: BacklogPreview;
}

export function PreviewStep({ mode, projectKey, projectName, preview }: PreviewStepProps) {
  const { counts } = preview;
  const total = previewTotal(preview);
  const open = counts.open + counts.drafts;
  const skipped = preview.files.filter(
    (problem): problem is FileProblem => problem.kind === 'file' && problem.skipped,
  );
  const warned = preview.files.filter(
    (problem): problem is FileProblem => problem.kind === 'file' && !problem.skipped,
  );
  const fallbacks = preview.fallbacks.filter((problem): problem is ValueProblem => problem.kind === 'value');
  const subtaskExample = preview.sample.find((row) => row.key.includes('.'))?.key ?? `${projectKey}-1.1`;
  const verb = mode === 'import' ? 'Import' : 'Mirror';

  return (
    <>
      <Question aside={`From commit ${preview.commit.slice(0, 7)} on ${preview.defaultBranch}`}>
        {verb} {plural(total, 'task', 'tasks')} into {projectName}?
      </Question>
      <StatStrip aria-label="What the read creates" className="bg-surface">
        <StatTile label="Tasks" value={n(total)} sub={`${n(open)} open`} />
        <StatTile label="Drafts" value={n(counts.drafts)} sub="as Backlog" />
        <StatTile
          label="Archived"
          value={n(counts.archived)}
          sub={counts.completed ? `incl. ${n(counts.completed)} in completed/` : 'with their own status'}
        />
        <StatTile label="Subtasks" value={n(counts.subtasks)} sub={`keys like ${subtaskExample}`} />
        <StatTile
          label="Milestones"
          value={n(counts.milestones + counts.archivedMilestones)}
          sub={
            counts.archivedMilestones ? `${n(counts.archivedMilestones)} archived → Completed` : 'as Planned'
          }
        />
      </StatStrip>

      <section className="flex flex-col gap-2" aria-label="Sample">
        <SectionCaption
          label="Sample"
          hint={
            preview.sample.length
              ? `First ${n(preview.sample.length)} of ${n(total)}, in Backlog.md order`
              : 'No task files to read'
          }
        />
        {preview.sample.length ? (
          <ul className="m-0 list-none border border-line bg-surface p-0">
            {preview.sample.map((row) => (
              <li
                key={row.backlogId}
                className="grid h-8 grid-cols-[120px_18px_104px_minmax(0,1fr)_120px] items-center gap-2.5 border-b border-line-2 px-3 text-[12.5px] last:border-b-0"
              >
                <span className="truncate font-mono text-[11px] text-muted">{row.backlogId}</span>
                <span aria-hidden className="text-center text-faint">
                  →
                </span>
                <span className="truncate font-mono text-[11px] font-medium">{row.key}</span>
                <span className="truncate">{row.title}</span>
                <span className="flex items-center gap-[7px] text-muted">
                  <StatusSquare status={row.status} className="shrink-0" />
                  <span className="truncate">
                    {STATUS_LABELS[row.status]}
                    {row.kind === 'archived' ? ' · archived' : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {skipped.length || warned.length || fallbacks.length ? (
        <div className="grid grid-cols-2 items-start gap-2.5">
          {skipped.length || warned.length ? (
            <div className="flex min-w-0 flex-col gap-4">
              {skipped.length ? <FileList label="Will be skipped" files={skipped} severity="error" /> : null}
              {warned.length ? (
                <FileList label="Read with a warning" files={warned} severity="warning" />
              ) : null}
            </div>
          ) : null}
          {fallbacks.length ? (
            <section className="flex min-w-0 flex-col gap-2" aria-label="Fallbacks">
              <SectionCaption label="Fallbacks" count={fallbacks.length} />
              <ProblemList aria-label="Fallbacks">
                {fallbacks.map((problem) => (
                  <ProblemRow key={`${problem.field}:${problem.value}`} severity="warning">
                    <FallbackText problem={problem} />
                  </ProblemRow>
                ))}
              </ProblemList>
            </section>
          ) : null}
        </div>
      ) : (
        <p className="m-0 text-[12.5px] text-muted">
          Every file reads cleanly and every value has a mapping.
        </p>
      )}
    </>
  );
}
