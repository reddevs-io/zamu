import type { ReactNode } from 'react';
import {
  Button as AriaButton,
  ComboBox as AriaComboBox,
  type ComboBoxProps as AriaComboBoxProps,
  Input,
} from 'react-aria-components';
import { cn, composeTw } from './cn';
import { type FieldChromeProps, FieldDescription, FieldError, fieldStack, inputBase, Label } from './Field';
import { ListBox, type OptionItem, OptionRow, Popover } from './ListBox';

export interface ComboBoxProps
  extends Omit<AriaComboBoxProps<OptionItem>, 'children' | 'items' | 'defaultItems'>,
    FieldChromeProps {
  /** Options; filtered by the typed text unless you pass a controlled `inputValue` and filter yourself. */
  items: readonly OptionItem[];
  placeholder?: string;
  /** Message shown in the popover when nothing matches. */
  emptyText?: string;
}

/** Searchable select: type to filter people, agents or projects. */
export function ComboBox({
  label,
  description,
  errorMessage,
  items,
  placeholder,
  emptyText = 'No matches',
  ...props
}: ComboBoxProps) {
  return (
    <AriaComboBox<OptionItem>
      defaultItems={items}
      {...props}
      className={composeTw(props.className, fieldStack)}
    >
      {({ isInvalid }) => (
        <>
          {label ? <Label>{label}</Label> : null}
          <div className="relative">
            <Input placeholder={placeholder} className={cn(inputBase, 'h-[38px] pr-8')} />
            <AriaButton className="absolute inset-y-0 right-0 flex w-8 cursor-pointer items-center justify-center text-[10px] text-faint outline-none hover:text-fg">
              <span aria-hidden>▾</span>
            </AriaButton>
          </div>
          {description && !isInvalid ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError>{errorMessage as ReactNode}</FieldError>
          <Popover>
            <ListBox<OptionItem>
              renderEmptyState={() => <div className="px-3 py-2 text-faint">{emptyText}</div>}
            >
              {(item) => <OptionRow item={item} />}
            </ListBox>
          </Popover>
        </>
      )}
    </AriaComboBox>
  );
}
