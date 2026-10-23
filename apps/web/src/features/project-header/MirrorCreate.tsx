import { DisabledCreateButton, type DisabledCreateButtonProps, InlineCode } from '~/ui';
import { milestonesFolder, tasksFolder } from './mirror';

// The dashed, faint create buttons of a mirrored project (frame 4d) and their tooltips. The text is
// the same as the toast C and quick create show (createRefusalText).

/** "Tasks in Payments come from Backlog.md. Add a file under backlog/tasks/, or run …" with code. */
export function CreateRefusal({ projectName, folder }: { projectName: string; folder?: string | null }) {
  return (
    <>
      Tasks in {projectName} come from Backlog.md. Add a file under{' '}
      <InlineCode>{tasksFolder(folder)}</InlineCode>, or run <InlineCode>backlog task create</InlineCode>, and
      push. It shows up here after the next refresh.
    </>
  );
}

/** "Milestones in Payments come from Backlog.md. Add a file under backlog/milestones/ and push." */
export function MilestoneRefusal({ projectName, folder }: { projectName: string; folder?: string | null }) {
  return (
    <>
      Milestones in {projectName} come from Backlog.md. Add a file under{' '}
      <InlineCode>{milestonesFolder(folder)}</InlineCode> and push.
    </>
  );
}

export interface MirrorCreateButtonProps extends Omit<DisabledCreateButtonProps, 'tooltip'> {
  projectName: string;
  /** What the button would create. Defaults to tasks. */
  kind?: 'task' | 'milestone';
}

/** "New C" that explains instead of creating. Pressing it may show the same text as a toast. */
export function MirrorCreateButton({ projectName, kind = 'task', ...props }: MirrorCreateButtonProps) {
  return (
    <DisabledCreateButton
      {...props}
      tooltip={
        kind === 'milestone' ? (
          <MilestoneRefusal projectName={projectName} />
        ) : (
          <CreateRefusal projectName={projectName} />
        )
      }
    />
  );
}
