import type { ReactNode } from 'react';
import {
  Dialog as AriaDialog,
  type DialogProps as AriaDialogProps,
  Modal as AriaModal,
  Heading,
  ModalOverlay,
  type ModalOverlayProps,
} from 'react-aria-components';
import { cn } from './cn';
import { Kbd } from './Kbd';

export { DialogTrigger } from 'react-aria-components';

export interface ModalProps extends Omit<ModalOverlayProps, 'children' | 'className' | 'style'> {
  /** Dialog width in px: 640 quick create, 560 add agent, 580 key created. */
  width?: number;
  /** Distance from the top of the viewport in px. */
  top?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Scrim plus a positioned surface. Focus is trapped inside; Esc and a click on the scrim close it
 * (set `isDismissable={false}` for dialogs that must be acknowledged, such as a new API key).
 */
export function Modal({
  width = 560,
  top = 96,
  isDismissable = true,
  className,
  children,
  ...props
}: ModalProps) {
  return (
    <ModalOverlay {...props} isDismissable={isDismissable} className="fixed inset-0 z-50 bg-scrim">
      <AriaModal
        className={cn(
          'absolute left-1/2 flex max-h-[calc(100dvh-32px)] -translate-x-1/2 flex-col border border-line bg-surface text-fg shadow-dialog outline-none',
          className,
        )}
        style={{ top, width: `min(${width}px, calc(100vw - 32px))` }}
      >
        {children}
      </AriaModal>
    </ModalOverlay>
  );
}

export function Dialog({ className, ...props }: AriaDialogProps) {
  return <AriaDialog {...props} className={cn('flex min-h-0 flex-1 flex-col outline-none', className)} />;
}

export interface DialogHeaderProps {
  /** Plain-text title; rendered as the dialog's accessible name. */
  title?: ReactNode;
  /** Extra header content (the quick create project chip and "New task"). */
  children?: ReactNode;
  /** Show the Esc hint on the right. */
  showEsc?: boolean;
  className?: string;
}

export function DialogHeader({ title, children, showEsc = true, className }: DialogHeaderProps) {
  return (
    <div className={cn('flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line px-5', className)}>
      {title ? (
        <Heading slot="title" className="m-0 text-[13px] font-semibold">
          {title}
        </Heading>
      ) : null}
      {children}
      {showEsc ? <Kbd className="ml-auto">Esc</Kbd> : null}
    </div>
  );
}

export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex min-h-0 flex-col gap-4 overflow-auto p-5', className)}>{children}</div>;
}

export interface DialogFooterProps {
  /** Left-aligned content: a hint or the Create more switch. */
  start?: ReactNode;
  /** Buttons, right-aligned. */
  children: ReactNode;
  className?: string;
}

export function DialogFooter({ start, children, className }: DialogFooterProps) {
  return (
    <div
      className={cn('flex shrink-0 items-center gap-2.5 border-t border-line bg-band px-5 py-3', className)}
    >
      {start}
      <span className="flex-1" />
      {children}
    </div>
  );
}
