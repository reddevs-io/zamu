import type { Member } from '@pm/contracts';
import { useState } from 'react';
import { describeError, isClientError } from '~/features/tasks/errors';
import { Composer, type ComposerMode, useHotkeys } from '~/ui';
import { CommentMarkdownContent } from './CommentMarkdown';
import { useCreateComment } from './queries';
import { useMentionPicker } from './useMentionPicker';

// The comment box under a task's timeline. M focuses it, Shift+P switches Write and Preview (outside the
// text box, where a capital P is just a letter), @ opens the mention picker, Ctrl/Cmd+Enter sends.
// A failed send keeps the text. Unsent text survives switching tasks for the rest of the session.

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
  /** Overrides the composer's default placeholder (mirrored and hidden tasks). */
  placeholder?: string | undefined;
  className?: string;
}

export function CommentComposer({ taskKey, members, onSent, placeholder, className }: CommentComposerProps) {
  const [value, setValueState] = useState(() => drafts.get(taskKey) ?? '');
  const [mode, setMode] = useState<ComposerMode>('write');
  const create = useCreateComment(taskKey);

  const setValue = (next: string) => {
    setValueState(next);
    if (next) drafts.set(taskKey, next);
    else drafts.delete(taskKey);
  };

  const picker = useMentionPicker({ value, onChange: setValue, members, enabled: mode === 'write' });

  const showWrite = () => {
    // In Write the text box is there: focus it now, so keys typed right after M land in it.
    if (mode === 'write') return picker.focus();
    setMode('write');
    requestAnimationFrame(() => picker.focus());
  };

  useHotkeys({
    m: showWrite,
    'Shift+P': () => (mode === 'write' ? setMode('preview') : showWrite()),
  });

  const submit = () => {
    if (create.isPending) return;
    const body = value.trim();
    if (!body) return;
    create.mutate(body, {
      onSuccess: (comment) => {
        setValue('');
        setMode('write');
        create.reset();
        onSent?.(comment.id);
      },
    });
  };

  const error = create.isError
    ? isClientError(create.error)
      ? `${SEND_FAILED} ${describeError(create.error).message}`
      : SEND_FAILED
    : null;

  return (
    <Composer
      aria-label="Comment"
      value={value}
      onChange={(next) => {
        picker.onChange(next);
        if (create.isError) create.reset();
      }}
      onSubmit={submit}
      mode={mode}
      onModeChange={setMode}
      renderPreview={(text) => <CommentMarkdownContent source={text} members={members} />}
      isSending={create.isPending}
      error={error}
      textAreaRef={picker.textAreaRef}
      onKeyDown={picker.onKeyDown}
      textAreaProps={picker.textAreaProps}
      overlay={picker.overlay}
      {...(placeholder ? { placeholder } : {})}
      className={className}
    />
  );
}
