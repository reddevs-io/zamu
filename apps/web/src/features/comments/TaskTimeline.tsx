import {
  type Activity,
  BACKLOG_ACTOR_NAME,
  type Comment as CommentEntity,
  type Member,
  type ProjectActivity,
  type UserRef,
} from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { Button as AriaButton, Dialog, DialogTrigger, Heading } from 'react-aria-components';
import { useNow } from '~/features/tasks/clock';
import { describeError } from '~/features/tasks/errors';
import { atTime, describeActivity, describeCycleEnded, formatRelative } from '~/features/tasks/format';
import {
  describeBacklogFields,
  describeProjectEntry,
  describeVisibilityChange,
  projectRowsForTask,
  shortCommit,
} from '~/features/tasks/mirror';
import { meQuery, timelineQuery } from '~/features/tasks/queries';
import { Avatar, Banner, Button, cn, Popover, Skeleton } from '~/ui';
import { CommentBox } from './CommentBox';
import { CommentMarkdown } from './CommentMarkdown';
import { useDeleteComment, useUpdateComment } from './queries';

// A task's history (frames 051, 054, 057): one-line events and comment cards in time order, with All /
// Comments. Long histories show the latest entries under "23 earlier · Show all". Agent comments say who
// they act for and carry a side rule. Authors edit their comments in place and delete them after a
// confirmation; deleted comments leave a dashed line. Times render after hydration. Entries a Backlog.md
// refresh wrote read "… in the file" with the commit; a mirrored task also shows the project's import and
// the detach.

/** "Comments" stays as set while moving between tasks. */
let commentsOnlyChoice = false;

/** Back to showing everything (tests). */
export function resetTimelinePreferences() {
  commentsOnlyChoice = false;
}

/** Histories longer than this fold their older entries. */
export const FOLD_AFTER = 20;
/** How many entries a folded history shows. */
export const FOLDED_SHOWN = 15;

export interface TaskTimelineProps {
  taskKey: string;
  members: readonly Member[];
  /** Kept for older callers; the history reads the same everywhere. */
  size?: 'pane' | 'page';
  /** Wait before loading (panels hold requests while J/K race through rows). */
  enabled?: boolean;
  /** Comment to bring into view, such as the one just sent. */
  revealId?: string | null;
  /** Project-level Backlog.md entries (import, detach) of a task that came from Backlog.md. */
  projectHistory?: readonly ProjectActivity[];
  /** Project name for the detach line. */
  projectName?: string;
  /** The mirror's default branch, for the hidden and restored lines. */
  branch?: string | null;
  /** The task's file, for "imported this from backlog/tasks/hbr-71.md". */
  file?: string | null;
  /** The comment box, drawn after the last entry. */
  composer?: ReactNode;
  className?: string;
}

type Entry =
  | (Activity & { kind: 'activity' })
  | (CommentEntity & { kind: 'comment' })
  | ReturnType<typeof projectRowsForTask>[number];

