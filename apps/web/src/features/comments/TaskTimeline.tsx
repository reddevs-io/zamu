import {
  type Activity,
  BACKLOG_ACTOR_NAME,
  type Comment as CommentEntity,
  type Member,
  type ProjectActivity,
} from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNow } from '~/features/tasks/clock';
import { describeError } from '~/features/tasks/errors';
import {
  atTime,
  describeActivity,
  describeCycleEnded,
  formatPageTime,
  formatPaneTime,
} from '~/features/tasks/format';
import {
  describeBacklogFields,
  describeProjectEntry,
  describeVisibilityChange,
  projectRowsForTask,
  shortCommit,
} from '~/features/tasks/mirror';
import { meQuery, timelineQuery } from '~/features/tasks/queries';
import {
  Banner,
  Button,
  Comment,
  CommentDeleted,
  CommentEditor,
  cn,
  Skeleton,
  Switch,
  SystemActorDot,
} from '~/ui';
import { CommentMarkdown } from './CommentMarkdown';
import { useDeleteComment, useUpdateComment } from './queries';
import { useMentionPicker } from './useMentionPicker';

// A task's history: one-line activity entries and boxed comments in time order, with a "Comments only"
// switch. Authors edit their comments in place and delete them after a confirmation; deleted comments
// leave a dashed line. Times render after hydration. Entries a Backlog.md refresh wrote show the
// Backlog.md actor (a filled square) and the commit; a mirrored task also shows the project's first
// read and the detach.

/** "Comments only" stays as set while moving between tasks. */
let commentsOnlyChoice = false;

/** Back to showing activity and comments (tests). */
export function resetTimelinePreferences() {
  commentsOnlyChoice = false;
}

export interface TaskTimelineProps {
  taskKey: string;
  members: readonly Member[];
  /** pane: "32m" / "Oct 20"; page: "5h ago" / "Oct 21, 16:02". */
  size?: 'pane' | 'page';
  /** Wait before loading (the pane holds requests while J/K races through rows). */
  enabled?: boolean;
  /** Comment to bring into view, such as the one just sent. */
  revealId?: string | null;
  /** Project-level Backlog.md entries (first read, detach) of a task that came from Backlog.md. */
  projectHistory?: readonly ProjectActivity[];
  /** Project name for the detach line. */
  projectName?: string;
  /** The mirror's default branch, for the hidden and restored lines. */
  branch?: string | null;
  className?: string;
}

