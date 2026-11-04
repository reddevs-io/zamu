import type { BacklogMode } from '@pm/contracts';
import type { ReactNode } from 'react';
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from 'react-aria-components';
import { Banner, Button, cn, InlineCode, NoticeStrip, RadioDot, Skeleton, SourceStatusDot } from '~/ui';
import { DetailBox, Question } from './parts';

// Step 1 (frames 3a to 3c): mirror or import, and the check that the project has no tasks.

export interface ModeStepProps {
  projectKey: string;
  projectName: string;
  mode: BacklogMode;
  onModeChange: (mode: BacklogMode) => void;
  /** Tasks in the project (hidden included); undefined while loading. */
  taskCount: number | undefined;
  taskCountError: boolean;
  onRetry: () => void;
  onNewFromBacklog: () => void;
  onBackToProject: () => void;
}

function ModeCard({
  value,
  title,
  children,
  note,
}: {
  value: BacklogMode;
  title: string;
  children: ReactNode;
  note: ReactNode;
}) {
  return (
    <AriaRadio
      value={value}
      className={({ isSelected, isFocusVisible }) =>
        cn(
          'flex cursor-pointer flex-col gap-1.5 rounded-md border px-4 py-3.5 outline-none',
          isSelected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-bg-grp',
          isFocusVisible && 'focus-ring',
        )
      }
    >
      {({ isSelected }) => (
        <>
          <span className="flex items-center gap-2.5 font-semibold">
            <RadioDot selected={isSelected} />
            {title}
          </span>
          <span className="text-sm leading-normal text-fg-2">{children}</span>
          <span className="text-xs text-fg-3">{note}</span>
        </>
      )}
    </AriaRadio>
  );
}

/** "PAY-1 to PAY-12" (or just "PAY-1"). */
function keyRange(projectKey: string, count: number): string {
  return count === 1 ? `${projectKey}-1` : `${projectKey}-1 to ${projectKey}-${count}`;
}

export function ModeStep({
  projectKey,
  projectName,
  mode,
  onModeChange,
  taskCount,
  taskCountError,
  onRetry,
  onNewFromBacklog,
  onBackToProject,
}: ModeStepProps) {
  return (
    <>
      <Question>How should {projectName} use the Backlog.md files?</Question>
      <AriaRadioGroup
        aria-label="Mode"
        value={mode}
        onChange={(value) => onModeChange(value as BacklogMode)}
        className="grid grid-cols-2 gap-2.5"
      >
        <ModeCard
          value="mirror"
          title="Mirror"
          note={
            <>
              For teams whose agents keep working in <InlineCode>backlog/</InlineCode>.
            </>
          }
        >
          Follow the default branch. When a push changes a task file, the task here changes too. Fields from
          the files are read-only here; comments, cycles and card order are not.
        </ModeCard>
        <ModeCard value="import" title="Import once" note="For moving off Backlog.md.">
          Read the files one time and detach. Every task is editable here afterwards, and the files stop
          mattering.
        </ModeCard>
      </AriaRadioGroup>
      {taskCountError ? (
        <Banner
          action={
            <Button variant="secondary" size="sm" onPress={onRetry}>
              Retry
            </Button>
          }
        >
          Couldn't check whether {projectName} has tasks. Check your connection and try again.
        </Banner>
      ) : taskCount === undefined ? (
        <Skeleton height={34} />
      ) : taskCount > 0 ? (
        <DetailBox tone="error">
          <div className="flex flex-col gap-2">
            <span>
              <b className="font-semibold">
                {projectName} already has {taskCount.toLocaleString('en-US')}{' '}
                {taskCount === 1 ? 'task' : 'tasks'}.
              </b>{' '}
              Mirror and import need a project with no tasks, because Backlog.md numbers become the task keys
              and would collide with {keyRange(projectKey, taskCount)}.
            </span>
            <span className="flex gap-2">
              <Button size="sm" onPress={onNewFromBacklog}>
                New project from Backlog.md
              </Button>
              <Button variant="secondary" size="sm" onPress={onBackToProject}>
                Back to {projectName}
              </Button>
            </span>
          </div>
        </DetailBox>
      ) : (
        <NoticeStrip marker={<SourceStatusDot state="healthy" decorative />}>
          <span>{projectName} has no tasks yet, so Backlog.md numbers can become its task keys.</span>
        </NoticeStrip>
      )}
    </>
  );
}