export function TaskTimeline({
  taskKey,
  members,
  enabled = true,
  revealId,
  projectHistory,
  projectName = '',
  branch,
  file,
  composer,
  className,
}: TaskTimelineProps) {
  const result = useQuery({ ...timelineQuery(taskKey), enabled });
  const meId = useQuery(meQuery()).data?.user.id;
  const now = useNow();
  const time = atTime(formatRelative, now);
  const [commentsOnly, setCommentsOnlyState] = useState(commentsOnlyChoice);
  const [showAll, setShowAll] = useState(false);
  const setCommentsOnly = (value: boolean) => {
    commentsOnlyChoice = value;
    setCommentsOnlyState(value);
  };

  const taskItems = result.data?.items;
  const items: Entry[] | undefined = taskItems
    ? [...taskItems, ...projectRowsForTask(projectHistory, taskItems)].sort(
        (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
      )
    : undefined;
  const filtered = items && commentsOnly ? items.filter((item) => item.kind === 'comment') : items;
  const folded = filtered != null && !showAll && filtered.length > FOLD_AFTER;
  const shown = folded ? filtered.slice(-FOLDED_SHOWN) : filtered;
  const earlier = folded && filtered ? filtered.length - FOLDED_SHOWN : 0;

  // Bring a just-sent comment into view once it is in the list.
  const revealReady = revealId != null && shown?.some((item) => item.id === revealId) === true;
  useEffect(() => {
    if (!revealId || !revealReady) return;
    document.getElementById(commentDomId(revealId))?.scrollIntoView?.({ block: 'nearest' });
  }, [revealId, revealReady]);

  return (
    <section aria-label="Activity" className={cn('flex flex-col', className)}>
      <div className="mt-6 mb-1.5 flex items-center gap-2 text-sm text-fg-2">
        <h2 className="m-0 text-sm font-semibold">Activity</h2>
        {earlier > 0 && items ? <span className="tabular-nums">{items.length}</span> : null}
        <fieldset aria-label="Show" className="m-0 ml-auto flex gap-0.5 border-0 p-0">
          <FilterTab isSelected={!commentsOnly} onPress={() => setCommentsOnly(false)}>
            All
          </FilterTab>
          <FilterTab isSelected={commentsOnly} onPress={() => setCommentsOnly(true)}>
            Comments
          </FilterTab>
        </fieldset>
      </div>
      {shown ? (
        <div className="mt-1 flex flex-col gap-2.5">
          {earlier > 0 ? (
            <AriaButton
              onPress={() => setShowAll(true)}
              className="flex cursor-pointer items-center gap-2.5 rounded-sm text-sm text-fg-3 outline-none before:flex-1 before:border-t before:border-dashed before:border-line after:flex-1 after:border-t after:border-dashed after:border-line hover:text-fg-2 focus-visible:focus-ring"
            >
              {earlier} earlier · Show all
            </AriaButton>
          ) : null}
          {shown.length ? (
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {shown.map((item) => (
                <li
                  key={`${item.kind}:${item.id}`}
                  id={item.kind === 'comment' ? commentDomId(item.id) : undefined}
                >
                  {item.kind === 'project' ? (
                    <ProjectLine entry={item.entry} projectName={projectName} file={file} time={time} />
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
            <p className="m-0 text-sm text-fg-3">No comments yet.</p>
          )}
          {composer}
        </div>
      ) : result.isError ? (
        <TimelineError error={result.error} onRetry={() => result.refetch()} />
      ) : (
        <TimelineSkeleton />
      )}
    </section>
  );
}

const commentDomId = (id: string) => `comment-${id}`;

function FilterTab({
  isSelected,
  onPress,
  children,
}: {
  isSelected: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <AriaButton
      onPress={onPress}
      aria-pressed={isSelected}
      className={cn(
        'inline-flex h-6 cursor-pointer items-center rounded-sm px-2 text-xs font-medium outline-none focus-visible:focus-ring',
        isSelected ? 'bg-bg-grp text-fg' : 'text-fg-2 hover:text-fg',
      )}
    >
      {children}
    </AriaButton>
  );
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** First name of a person, for "claude-dev for Ana". */
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function ActorAvatar({ actor }: { actor: Pick<UserRef, 'name' | 'kind'> | null }) {
  if (!actor) return <Avatar name={BACKLOG_ACTOR_NAME} kind="agent" initials="B" decorative />;
  return <Avatar name={actor.name} kind={actor.kind} decorative />;
}

function EventLine({
  type,
  origin,
  actor,
  who,
  children,
  at,
  time,
}: {
  type: string;
  origin?: string;
  actor: Pick<UserRef, 'name' | 'kind'> | null;
  /** Bold: "claude-dev for Ana", "Backlog.md". Omitted for sentences without an actor. */
  who?: string;
  children: ReactNode;
  at: string;
  time: (value: string) => string;
}) {
  return (
    <div
      data-activity={type}
      data-origin={origin}
      className="flex min-w-0 items-center gap-2 pl-0.5 text-sm text-fg-3"
    >
      <ActorAvatar actor={actor} />
      <span className="min-w-0 flex-1 truncate">
        {who ? <b className="font-medium text-fg-2">{who}</b> : null}
        {who ? ' ' : null}
        {children}
      </span>
      <time dateTime={at} className="shrink-0 tabular-nums">
        {time(at)}
      </time>
    </div>
  );
}

/** "a1b2c3d" after a Backlog.md line. */
function CommitRef({ commit }: { commit: string | null | undefined }) {
  if (!commit) return null;
  return (
    <>
      {' '}
      <span title={`Commit ${commit}`} className="font-mono text-xs">
        {shortCommit(commit)}
      </span>
    </>
  );
}

/** What a Backlog.md refresh did to the task: the mapped changes, then the block-only fields, "in the file". */
function describeBacklogActivity(activity: Activity, branch: string | null | undefined): string {
  const visibility = describeVisibilityChange(activity.type, branch);
  if (visibility) return visibility;
  if (activity.type === 'task.created') return 'added this from the file';
  const phrases = [
    activity.changes.length ? describeActivity(activity) : null,
    describeBacklogFields(activity.backlogFields),
  ].filter((phrase): phrase is string => phrase != null);
  return `${phrases.join(' and ') || 'updated this'} in the file`;
}

const actorName = (actor: UserRef, onBehalfOf: UserRef | null) =>
  onBehalfOf ? `${actor.name} for ${firstName(onBehalfOf.name)}` : actor.name;

function ActivityLine({
  activity,
  time,
  branch,
}: {
  activity: Activity & { kind: 'activity' };
  time: (value: string) => string;
  branch?: string | null;
}) {
  const base = { type: activity.type, at: activity.createdAt, time };
  if (activity.origin === 'backlog') {
    // A refresh: the file's author is unknown, so the Backlog.md actor speaks (or the person who
    // pressed Refresh, when one did).
    return (
      <EventLine
        {...base}
        origin="backlog"
        actor={activity.actor}
        who={activity.actor ? actorName(activity.actor, activity.onBehalfOf) : BACKLOG_ACTOR_NAME}
      >
        {describeBacklogActivity(activity, branch)}
        <CommitRef commit={activity.originRef} />
      </EventLine>
    );
  }
  const visibility = describeVisibilityChange(activity.type, branch);
  if (!activity.actor) {
    return (
      <EventLine {...base} actor={null} who={activity.type === 'cycle.ended' ? undefined : 'System'}>
        {activity.type === 'cycle.ended'
          ? describeCycleEnded(activity)
          : (visibility ?? describeActivity(activity))}
      </EventLine>
    );
  }
  return (
    <EventLine {...base} actor={activity.actor} who={actorName(activity.actor, activity.onBehalfOf)}>
      {visibility ?? describeActivity(activity)}
    </EventLine>
  );
}

/** A project-level entry in a task's history: the import from Backlog.md, or the detach. */
function ProjectLine({
  entry,
  projectName,
  file,
  time,
}: {
  entry: ProjectActivity;
  projectName: string;
  file?: string | null;
  time: (value: string) => string;
}) {
  const isBacklog = entry.origin === 'backlog' && entry.actor == null;
  return (
    <EventLine
      type={entry.type}
      origin={entry.origin}
      actor={entry.actor}
      who={isBacklog ? BACKLOG_ACTOR_NAME : entry.actor ? actorName(entry.actor, entry.onBehalfOf) : 'System'}
      at={entry.createdAt}
      time={time}
    >
      {describeProjectEntry(entry, projectName, file)}
      {isBacklog ? <CommitRef commit={entry.originRef} /> : null}
    </EventLine>
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
    return (
      <p className="m-0 rounded-md border border-dashed border-line px-3.25 py-2 text-sm text-fg-3">
        Comment deleted by {comment.author.name} · <time dateTime={at}>{time(at)}</time>
      </p>
    );
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

  if (draft != null) {
    return (
      <CommentBox
        label="Edit comment"
        value={draft}
        onChange={setDraft}
        onSubmit={save}
        onCancel={cancel}
        onEscape={cancel}
        members={members}
        submitLabel="Save"
        isSending={update.isPending}
        error={update.isError ? `Couldn't save. ${describeError(update.error).message}` : null}
        autoFocus
      />
    );
  }

  const isAgent = comment.author.kind === 'agent';
  return (
    <div className="flex flex-col gap-1.5">
      <article
        aria-label={`Comment by ${comment.author.name}`}
        data-agent={isAgent || undefined}
        className={cn(
          'group flex min-w-0 flex-col gap-1.5 rounded-md bg-surface px-3.25 py-2.75',
          // Agent comments carry a side rule in --fg-3 (Task.dc.html .cmt.agent).
          isAgent ? 'shadow-[var(--shadow-card),inset_2px_0_0_var(--fg-3)]' : 'shadow-card',
        )}
      >
        <header className="flex min-w-0 items-center gap-2 text-sm text-fg-3">
          <Avatar name={comment.author.name} kind={comment.author.kind} decorative />
          <b className="truncate font-semibold text-fg">{comment.author.name}</b>
          {comment.onBehalfOf ? (
            <span className="truncate">acting for {firstName(comment.onBehalfOf.name)}</span>
          ) : null}
          {comment.editedAt ? <span className="text-xs">· edited</span> : null}
          <span className="flex-1" />
          {isOwn ? (
            <span className="flex items-center gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
              <AriaButton onPress={() => setDraft(body)} className={commentAction}>
                Edit
              </AriaButton>
              <DeleteComment onConfirm={() => remove.mutate(comment.id)} />
            </span>
          ) : null}
          <time dateTime={comment.createdAt} className="shrink-0 tabular-nums">
            {time(comment.createdAt)}
          </time>
        </header>
        <CommentMarkdown source={body} mentions={comment.mentions} members={members} />
      </article>
      {remove.isError ? (
        <p role="alert" className="m-0 text-sm text-danger">
          Couldn't delete the comment. {describeError(remove.error).message}
        </p>
      ) : null}
    </div>
  );
}

const commentAction =
  'inline-flex h-5.5 cursor-pointer items-center rounded-sm px-1.5 text-xs text-fg-3 outline-none hover:bg-bg-lane hover:text-fg focus-visible:focus-ring';

function DeleteComment({ onConfirm }: { onConfirm: () => void }) {
  const [isOpen, setOpen] = useState(false);
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setOpen}>
      <AriaButton className={commentAction}>Delete</AriaButton>
      <Popover placement="bottom end" className="w-75 min-w-0">
        <Dialog role="alertdialog" className="outline-none">
          <div className="flex flex-col gap-2 px-3.5 py-3">
            <Heading slot="title" className="m-0 text-md font-semibold">
              Delete this comment?
            </Heading>
            <p className="m-0 text-sm leading-normal text-fg-2">
              The history keeps a line saying a comment was deleted. The text is gone.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line-soft px-3.5 py-2">
            <Button variant="secondary" size="sm" autoFocus onPress={() => setOpen(false)}>
              Keep
            </Button>
            <Button
              variant="danger"
              size="sm"
              onPress={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              Delete
            </Button>
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

// ---------------------------------------------------------------------------
// Loading and errors
// ---------------------------------------------------------------------------

/** Two event lines and a comment-shaped placeholder. */
export function TimelineSkeleton() {
  return (
    <div className="mt-1 flex flex-col gap-2.5" aria-busy="true">
      <Skeleton width="45%" />
      <Skeleton width="55%" />
      <div className="flex flex-col gap-2 rounded-md bg-surface px-3.25 py-2.75 shadow-card">
        <Skeleton width={120} />
        <Skeleton width="80%" />
      </div>
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
