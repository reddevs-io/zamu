import { type ReactNode, type RefObject, useRef, useState } from 'react';
import { ButtonContext, Dialog, type PopoverProps } from 'react-aria-components';
import { LockGlyph, type MenuFooterHint, Popover } from '~/ui';
import { READ_ONLY_TEXT } from './targets';

// The popover every field picker opens in, and the read-only line of mirrored tasks.

/** How a picker opens: from its own trigger, or anchored to an element the screen points at. */
export interface PickerAnchorProps {
  /** Controlled open state, for opening from a key (S, P, Shift+D). */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** A React Aria pressable (Button) that opens the picker. */
  trigger?: ReactNode;
  /** Anchor element when there's no trigger (a row, a property cell), or when it differs from it. */
  triggerRef?: RefObject<Element | null>;
  placement?: PopoverProps['placement'];
}

interface FieldPopoverProps extends PickerAnchorProps {
  /** Accessible name of the popover: "Status", "Labels". */
  label: string;
  /** Width in px, from the frames. */
  width: number;
  /** The menu. `close` closes the popover (focus returns to the trigger). */
  children: (close: () => void) => ReactNode;
}

/**
 * A picker's popover. With a `trigger` (a React Aria Button), pressing it opens the popover; without
 * one it opens over `triggerRef` while `isOpen`. The content is a dialog, so page keys don't fire
 * inside it. It is not a menu trigger, so Enter in a multi-select menu (labels) toggles and stays.
 */
export function FieldPopover({
  label,
  width,
  isOpen,
  onOpenChange,
  trigger,
  triggerRef,
  placement = 'bottom start',
  children,
}: FieldPopoverProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const ownRef = useRef<HTMLButtonElement>(null);
  /** When the popover last closed: a press on the trigger that closed it must not reopen it. */
  const closedAt = useRef(0);
  const open = isOpen ?? innerOpen;
  const setOpen = (next: boolean) => {
    if (!next) closedAt.current = Date.now();
    if (isOpen === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };
  const anchor = triggerRef ?? (trigger ? ownRef : undefined);
  const popover = anchor ? (
    <Popover
      placement={placement}
      triggerRef={anchor}
      isOpen={open}
      onOpenChange={setOpen}
      className="min-w-0 overflow-hidden"
      style={{ width }}
    >
      <Dialog aria-label={label} className="outline-none">
        {children(() => setOpen(false))}
      </Dialog>
    </Popover>
  ) : null;
  if (!trigger) return popover;
  return (
    <>
      <ButtonContext.Provider
        value={{
          ref: ownRef,
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          onPress: () => {
            if (open) setOpen(false);
            else if (Date.now() - closedAt.current > 250) setOpen(true);
          },
        }}
      >
        {trigger}
      </ButtonContext.Provider>
      {popover}
    </>
  );
}

/** The lock tooltip at the top of a read-only picker: the value shows, nothing can change. */
export function ReadOnlyLine({ children = READ_ONLY_TEXT }: { children?: ReactNode }) {
  return (
    <div
      role="note"
      className="mx-1.5 mt-1.5 flex min-h-7 items-center gap-2 rounded-sm bg-fg px-2.5 py-1 text-xs leading-snug font-medium text-bg"
    >
      <LockGlyph />
      <span>{children}</span>
    </div>
  );
}

/** The footer of a read-only picker. */
export const READ_ONLY_HINTS: readonly MenuFooterHint[] = [{ keys: 'Esc', label: 'close' }];

/** The value every target shares, or `mixed` when they differ. */
export function commonValue<T, V>(items: readonly T[], read: (item: T) => V, same = Object.is): V | 'mixed' {
  const first = items[0];
  if (first === undefined) return 'mixed';
  const value = read(first);
  return items.every((item) => same(read(item), value)) ? value : 'mixed';
}

/** The first name of a person, for "claude-dev for Ana". */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
