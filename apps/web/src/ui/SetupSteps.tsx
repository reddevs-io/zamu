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
 * Step list of the Backlog.md setup: done steps show a --status-done tick, the current step is semibold
 * on --bg-lane, steps to come are --fg-2 with an outlined number.
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
            'flex h-8.5 items-center gap-2.5 rounded-md px-3',
            step.state === 'current' ? 'bg-bg-lane font-semibold text-fg' : 'text-fg-2',
          )}
        >
          <StepMarker state={step.state} number={i + 1} />
          <span>{step.label}</span>
          {step.note ? (
            <>
              <span className="flex-1" />
              <span className="text-xs font-normal text-fg-3">{step.note}</span>
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

/** Round marker: ✓ on --status-done, the number on --accent (current), or an outlined number (to do). */
export function StepMarker({ state, number, size = 'md', className }: StepMarkerProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'box-border grid shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums',
        size === 'md' ? 'size-4.5' : 'size-4',
        state === 'done' && 'bg-status-done text-bg',
        state === 'current' && 'bg-accent text-accent-ink',
        state === 'todo' && 'border border-line text-fg-3',
        className,
      )}
    >
      {state === 'done' ? '✓' : number}
    </span>
  );
}
