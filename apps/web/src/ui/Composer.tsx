import type { KeyboardEvent, ReactNode, Ref, SyntheticEvent, TextareaHTMLAttributes } from 'react';
import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  TextArea as AriaTextArea,
  TextField as AriaTextField,
} from 'react-aria-components';
import { Button } from './Button';
import { CommentBody } from './Comment';
import { cn } from './cn';
import { Kbd } from './Kbd';

export type ComposerMode = 'write' | 'preview';

/** Attributes a mention picker needs on the textarea (combobox wiring). */
export type ComposerTextAreaAttributes = Pick<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'aria-activedescendant' | 'aria-controls' | 'aria-expanded' | 'aria-autocomplete' | 'role'
>;

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** Ctrl/Cmd+Enter or the Comment button. Not called while sending or when the text is blank. */
  onSubmit: () => void;
  /** Controlled Write/Preview tab. Leave unset to let the composer own it. */
  mode?: ComposerMode;
  defaultMode?: ComposerMode;
  onModeChange?: (mode: ComposerMode) => void;
  /** Renders the Markdown for Preview (react-markdown output); wrapped in CommentBody. */
  renderPreview: (value: string) => ReactNode;
  /** Sending state: "Sending…" and a dimmed, disabled Comment button. */
  isSending?: boolean;
  /** Failed send: red border, this message in the footer, and the button reads "Try again". Text stays. */
  error?: string | null;
  submitLabel?: string;
  placeholder?: string;
  /** Footer hint on the left. Default: "M to focus". */
  hint?: ReactNode;
  /** Runs before the composer's own keys; call preventDefault to stop Ctrl/Cmd+Enter (mention picker). */
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Caret and selection changes, for the mention picker. */
  onSelect?: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
  textAreaRef?: Ref<HTMLTextAreaElement>;
  textAreaProps?: ComposerTextAreaAttributes;
  /** Floating content anchored to the composer, such as the mention picker (absolutely positioned). */
  overlay?: ReactNode;
  'aria-label'?: string;
  isDisabled?: boolean;
  className?: string;
}

