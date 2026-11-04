import type { ReactNode, Ref } from 'react';
import {
  SearchField as AriaSearchField,
  type SearchFieldProps as AriaSearchFieldProps,
  TextArea as AriaTextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  Input,
} from 'react-aria-components';
import { cn, composeTw } from './cn';
import { type FieldChromeProps, FieldDescription, FieldError, fieldStack, inputBase, Label } from './Field';
import { LockGlyph } from './Glyphs';
import { Kbd } from './Kbd';
import { SearchGlyph } from './layout/ShellGlyphs';

export interface TextFieldProps extends Omit<AriaTextFieldProps, 'children'>, FieldChromeProps {
  placeholder?: string;
  /**
   * Identifiers such as agent names and keys: tabular figures. Margin sets keys in Onest, not a monospace;
   * the code font is for code only.
   */
  mono?: boolean;
  /**
   * A field Backlog.md owns: read-only with a lock at the right (design "Read-only (mirrored)"). Implies
   * isReadOnly. Say why next to it (description or a tooltip on the lock's row).
   */
  locked?: boolean;
  inputClassName?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function TextField({
  label,
  description,
  errorMessage,
  placeholder,
  mono,
  locked = false,
  inputClassName,
  inputRef,
  ...props
}: TextFieldProps) {
  const input = (
    <Input
      ref={inputRef}
      placeholder={placeholder}
      className={cn(inputBase, 'h-9', mono && 'tabular-nums', locked && 'pr-7', inputClassName)}
    />
  );
  return (
    <AriaTextField
      {...props}
      isReadOnly={locked || props.isReadOnly}
      className={composeTw(props.className, fieldStack)}
    >
      {({ isInvalid }) => (
        <>
          {label ? <Label>{label}</Label> : null}
          {locked ? (
            <span className="relative flex">
              {input}
              <LockGlyph className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-3" />
            </span>
          ) : (
            input
          )}
          {description && !isInvalid ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError>{errorMessage as ReactNode}</FieldError>
        </>
      )}
    </AriaTextField>
  );
}

export interface TextAreaProps extends Omit<AriaTextFieldProps, 'children'>, FieldChromeProps {
  placeholder?: string;
  rows?: number;
  inputClassName?: string;
  inputRef?: Ref<HTMLTextAreaElement>;
}

/** Multi-line text, 84px minimum height (quick create description). */
export function TextArea({
  label,
  description,
  errorMessage,
  placeholder,
  rows = 3,
  inputClassName,
  inputRef,
  ...props
}: TextAreaProps) {
  return (
    <AriaTextField {...props} className={composeTw(props.className, fieldStack)}>
      {({ isInvalid }) => (
        <>
          {label ? <Label>{label}</Label> : null}
          <AriaTextArea
            ref={inputRef}
            rows={rows}
            placeholder={placeholder}
            className={cn(inputBase, 'min-h-21 resize-y px-2.75 py-2 leading-prose', inputClassName)}
          />
          {description && !isInvalid ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError>{errorMessage as ReactNode}</FieldError>
        </>
      )}
    </AriaTextField>
  );
}

export interface SearchFieldProps extends Omit<AriaSearchFieldProps, 'children'> {
  placeholder?: string;
  /** Shortcut hint shown while the field is empty. The screen binds the key with useHotkeys. */
  kbd?: string;
  /** Width in px; the view header search is 200 (default 170 for the older headers). */
  width?: number;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * Header search (margin.css .search): 30px, radius md, --line-soft border, a magnifier, the "/" hint.
 * Esc clears it.
 */
export function SearchField({
  placeholder = 'Search',
  kbd = '/',
  width = 170,
  inputRef,
  ...props
}: SearchFieldProps) {
  return (
    <AriaSearchField
      aria-label={props['aria-label'] ?? placeholder}
      {...props}
      className={composeTw(
        props.className,
        'group relative flex h-7.5 items-center rounded-md border border-line-soft bg-transparent text-sm focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]',
      )}
      style={{ width }}
    >
      <SearchGlyph className="pointer-events-none absolute left-2.25 text-fg-3" />
      <Input
        ref={inputRef}
        placeholder={placeholder}
        className="h-full w-full min-w-0 bg-transparent pr-7 pl-8.25 text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:hidden"
      />
      <Kbd
        aria-hidden
        className="pointer-events-none absolute right-1.5 group-data-[empty]:inline-block hidden"
      >
        {kbd}
      </Kbd>
    </AriaSearchField>
  );
}