export function TaskTimeline({
  taskKey,
  members,
  size = 'pane',
  enabled = true,
  revealId,
  projectHistory,
  projectName = '',
  branch,
  className,
}: TaskTimelineProps) {
  const result = useQuery({ ...timelineQuery(taskKey), enabled });
  const meId = useQuery(meQuery()).data?.user.id;
  const now = useNow();
  const time = atTime(size === 'page' ? formatPageTime : formatPaneTime, now);
  const [commentsOnly, setCommentsOnlyState] = useState(commentsOnlyChoice);
  const setCommentsOnly = (value: boolean) => {
    commentsOnlyChoice = value;
    setCommentsOnlyState(value);
  };

  const taskItems = result.data?.items;
  const items = taskItems
    ? [...taskItems, ...projectRowsForTask(projectHistory, taskItems)].sort(
        (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
      )
    : undefined;
  const shown = items && commentsOnly ? items.filter((item) => item.kind === 'comment') : items;

  // Bring a just-sent comment into view once it is in the list.
  const revealReady = revealId != null && items?.some((item) => item.id === revealId) === true;
  useEffect(() => {
    if (!revealId || !revealReady) return;
    const element = document.getElementById(commentDomId(revealId));
    element?.scrollIntoView?.({ block: 'nearest' });
  }, [revealId, revealReady]);

  return (
    <section aria-label="Activity and comments" className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-center gap-2.5 border-t border-line pt-3">
        <h3 className="caps m-0">Activity and comments</h3>
        {items ? <span className="font-mono text-[10.5px] text-faint">{items.length}</span> : null}
        <span className="flex-1" />
        <Switch
          isSelected={commentsOnly}
          onChange={setCommentsOnly}
          className="flex-row-reverse text-[11.5px]"
        >
          Comments only
        </Switch>
      </div>
      {shown ? (
        shown.length ? (
          <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
            {shown.map((item) => (
              <li
                key={`${item.kind}:${item.id}`}
                id={item.kind === 'comment' ? commentDomId(item.id) : undefined}
              >
                {item.kind === 'project' ? (
                  <ProjectLine entry={item.entry} projectName={projectName} time={time} />
                ) : item.kind === 'activity' ? (
                  <ActivityLine activity={item} time={time} branch={branch} />
                ) : (
                  <TimelineComment
                    comment={item}
                    taskKey={taskKey}
                    members={members}
                    isOwn={meId != null && item.author.id === meId}
                    time={time}
                  />
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 text-[12.5px] text-faint">No comments yet.</p>
        )
      ) : result.isError ? (
        <TimelineError error={result.error} onRetry={() => result.refetch()} />
      ) : (
        <TimelineSkeleton />
      )}
    </section>
  );
}

const commentDomId = (id: string) => `comment-${id}`;

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

const lineClass =
  'grid grid-cols-[18px_minmax(0,1fr)_auto] items-baseline gap-2.5 px-0.5 text-[12.5px] text-muted';

/** "a1b2c3d" after a Backlog.md line. */
function CommitRef({ commit }: { commit: string | null | undefined }) {
  if (!commit) return null;
  return (
    <>
      {' '}
      <span title={`Commit ${commit}`} className="font-mono text-[11.5px] text-muted">
        {shortCommit(commit)}
      </span>
    </>
  );
}

/** What a Backlog.md refresh did to the task: the mapped changes, then the block-only fields. */
function describeBacklogActivity(activity: Activity, branch: string | null | undefined): string {
  const visibility = describeVisibilityChange(activity.type, branch);
  if (visibility) return visibility;
  if (activity.type === 'task.created') return 'added the task';
  const phrases = [
    activity.changes.length ? describeActivity(activity) : null,
    describeBacklogFields(activity.backlogFields),
  ].filter((phrase): phrase is string => phrase != null);
  return phrases.join(' and ') || 'updated the task';
}

function ActivityLine({
  activity,
  time,
  branch,
}: {
  activity: Activity & { kind: 'activity' };
  time: (value: string) => string;
  branch?: string | null;
}) {
  const isAgent = activity.actor?.kind === 'agent';
  const isSystem = activity.type === 'cycle.ended' && activity.actor == null;
  if (activity.origin === 'backlog' && activity.actor == null) {
    return (
      <div data-activity={activity.type} data-origin="backlog" className={lineClass}>
        <SystemActorDot className="translate-y-[-1px]" />
        <span className="min-w-0">
          <b className="font-semibold text-fg">{BACKLOG_ACTOR_NAME}</b>{' '}
          {describeBacklogActivity(activity, branch)}
          <CommitRef commit={activity.originRef} />
        </span>
        <time dateTime={activity.createdAt} className="font-mono text-[10px] text-faint">
          {time(activity.createdAt)}
        </time>
      </div>
    );
  }
  const visibility = describeVisibilityChange(activity.type, branch);
  return (
    <div data-activity={activity.type} className={lineClass}>
      <span
        aria-hidden
        className={cn(
          'size-[7px] translate-y-[-1px] justify-self-center',
          isAgent ? 'bg-accent' : 'rounded-full bg-line',
        )}
      />
      <span className="min-w-0">
        {visibility ? (
          <>
            <b className="font-semibold text-fg">{activity.actor?.name ?? 'System'}</b> {visibility}
          </>
        ) : isSystem || !activity.actor ? (
          activity.type === 'cycle.ended' ? (
            describeCycleEnded(activity)
          ) : (
            <>
              <b className="font-semibold text-fg">System</b> {describeActivity(activity)}
            </>
          )
        ) : (
          <>
            <b className="font-semibold text-fg">{activity.actor.name}</b>
            {activity.onBehalfOf ? ` for ${activity.onBehalfOf.name}` : null} {describeActivity(activity)}
          </>
        )}
      </span>
      <time dateTime={activity.createdAt} className="font-mono text-[10px] text-faint">
        {time(activity.createdAt)}
      </time>
    </div>
  );
}

/** A project-level entry in a task's history: the first read of Backlog.md, or the detach. */
function ProjectLine({
  entry,
  projectName,
  time,
}: {
  entry: ProjectActivity;
  projectName: string;
  time: (value: string) => string;
}) {
  const isBacklog = entry.origin === 'backlog' && entry.actor == null;
  const isAgent = entry.actor?.kind === 'agent';
  return (
    <div data-activity={entry.type} data-origin={entry.origin} className={lineClass}>
      {isBacklog ? (
        <SystemActorDot className="translate-y-[-1px]" />
      ) : (
        <span
          aria-hidden
          className={cn(
            'size-[7px] translate-y-[-1px] justify-self-center',
            isAgent ? 'bg-accent' : 'rounded-full bg-line',
          )}
        />
      )}
      <span className="min-w-0">
        <b className="font-semibold text-fg">
          {isBacklog ? BACKLOG_ACTOR_NAME : (entry.actor?.name ?? 'System')}
        </b>
        {entry.onBehalfOf ? ` for ${entry.onBehalfOf.name}` : null} {describeProjectEntry(entry, projectName)}
        {isBacklog ? <CommitRef commit={entry.originRef} /> : null}
      </span>
      <time dateTime={entry.createdAt} className="font-mono text-[10px] text-faint">
        {time(entry.createdAt)}
      </time>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function TimelineComment({
  comment,
  taskKey,
  members,
  isOwn,
  time,
}: {
  comment: CommentEntity & { kind: 'comment' };
  taskKey: string;
  members: readonly Member[];
  isOwn: boolean;
  time: (value: string) => string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const update = useUpdateComment(taskKey);
  const remove = useDeleteComment(taskKey);

  if (comment.body == null || comment.deletedAt) {
    const at = comment.deletedAt ?? comment.createdAt;
    return <CommentDeleted by={comment.author.name} time={time(at)} dateTime={at} />;
  }

  const body = comment.body;
  const save = () => {
    if (draft == null || update.isPending) return;
    const next = draft.trim();
    if (!next) return;
    if (next === body.trim()) {
      setDraft(null);
      return;
    }
    update.mutate(
      { id: comment.id, body: next },
      {
        onSuccess: () => {
          setDraft(null);
          update.reset();
        },
      },
    );
  };
  const cancel = () => {
    setDraft(null);
    update.reset();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Comment
        author={{ name: comment.author.name, kind: comment.author.kind }}
        onBehalfOf={comment.onBehalfOf?.name}
        time={time(comment.createdAt)}
        dateTime={comment.createdAt}
        isEdited={comment.editedAt != null}
        isOwn={isOwn}
        onEdit={isOwn ? () => setDraft(body) : undefined}
        onDelete={isOwn ? () => remove.mutate(comment.id) : undefined}
        editor={
          draft != null ? (
            <EditBody
              value={draft}
              onChange={setDraft}
              onSave={save}
              onCancel={cancel}
              members={members}
              isSaving={update.isPending}
              error={update.isError ? `Couldn't save. ${describeError(update.error).message}` : null}
            />
          ) : undefined
        }
      >
        <CommentMarkdown source={body} mentions={comment.mentions} members={members} />
      </Comment>
      {remove.isError ? (
        <p role="alert" className="m-0 pl-7 text-[12px] text-danger">
          Couldn't delete the comment. {describeError(remove.error).message}
        </p>
      ) : null}
    </div>
  );
}

function EditBody({
  value,
  onChange,
  members,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  members: readonly Member[];
  isSaving: boolean;
  error: string | null;
}) {
  const picker = useMentionPicker({
    value,
    onChange,
    members,
    overlayClassName: 'absolute top-full left-0 z-10 mt-1 w-80',
  });
  return (
    <CommentEditor
      {...props}
      value={value}
      onChange={picker.onChange}
      textAreaRef={picker.textAreaRef}
      onKeyDown={picker.onKeyDown}
      textAreaProps={picker.textAreaProps}
      overlay={picker.overlay}
    />
  );
}

// ---------------------------------------------------------------------------
// Loading and errors
// ---------------------------------------------------------------------------

/** Three comment-shaped placeholders (frame 41). */
export function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true">
      {[80, 55, 70].map((width) => (
        <div key={width} className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-2.5">
          <Skeleton width={18} height={18} className="rounded-full" />
          <div className="flex flex-col gap-2 border border-line-2 px-3 py-2.5">
            <Skeleton width={120} />
            <Skeleton width={`${width}%`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Banner
      action={
        <Button variant="secondary" size="sm" onPress={onRetry}>
          Retry
        </Button>
      }
    >
      Couldn't load the history. {describeError(error).message}
    </Banner>
  );
}
