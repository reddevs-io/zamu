import { Label, Radio, RadioGroup } from 'react-aria-components';
import { cn } from './cn';
import { LABEL_HUE_NAMES, LABEL_HUES, labelColor } from './LabelChip';

/*
 * Label colour swatches (margin.css .sw, .swatches; frames 073 and 118): the nine label hues as round radios.
 * The chosen one has a ring (--surface-pop gap, then --fg). Arrow keys move and pick; Tab enters and leaves
 * the group (the label picker reaches it with Tab from the create item).
 */

export interface ColorSwatchesProps {
  /** Picked hue, 1–9. */
  value: number;
  onChange: (value: number) => void;
  /** Visible label ("Colour") drawn before the swatches; also the group's accessible name. */
  label?: string;
  /** Accessible name when there is no visible label. */
  'aria-label'?: string;
  /** Swatch diameter: 18 in the label picker, 22 (default) in settings. */
  size?: 18 | 22;
  isDisabled?: boolean;
  className?: string;
}

export function ColorSwatches({
  value,
  onChange,
  label,
  size = 22,
  isDisabled,
  className,
  ...props
}: ColorSwatchesProps) {
  const hues = Array.from({ length: LABEL_HUES }, (_, index) => index + 1);
  return (
    <RadioGroup
      aria-label={label ? undefined : (props['aria-label'] ?? 'Colour')}
      orientation="horizontal"
      value={String(value)}
      onChange={(next) => onChange(Number(next))}
      isDisabled={isDisabled}
      className={cn('flex items-center gap-2.5', className)}
    >
      {label ? <Label className="text-xs text-fg-3">{label}</Label> : null}
      <div className="flex items-center gap-1.5">
        {hues.map((hue) => (
          <Radio
            key={hue}
            value={String(hue)}
            aria-label={LABEL_HUE_NAMES[hue - 1]}
            className={({ isSelected, isFocusVisible, isHovered }) =>
              cn(
                'block shrink-0 cursor-pointer rounded-full outline-none',
                isHovered && !isSelected && 'scale-110 transition-transform',
                isSelected && 'shadow-[0_0_0_2px_var(--surface-pop),0_0_0_4px_var(--fg)]',
                isFocusVisible &&
                  !isSelected &&
                  'shadow-[0_0_0_2px_var(--surface-pop),0_0_0_4px_var(--accent)]',
                isFocusVisible &&
                  isSelected &&
                  'shadow-[0_0_0_2px_var(--surface-pop),0_0_0_4px_var(--accent)]',
              )
            }
            style={{ width: size, height: size, background: labelColor(hue) }}
          />
        ))}
      </div>
    </RadioGroup>
  );
}
