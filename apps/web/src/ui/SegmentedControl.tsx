import type { ReactNode } from 'react';
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import { cn } from './cn';

export interface SegmentedItem<K extends string = string> {
  id: K;
  label: string;
  /** Optional leading glyph. */
  icon?: ReactNode;
}

export interface SegmentedControlProps<K extends string = string> {
  items: readonly SegmentedItem<K>[];
  value: K;
  onChange: (value: K) => void;
  'aria-label': string;
  /** Stretch to the container with equal segments and dividers (user menu theme switch). */
  fullWidth?: boolean;
  isDisabled?: boolean;
  className?: string;
}

/**
 * One-of-n switch, 26px tall: List / Board, Light / Dark / System. React Aria ToggleButtonGroup with
 * single selection: arrow keys move between segments, Space or Enter picks one, a selection is required.
 */
export function SegmentedControl<K extends string = string>({
  items,
  value,
  onChange,
  fullWidth = false,
  isDisabled,
  className,
  ...props
}: SegmentedControlProps<K>) {
  return (
    <ToggleButtonGroup
      aria-label={props['aria-label']}
      selectionMode="single"
      disallowEmptySelection
      isDisabled={isDisabled}
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const next = [...keys][0];
        if (next != null && next !== value) onChange(String(next) as K);
      }}
      className={cn(
        'h-[26px] shrink-0 border border-line',
        fullWidth ? 'flex w-full divide-x divide-line' : 'inline-flex',
        className,
      )}
    >
      {items.map((item) => (
        <ToggleButton
          key={item.id}
          id={item.id}
          className={({ isSelected }) =>
            cn(
              'inline-flex cursor-pointer items-center justify-center gap-1.5 px-[9px] text-[12px] outline-none select-none',
              'focus-visible:focus-ring-inset disabled:cursor-default disabled:opacity-50',
              fullWidth && 'flex-1',
              isSelected ? 'bg-sel font-semibold text-fg' : 'text-muted hover:text-fg',
            )
          }
        >
          {item.icon}
          {item.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
