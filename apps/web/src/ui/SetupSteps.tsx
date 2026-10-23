import type { ReactNode } from 'react';
import { cn } from './cn';

export type StepState = 'done' | 'current' | 'todo';

export interface SetupStep {
  id: string;
  /** "Mode", "Source", "Mappings", "Preview", "Read". */
  label: string;
  state: StepState;
  /** Faint note on the right of a done step: "Mirror", "backlog/", "13 values". */
  note?: ReactNode;
}

export interface SetupStepsProps {
  steps: readonly SetupStep[];
  /** `vertical` (default) is the setup sidebar; `horizontal` lays the steps out in a row. */
  orientation?: 'vertical' | 'horizontal';
  'aria-label'?: string;
  className?: string;
}

/**
 * Step list of the Backlog.md setup (ledger-m3.css .m3-steps): done steps show a --done tick, the current
 * step is bold on --surface with a 2px accent bar, steps to come are muted with an outlined number.
 */
export function SetupSteps({ steps, orientation = 'vertical', className, ...props }: SetupStepsProps) {
  return (
    <ol
      aria-label={props['aria-label'] ?? 'Setup steps'}
      className={cn(
        'm-0 flex list-none p-0',
        orientation === 'vertical' ? 'flex-col gap-0.5' : 'flex-row gap-1',
        className,
      )}
    >
      {steps.map((step, i) => (
        <li
          key={step.id}
          aria-current={step.state === 'current' ? 'step' : undefined}
          data-state={step.state}
          className={cn(
            'flex h-[34px] items-center gap-2.5 px-3',
            step.state === 'current'
              ? 'bg-surface font-semibold text-fg shadow-[inset_2px_0_0_var(--accent)]'
              : 'text-muted',
          )}
        >
          <StepMarker state={step.state} number={i + 1} />
          <span>{step.label}</span>
          {step.note ? (
            <>
              <span className="flex-1" />
              <span className="text-[11px] font-normal text-faint">{step.note}</span>
            </>
          ) : null}
          {step.state === 'done' ? <span className="sr-only">, done</span> : null}
        </li>
      ))}
    </ol>
  );
}

export interface StepMarkerProps {
  state: StepState;
  number: number;
  /** `md` is 18px (step list), `sm` is 16px (the progress stages of the Read step). */
  size?: 'md' | 'sm';
  className?: string;
}

/** Numbered square: ✓ on --done, the number inverted (current), or an outlined number (to do). */
export function StepMarker({ state, number, size = 'md', className }: StepMarkerProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'box-border grid shrink-0 place-items-center font-mono',
        size === 'md' ? 'size-[18px] text-[9.5px]' : 'size-4 text-[8.5px]',
        state === 'done' && 'bg-done font-sans font-bold text-bg',
        state === 'done' && (size === 'md' ? 'text-[10px]' : 'text-[9px]'),
        state === 'current' && 'bg-fg text-bg',
        state === 'todo' && 'border border-line text-muted',
        className,
      )}
    >
      {state === 'done' ? '✓' : number}
    </span>
  );
}
