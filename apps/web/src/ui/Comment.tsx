import { type ReactNode, useState } from 'react';
import { Button as AriaButton, Dialog, DialogTrigger, Heading } from 'react-aria-components';
import { Avatar, type MemberKind } from './Avatar';
import { Button } from './Button';
import { cn } from './cn';
import { Popover } from './ListBox';

/** Markdown prose inside comments and the composer preview: paragraphs, lists, code blocks, inline code. */
export const commentProse = cn(
  'flex flex-col gap-2 text-[13px] leading-[1.55] text-fg',
  '[&_p]:m-0 [&_p]:text-pretty',
  '[&_ul]:m-0 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-0.5 [&_ul]:pl-[18px] [&_ol]:m-0 [&_ol]:list-decimal [&_ol]:pl-[18px]',
  '[&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-line-2 [&_pre]:bg-band [&_pre]:px-2.5 [&_pre]:py-2',
  '[&_pre]:font-mono [&_pre]:text-[11px] [&_pre]:leading-[1.6] [&_pre]:whitespace-pre',
  '[&_:not(pre)>code]:bg-band [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[11px]',
  '[&_a:not([data-mention])]:text-accent [&_a:not([data-mention])]:underline',
);

/** Wrapper for rendered Markdown (react-markdown output) with the comment prose styles. */
export function CommentBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(commentProse, className)}>{children}</div>;
}

export interface CommentAuthor {
  name: string;
  kind: MemberKind;
  hue?: number;
  initials?: string;
}

export interface CommentProps {
  author: CommentAuthor;
  /** The responsible human when an agent wrote it: "for Ana Ruiz". */
  onBehalfOf?: string;
  /** Short relative time ("3m") or date ("Oct 20"). */
  time: string;
  /** ISO timestamp for the <time> element. */
  dateTime?: string;
  /** Adds "· edited" after the author. */
  isEdited?: boolean;
  /** Your own comment: shows Edit and Delete. Only authors edit or delete. */
  isOwn?: boolean;
  onEdit?: () => void;
  /** Called after the person confirms in the "Delete this comment?" popover. */
  onDelete?: () => void;
  /** Rendered body (use CommentBody), hidden while `editor` is set. */
  children?: ReactNode;
  /** Edit in place: a CommentEditor. The box takes the focus halo and Edit/Delete hide. */
  editor?: ReactNode;
  /** Avatar in an 18px column left of the box (timeline). Default true. */
  showAvatar?: boolean;
  className?: string;
}

/** Boxed comment on --comment-bg: header (author, "for …", edited, Edit/Delete, time) and body. */
export function Comment({
  author,
  onBehalfOf,
  time,
  dateTime,
  isEdited = false,
  isOwn = false,
  onEdit,
  onDelete,
  children,
  editor,
  showAvatar = true,
  className,
}: CommentProps) {
  const isEditing = editor != null;
  const box = (
    <article
      aria-label={`Comment by ${author.name}`}
      data-editing={isEditing || undefined}
      className={cn(
        'flex min-w-0 flex-col border',
        isEditing
          ? 'border-focus bg-surface shadow-[0_0_0_3px_oklch(0.6_0.15_262/0.2)]'
          : 'border-line bg-comment-bg',
        !showAvatar && className,
      )}
    >
      <header className="flex min-h-[33px] items-center gap-2 border-b border-line-2 py-[5px] pr-2.5 pl-2.5 text-[12px] text-muted">
        <b className="font-semibold text-fg">{author.name}</b>
        {onBehalfOf ? <span>for {onBehalfOf}</span> : null}
        {isEdited ? <span className="text-[11px] text-faint">· edited</span> : null}
        <span className="flex-1" />
        {isOwn && !isEditing ? (
          <>
            {onEdit ? (
              <AriaButton onPress={onEdit} className={iconButton}>
                Edit
              </AriaButton>
            ) : null}
            {onDelete ? <DeleteComment onConfirm={onDelete} /> : null}
          </>
        ) : null}
        <time dateTime={dateTime} className="font-mono text-[10px] text-faint">
          {time}
        </time>
      </header>
      {isEditing ? editor : <div className="px-3 pt-[9px] pb-[11px]">{children}</div>}
    </article>
  );
  if (!showAvatar) return box;
  return (
    <div className={cn('grid grid-cols-[18px_minmax(0,1fr)] items-start gap-2.5', className)}>
      <Avatar {...author} className="mt-1.5" decorative />
      {box}
    </div>
  );
}

const iconButton =
  'inline-flex h-[22px] cursor-pointer items-center border border-transparent px-1.5 text-[11.5px] text-faint outline-none hover:text-fg focus-visible:focus-ring';

function DeleteComment({ onConfirm }: { onConfirm: () => void }) {
  const [isOpen, setOpen] = useState(false);
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setOpen}>
      <AriaButton className={iconButton}>Delete</AriaButton>
      <Popover placement="bottom end" className="w-[300px] min-w-0">
        <Dialog role="alertdialog" className="outline-none">
          <div className="flex flex-col gap-2 px-3.5 py-3">
            <Heading slot="title" className="m-0 text-[13px] font-semibold">
              Delete this comment?
            </Heading>
            <p className="m-0 text-[12px] leading-normal text-muted">
              The history keeps a line saying a comment was deleted. The text is gone.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line-2 px-3.5 py-2">
            <Button variant="secondary" size="sm" autoFocus onPress={() => setOpen(false)}>
              Keep
            </Button>
            <Button
              size="sm"
              className="bg-danger text-on-accent hover:bg-[color-mix(in_oklch,var(--danger)_86%,var(--fg))]"
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

export interface CommentDeletedProps {
  /** Who deleted it. */
  by: string;
  time: string;
  dateTime?: string;
  /** Leave the 18px avatar column empty so it lines up with comments. Default true. */
  indent?: boolean;
  className?: string;
}

/** Dashed placeholder kept in the history: "Comment deleted by Tomás Berg · 1h". */
export function CommentDeleted({ by, time, dateTime, indent = true, className }: CommentDeletedProps) {
  const line = (
    <p className="m-0 border border-dashed border-line px-3 py-2 text-[12px] text-faint italic">
      Comment deleted by {by} · <time dateTime={dateTime}>{time}</time>
    </p>
  );
  if (!indent) return <div className={className}>{line}</div>;
  return (
    <div className={cn('grid grid-cols-[18px_minmax(0,1fr)] gap-2.5', className)}>
      <span />
      {line}
    </div>
  );
}
