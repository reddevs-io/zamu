import type { Member } from '@zamu/contracts';
import { useRef, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { describeError, isClientError } from '~/features/tasks/errors';
import { cn, Kbd, useHotkeys } from '~/ui';
import { CommentBox, type CommentBoxHandle } from './CommentBox';
import { useCreateComment } from './queries';

// The comment box at the end of a task's history (frames 051, 054, 058). Closed it reads "Leave a
// comment" with the M hint; M or a click opens it with Write / Preview, @ mentions, Cancel and
// Comment ⌘↵. A failed send keeps the text. Unsent text survives switching tasks for the session, and
// a task with a draft opens with the box open.

const drafts = new Map<string, string>();

/** Forgets every unsent draft (tests, sign-out). */
export function clearCommentDrafts() {
  drafts.clear();
}

export const SEND_FAILED = "Couldn't send. Your text is still here.";

export interface CommentComposerProps {
  taskKey: string;
  members: readonly Member[];
  /** Called with the new comment's id once the server saved it. */
  onSent?: (commentId: string) => void;
  /** Overrides "Leave a comment" (mirrored and hidden tasks). */
  placeholder?: string | undefined;
  /** M opens the box (default true; off while another screen owns M). */
  hotkey?: boolean;
  className?: string;
}

export function CommentComposer({
  taskKey,
  members,
  onSent,
  placeholder = 'Leave a comment',
  hotkey = true,
  className,
}: CommentComposerProps) {
  const [value, setValueState] = useState(() => drafts.get(taskKey) ?? '');
  const [isOpen, setOpen] = useState(() => drafts.has(taskKey));
  const box = useRef<CommentBoxHandle>(null);
  const create = useCreateComment(taskKey);

  const setValue = (next: string) => {
    setValueState(next);
    if (next) drafts.set(taskKey, next);
    else drafts.delete(taskKey);
    if (create.isError) create.reset();
  };

  const open = () => {
    if (isOpen) box.current?.focus();
    else setOpen(true);
  };

  useHotkeys({ m: hotkey ? open : null });

  const close = () => {
    setValue('');
    create.reset();
    setOpen(false);
  };

  const submit = () => {
    if (create.isPending) return;
    const body = value.trim();
    if (!body) return;
    create.mutate(body, {
      onSuccess: (comment) => {
        setValue('');
        create.reset();
        setOpen(false);
        onSent?.(comment.id);
      },
    });
  };

  if (!isOpen) {
    return (
      <AriaButton
        onPress={open}
        aria-keyshortcuts="m"
        className={cn(
          'flex w-full cursor-text items-center gap-2 rounded-md border border-line px-3.25 py-2.75 text-left text-md text-fg-3 outline-none hover:border-fg-3 focus-visible:focus-ring',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{placeholder}</span>
        <Kbd aria-hidden>M</Kbd>
      </AriaButton>
    );
  }

  const error = create.isError
    ? isClientError(create.error)
      ? `${SEND_FAILED} ${describeError(create.error).message}`
      : SEND_FAILED
    : null;

  return (
    <CommentBox
      handleRef={box}
      label="Comment"
      value={value}
      onChange={setValue}
      onSubmit={submit}
      onCancel={close}
      // Esc leaves the box and keeps the text, so the next Esc reaches the page (back to the list).
      onEscape={() => {
        if (!value.trim()) close();
        else (document.activeElement as HTMLElement | null)?.blur();
      }}
      members={members}
      submitLabel="Comment"
      placeholder={placeholder}
      isSending={create.isPending}
      error={error}
      autoFocus
      className={className}
    />
  );
}
