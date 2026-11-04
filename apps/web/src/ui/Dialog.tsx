import { type ReactNode, useState } from 'react';
import {
  Dialog as AriaDialog,
  type DialogProps as AriaDialogProps,
  Modal as AriaModal,
  Heading,
  ModalOverlay,
  type ModalOverlayProps,
} from 'react-aria-components';
import { Button } from './Button';
import { cn } from './cn';
import { Kbd } from './Kbd';

export { DialogTrigger } from 'react-aria-components';

/*
 * Margin dialogs (margin.css .scrim, .dlg, .dlg-hd, .dlg-b, .dlg-t, .dlg-ft): a --scrim over the page (lighter in
 * the light theme, stronger in dark, from the token) and a --surface-pop panel with radius lg and --shadow-lift.
 * Titles are serif. Quick create is 620 wide, confirm dialogs 440.
 */

/** The panel classes, shared by Modal and the static DialogSurface. */
const surfaceClass = 'flex flex-col rounded-lg bg-surface-pop text-fg shadow-lift outline-none';

export interface ScrimProps {
  /** `default`: the --scrim token (light and dark strengths). `none`: transparent, still catches clicks. */
  strength?: 'default' | 'none';
  className?: string;
  children?: ReactNode;
}

/** A static scrim over the nearest positioned ancestor (galleries and in-page overlays). */
export function Scrim({ strength = 'default', className, children }: ScrimProps) {
  return (
    <div
      aria-hidden={children ? undefined : true}
      className={cn('absolute inset-0 z-30', strength === 'default' && 'bg-scrim', className)}
    >
      {children}
    </div>
  );
}

export interface ModalProps extends Omit<ModalOverlayProps, 'children' | 'className' | 'style'> {
  /** Dialog width in px: 620 quick create, 560 add agent, 440 confirm. */
  width?: number;
  /** Distance from the top of the viewport in px. */
  top?: number;
  /** Scrim strength (see Scrim). The peek uses `none`. */
  scrim?: ScrimProps['strength'];
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
  scrim = 'default',
  className,
  children,
  ...props
}: ModalProps) {
  return (
    <ModalOverlay
      {...props}
      isDismissable={isDismissable}
      className={cn('fixed inset-0 z-50', scrim === 'default' && 'bg-scrim')}
    >
      <AriaModal
        className={cn(
          surfaceClass,
          'absolute left-1/2 max-h-[calc(100dvh-32px)] -translate-x-1/2',
          className,
        )}
        style={{ top, width: `min(${width}px, calc(100vw - 32px))` }}
      >
        {children}
      </AriaModal>
    </ModalOverlay>
  );
}

/** The dialog panel without an overlay: frames in the gallery, or a dialog drawn inside a page. */
export function DialogSurface({
  width = 560,
  className,
  children,
}: {
  width?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(surfaceClass, className)} style={{ width }}>
      {children}
    </div>
  );
}

export function Dialog({ className, ...props }: AriaDialogProps) {
  return <AriaDialog {...props} className={cn('flex min-h-0 flex-1 flex-col outline-none', className)} />;
}

export interface DialogHeaderProps {
  /** Plain-text title; rendered as the dialog's accessible name, in the serif. */
  title?: ReactNode;
  /** Extra header content (the quick create project crumb: tile, "Payments", ›, "New task"). */
  children?: ReactNode;
  /** Show the Esc hint on the right. */
  showEsc?: boolean;
  className?: string;
}

/** Top row of a dialog: an optional serif title, crumb content, and the Esc hint. No rule under it. */
export function DialogHeader({ title, children, showEsc = true, className }: DialogHeaderProps) {
  return (
    <div
      className={cn('flex shrink-0 items-center gap-2 px-4 pt-3.5 text-sm font-medium text-fg-2', className)}
    >
      {title ? <DialogTitle className="text-xl">{title}</DialogTitle> : null}
      {children}
      {showEsc ? <Kbd className="ml-auto">Esc</Kbd> : null}
    </div>
  );
}

/** Serif dialog title (.dlg-t), wired as the dialog's accessible name. */
export function DialogTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Heading slot="title" className={cn('m-0 font-serif text-xl font-medium text-fg', className)}>
      {children}
    </Heading>
  );
}

export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex min-h-0 flex-col gap-3 overflow-auto px-4 pt-3 pb-3.5', className)}>
      {children}
    </div>
  );
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
    <div className={cn('flex shrink-0 items-center gap-2 border-t border-line-soft px-4 py-3', className)}>
      {start}
      <span className="flex-1" />
      {children}
    </div>
  );
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Serif question: Delete the label “reliability”? */
  title: ReactNode;
  /** The consequence, with the count in bold: It’s used on <b>12 tasks</b> in Payments. … */
  children: ReactNode;
  /** Verb plus object: "Delete label". */
  confirmLabel: string;
  /** `danger` (default) fills the confirm button in --danger; `primary` for non-destructive confirms. */
  tone?: 'danger' | 'primary';
  /**
   * Runs the action. A returned promise keeps the button pending; the dialog closes when it resolves and shows
   * the error's message when it rejects.
   */
  onConfirm: () => unknown;
  cancelLabel?: string;
}

/**
 * Confirm dialog (.dlg.sm, frame 119): 440 wide, serif title, message, Cancel and the confirm button. An
 * alertdialog: focus starts on Cancel's side of the footer, Esc cancels.
 */
export function ConfirmDialog({ isOpen, onOpenChange, ...props }: ConfirmDialogProps) {
  return (
    <Modal width={440} top={200} isOpen={isOpen} onOpenChange={onOpenChange}>
      <ConfirmContent {...props} close={() => onOpenChange(false)} />
    </Modal>
  );
}

function ConfirmContent({
  title,
  children,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  cancelLabel = 'Cancel',
  close,
}: Omit<ConfirmDialogProps, 'isOpen' | 'onOpenChange'> & { close: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setError(null);
    const result = onConfirm();
    if (!result || typeof (result as Promise<unknown>).then !== 'function') {
      close();
      return;
    }
    setPending(true);
    try {
      await result;
      close();
    } catch (failure) {
      setPending(false);
      setError(
        failure instanceof Error && failure.message ? failure.message : 'That didn’t work. Try again.',
      );
    }
  };

  return (
    <Dialog role="alertdialog">
      <ConfirmBody title={title} error={error}>
        {children}
      </ConfirmBody>
      <DialogFooter>
        <Button variant="secondary" onPress={close} autoFocus>
          {cancelLabel}
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} isPending={pending} onPress={confirm}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/** Title, message and error of a confirm dialog; also used by the static gallery frame. */
export function ConfirmBody({
  title,
  error,
  children,
  isStatic = false,
}: {
  title: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  /** Render the title as a plain heading (outside a Dialog). */
  isStatic?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5 px-4 pt-4.5 pb-3.5">
      {isStatic ? (
        <h2 className="m-0 font-serif text-xl font-medium text-fg">{title}</h2>
      ) : (
        <DialogTitle>{title}</DialogTitle>
      )}
      <div className="text-md leading-normal text-fg-2 [&_b]:font-semibold [&_b]:text-fg">{children}</div>
      {error ? (
        <p role="alert" className="m-0 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
