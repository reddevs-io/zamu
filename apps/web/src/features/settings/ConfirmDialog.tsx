// Confirmation for destructive settings actions: revoke a key, remove a member.
import { type ReactNode, useState } from 'react';
import { Banner, Button, Dialog, DialogBody, DialogFooter, DialogHeader, Modal } from '~/ui';
import { errorMessage } from './result';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Runs the action. The dialog closes when it resolves and shows the error when it rejects. */
  onConfirm: () => Promise<unknown>;
}

export function ConfirmDialog({ isOpen, onOpenChange, ...props }: ConfirmDialogProps) {
  return (
    <Modal width={440} top={140} isOpen={isOpen} onOpenChange={onOpenChange}>
      <ConfirmContent {...props} close={() => onOpenChange(false)} />
    </Modal>
  );
}

function ConfirmContent({
  title,
  children,
  confirmLabel,
  onConfirm,
  close,
}: Omit<ConfirmDialogProps, 'isOpen' | 'onOpenChange'> & { close: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      close();
    } catch (failure) {
      setPending(false);
      setError(errorMessage(failure));
    }
  };

  return (
    <Dialog role="alertdialog">
      <DialogHeader title={title} />
      <DialogBody>
        {error ? <Banner>{error}</Banner> : null}
        <div className="leading-[1.55] text-muted">{children}</div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={close}>
          Cancel
        </Button>
        <Button variant="destructive" size="md" isPending={pending} onPress={confirm}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