/**
 * Comment box under the timeline: Write/Preview tabs, a growing textarea, and a footer with the hint,
 * the error or sending state, and the Comment button. Idle, focused (halo), error, sending.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  mode,
  defaultMode = 'write',
  onModeChange,
  renderPreview,
  isSending = false,
  error,
  submitLabel = 'Comment',
  placeholder = 'Leave a comment. @ to mention someone.',
  hint,
  onKeyDown,
  onSelect,
  textAreaRef,
  textAreaProps,
  overlay,
  isDisabled = false,
  className,
  ...props
}: ComposerProps) {
  const canSubmit = !isSending && !isDisabled && value.trim().length > 0;
  const submit = () => {
    if (canSubmit) onSubmit();
  };
  return (
    <fieldset
      aria-label={props['aria-label'] ?? 'Comment'}
      className="relative m-0 min-w-0 border-0 p-0"
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submit();
        }
      }}
    >
      {overlay}
      <AriaTabs
        selectedKey={mode}
        defaultSelectedKey={mode ? undefined : defaultMode}
        onSelectionChange={(key) => onModeChange?.(key as ComposerMode)}
        data-error={error ? true : undefined}
        className={cn(
          'flex flex-col border bg-surface',
          error
            ? 'border-danger'
            : 'border-line has-[textarea:focus]:border-focus has-[textarea:focus]:shadow-[0_0_0_3px_oklch(0.6_0.15_262/0.2)]',
          className,
        )}
      >
        <div className="flex h-[30px] items-center gap-3.5 border-b border-line-2 px-2.5 text-[11.5px] text-muted">
          <AriaTabList aria-label="Comment mode" className="flex h-full items-center gap-3.5">
            <AriaTab id="write" className={tabClass}>
              Write
            </AriaTab>
            <AriaTab id="preview" className={tabClass}>
              Preview
            </AriaTab>
          </AriaTabList>
          <span className="flex-1" />
          <span>Markdown</span>
        </div>
        <AriaTabPanel id="write" className="outline-none">
          <AriaTextField
            aria-label={props['aria-label'] ?? 'Comment'}
            value={value}
            onChange={onChange}
            isDisabled={isDisabled}
            className="flex"
          >
            <AriaTextArea
              {...textAreaProps}
              ref={textAreaRef}
              placeholder={placeholder}
              onKeyDown={onKeyDown}
              onSelect={onSelect}
              rows={2}
              className="max-h-[320px] min-h-14 w-full resize-none border-0 bg-transparent px-3 py-[9px] text-[13px] leading-[1.55] text-fg outline-none [field-sizing:content] placeholder:text-faint"
            />
          </AriaTextField>
        </AriaTabPanel>
        <AriaTabPanel
          id="preview"
          className="min-h-14 px-3 py-[9px] outline-none focus-visible:focus-ring-inset"
        >
          {value.trim() ? (
            <CommentBody>{renderPreview(value)}</CommentBody>
          ) : (
            <p className="m-0 text-[13px] text-faint">Nothing to preview.</p>
          )}
        </AriaTabPanel>
        <div className="flex min-h-10 items-center gap-2.5 border-t border-line-2 py-1.5 pr-2 pl-3 text-[11.5px] text-faint">
          {error ? (
            <span role="alert" className="flex items-center gap-2 text-danger">
              <span aria-hidden className="size-2 shrink-0 bg-danger" />
              {error}
            </span>
          ) : (
            (hint ?? (
              <span className="flex items-center gap-1.5">
                <Kbd>M</Kbd>to focus
              </span>
            ))
          )}
          <span className="flex-1" />
          {isSending ? (
            <>
              <span className="text-muted" role="status">
                Sending…
              </span>
              <Button size="sm" isDisabled className="disabled:opacity-55">
                {submitLabel}
              </Button>
            </>
          ) : (
            <Button size="sm" kbd="⌘↵" isDisabled={isDisabled} onPress={submit}>
              {error ? 'Try again' : submitLabel}
            </Button>
          )}
        </div>
      </AriaTabs>
    </fieldset>
  );
}

const tabClass = ({ isSelected }: { isSelected: boolean }) =>
  cn(
    'cursor-pointer outline-none focus-visible:focus-ring',
    isSelected ? 'font-semibold text-fg' : 'text-muted hover:text-fg',
  );

export interface CommentEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Save button or Ctrl/Cmd+Enter. Not called while saving or when the text is blank. */
  onSave: () => void;
  /** Cancel button or Esc. */
  onCancel: () => void;
  isSaving?: boolean;
  /** Failed save: message in the footer. Text stays. */
  error?: string | null;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  textAreaRef?: Ref<HTMLTextAreaElement>;
  textAreaProps?: ComposerTextAreaAttributes;
  /** Mention picker or other floating content. */
  overlay?: ReactNode;
  autoFocus?: boolean;
}

/** Edit-in-place body for Comment's `editor`: textarea, then "Editing", Cancel, Save ⌘↵. */
export function CommentEditor({
  value,
  onChange,
  onSave,
  onCancel,
  isSaving = false,
  error,
  onKeyDown,
  textAreaRef,
  textAreaProps,
  overlay,
  autoFocus = true,
}: CommentEditorProps) {
  const canSave = !isSaving && value.trim().length > 0;
  return (
    <div className="relative flex flex-col">
      {overlay}
      <AriaTextField aria-label="Edit comment" value={value} onChange={onChange} className="flex">
        <AriaTextArea
          {...textAreaProps}
          ref={textAreaRef}
          autoFocus={autoFocus}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (event.defaultPrevented) return;
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (canSave) onSave();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          className="min-h-14 w-full resize-none border-0 bg-transparent px-3 pt-[9px] pb-[11px] text-[13px] leading-[1.55] text-fg outline-none [field-sizing:content]"
        />
      </AriaTextField>
      <div className="flex items-center gap-2.5 border-t border-line-2 py-1.5 pr-2 pl-3 text-[11.5px] text-faint">
        {error ? (
          <span role="alert" className="flex items-center gap-2 text-danger">
            <span aria-hidden className="size-2 shrink-0 bg-danger" />
            {error}
          </span>
        ) : (
          <span>Editing</span>
        )}
        <span className="flex-1" />
        <Button variant="secondary" size="sm" className="h-[26px]" onPress={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          kbd="⌘↵"
          className="h-[26px]"
          isPending={isSaving}
          isDisabled={!canSave}
          onPress={onSave}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
