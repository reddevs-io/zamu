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
import { Kbd } from './Kbd';

export interface TextFieldProps extends Omit<AriaTextFieldProps, 'children'>, FieldChromeProps {
  placeholder?: string;
  /** Martian Mono 12px, for identifiers such as agent names and keys. */
  mono?: boolean;
  inputClassName?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function TextField({
  label,
  description,
  errorMessage,
  placeholder,
  mono,
  inputClassName,
  inputRef,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField {...props} className={composeTw(props.className, fieldStack)}>
      {({ isInvalid }) => (
        <>
          {label ? <Label>{label}</Label> : null}
          <Input
            ref={inputRef}
            placeholder={placeholder}
            className={cn(inputBase, 'h-[38px]', mono && 'font-mono text-[12px]', inputClassName)}
          />
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
            className={cn(inputBase, 'min-h-[84px] resize-y px-3 py-2.5 leading-normal', inputClassName)}
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
  /** Width in px; the header search is 170, or 140 next to the task list. */
  width?: number;
  inputRef?: Ref<HTMLInputElement>;
}

/** Header search: 30px, hairline border, "/" hint. Esc clears it. */
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
        'group relative flex h-[30px] items-center border border-line bg-transparent focus-within:halo',
      )}
      style={{ width }}
    >
      <Input
        ref={inputRef}
        placeholder={placeholder}
        className="h-full w-full min-w-0 bg-transparent pr-7 pl-2.5 text-fg outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
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
