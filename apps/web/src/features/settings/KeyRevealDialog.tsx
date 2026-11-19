// "Key created" dialog: shows a new API key's secret once. It can only be closed with "I copied the
// key" (no scrim click, no Esc); the parent then drops the secret, and nothing can fetch it again.
import type { ApiKeyCreated } from '@zamu/contracts';
import { Banner, Button, CodeBlock, Dialog, DialogBody, DialogFooter, DialogHeader, Modal } from '~/ui';
import { scopeSentence } from './format';

export interface RevealedKey {
  key: ApiKeyCreated;
  /** For agent keys: the responsible human the agent acts for. */
  actsFor?: string | null;
}

export interface KeyRevealDialogProps {
  revealed: RevealedKey | null;
  /** Called by "I copied the key". The parent must forget the secret here. */
  onDone: () => void;
  /** Server the CLI should log in to. Defaults to this page's origin. */
  serverUrl?: string;
}

export function KeyRevealDialog({ revealed, onDone, serverUrl }: KeyRevealDialogProps) {
  return (
    <Modal width={580} top={140} isOpen={revealed !== null} isDismissable={false} isKeyboardDismissDisabled>
      {revealed ? <RevealContent revealed={revealed} onDone={onDone} serverUrl={serverUrl} /> : null}
    </Modal>
  );
}

function RevealContent({
  revealed,
  onDone,
  serverUrl,
}: {
  revealed: RevealedKey;
  onDone: () => void;
  serverUrl?: string;
}) {
  const { key, actsFor } = revealed;
  const url = serverUrl ?? (typeof window === 'undefined' ? undefined : window.location.origin);
  const login = `zamu login --key ${key.key}${url ? ` --url ${url}` : ''}`;
  return (
    <Dialog role="alertdialog">
      <DialogHeader title={`Key created for ${key.owner.name}`} showEsc={false} />
      <DialogBody>
        <Banner tone="info">
          Copy it now. You won't see it again. If it gets lost, revoke it and create a new one.
        </Banner>
        <CodeBlock variant="secret" copyLabel="Copy API key">
          {key.key}
        </CodeBlock>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-3">Use it from the CLI</span>
          <CodeBlock>{login}</CodeBlock>
        </div>
        <p className="m-0 text-xs text-fg-2">
          {scopeSentence(key.scope)}
          {actsFor ? ` Acts for ${actsFor}.` : ''}
        </p>
      </DialogBody>
      <DialogFooter>
        <Button autoFocus onPress={onDone}>
          I copied the key
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
