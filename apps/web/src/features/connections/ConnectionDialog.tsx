// Add and edit a git connection (frames 1c to 1e): provider picked by hand, host, name and access
// token, with Test. Saving a new connection tests the token again on the server and saves nothing
// when it fails. Editing keeps the provider and host; a new token replaces the stored one.
import {
  CreateGitConnectionInput,
  type GitConnection,
  type GitConnectionTestResult,
  type GitProvider,
  GitToken,
} from '@pm/contracts';
import { type FormEvent, type ReactNode, useState } from 'react';
import {
  Banner,
  Button,
  cn,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  InlineCode,
  Modal,
  PROVIDER_LABELS,
  RadioCard,
  RadioGroup,
  SourceStatusDot,
  TextField,
  useHotkeys,
} from '~/ui';
import { errorMessage, SettingsError } from '../settings/result';
import { DEFAULT_HOSTS, hostHint, scopeHint, suggestedName, tokenPreview } from './format';

export type ConnectionDialogTarget = { kind: 'add' } | { kind: 'edit'; connection: GitConnection };

/** What the dialog sends. Edit leaves out unchanged fields; `token` only when a new one was typed. */
export type ConnectionSave =
  | { kind: 'add'; provider: GitProvider; host: string; name: string; token: string }
  | { kind: 'edit'; id: string; name?: string; token?: string };

export type ConnectionTest =
  | { provider: GitProvider; host: string; token: string }
  | { id: string; token?: string };

export interface ConnectionDialogProps {
  /** null: closed. */
  target: ConnectionDialogTarget | null;
  onClose: () => void;
  onTest: (input: ConnectionTest) => Promise<GitConnectionTestResult>;
  /** Resolves when saved (the dialog closes); rejects with a SettingsError to show. */
  onSave: (input: ConnectionSave) => Promise<unknown>;
}

export function ConnectionDialog({ target, onClose, onTest, onSave }: ConnectionDialogProps) {
  return (
    <Modal
      width={600}
      top={56}
      isOpen={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {target ? (
        <ConnectionForm
          key={target.kind === 'edit' ? target.connection.id : 'add'}
          target={target}
          onClose={onClose}
          onTest={onTest}
          onSave={onSave}
        />
      ) : null}
    </Modal>
  );
}

type Field = 'host' | 'name' | 'token';

/** The inline result box under the token. */
type Check =
  | { state: 'testing'; host: string }
  | { state: 'working'; login: string | null; repoCount: number | null }
  | { state: 'rejected' | 'unreachable'; detail: string };

const PROVIDERS: GitProvider[] = ['github', 'gitlab', 'gitea'];

function ConnectionForm({
  target,
  onClose,
  onTest,
  onSave,
}: {
  target: ConnectionDialogTarget;
  onClose: () => void;
  onTest: ConnectionDialogProps['onTest'];
  onSave: ConnectionDialogProps['onSave'];
}) {
  const editing = target.kind === 'edit' ? target.connection : null;
  const [provider, setProvider] = useState<GitProvider>(editing?.provider ?? 'gitlab');
  const [host, setHost] = useState(editing?.host ?? DEFAULT_HOSTS.gitlab);
  const [name, setName] = useState(editing?.name ?? '');
  const [token, setToken] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [saving, setSaving] = useState(false);

  const testing = check?.state === 'testing';
  const failed = check?.state === 'rejected' || check?.state === 'unreachable';

  /** Any edit makes the last check stale. */
  const edited = (field: Field | 'provider') => {
    setCheck(null);
    setFailure(null);
    if (field !== 'provider') setErrors((current) => ({ ...current, [field]: undefined }));
    else setErrors((current) => ({ ...current, host: undefined }));
  };

  /** Validates for a test or a save; returns the error map (empty when fine). */
  const validate = (forSave: boolean): Partial<Record<Field, string>> => {
    const next: Partial<Record<Field, string>> = {};
    if (editing) {
      if (token.trim()) {
        const parsed = GitToken.safeParse(token);
        if (!parsed.success) next.token = parsed.error.issues[0]?.message;
      }
      if (forSave && !name.trim()) next.name = 'Name is required';
      return next;
    }
    const parsed = CreateGitConnectionInput.safeParse({
      provider,
      host,
      name: forSave ? name : name.trim() || 'x',
      token,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'host' || field === 'name' || field === 'token') next[field] ??= issue.message;
      }
    }
    return next;
  };

  const showFailure = (error: unknown) => {
    if (error instanceof SettingsError) {
      const tokenIssue = error.issueFor('token');
      const hostIssue = error.issueFor('host');
      const nameIssue = error.issueFor('name');
      if (tokenIssue) {
        setCheck({ state: 'rejected', detail: tokenIssue });
        setErrors({ token: undefined });
        return;
      }
      if (hostIssue) {
        setCheck({ state: 'unreachable', detail: hostIssue });
        return;
      }
      if (nameIssue || error.code === 'CONFLICT') {
        setErrors({ name: nameIssue ?? error.message });
        return;
      }
    }
    setFailure(errorMessage(error));
  };

  const test = async () => {
    if (testing || saving) return;
    const next = validate(false);
    if (editing && !token.trim()) delete next.token;
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setFailure(null);
    const checkedHost = editing?.host ?? host.trim().toLowerCase();
    setCheck({ state: 'testing', host: checkedHost });
    try {
      const input: ConnectionTest = editing
        ? { id: editing.id, ...(token.trim() ? { token: token.trim() } : {}) }
        : { provider, host: host.trim(), token: token.trim() };
      const result = await onTest(input);
      if (result.status === 'working') {
        setCheck({ state: 'working', login: result.login, repoCount: result.repoCount });
        if (!name.trim()) setName(suggestedName(provider, result.login));
      } else {
        setCheck({ state: result.status, detail: result.detail ?? '' });
      }
    } catch (error) {
      setCheck(null);
      showFailure(error);
    }
  };

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (testing || saving) return;
    const next = validate(true);
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    let input: ConnectionSave;
    if (editing) {
      const changes = {
        ...(name.trim() !== editing.name ? { name: name.trim() } : {}),
        ...(token.trim() ? { token: token.trim() } : {}),
      };
      if (!Object.keys(changes).length) {
        onClose();
        return;
      }
      input = { kind: 'edit', id: editing.id, ...changes };
    } else {
      input = { kind: 'add', provider, host: host.trim(), name: name.trim(), token: token.trim() };
    }
    setFailure(null);
    setSaving(true);
    try {
      await onSave(input);
      onClose();
    } catch (error) {
      showFailure(error);
    } finally {
      setSaving(false);
    }
  };

  useHotkeys({ 'Mod+Enter': () => void save() }, { allowInOverlays: true });

  const preview = tokenPreview(token);
  const scope = scopeHint(provider);
  const title = editing ? `Edit ${editing.name}` : 'Add git connection';

  return (
    <Dialog aria-label={title}>
      <form noValidate onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <DialogHeader title={title} />
        <DialogBody>
          {failure ? <Banner>{failure}</Banner> : null}
          <RadioGroup
            label="Provider"
            value={provider}
            isDisabled={editing !== null}
            onChange={(value) => {
              const next = value as GitProvider;
              // Swap the default host along with the provider unless one was typed.
              if (Object.values(DEFAULT_HOSTS).includes(host.trim())) setHost(DEFAULT_HOSTS[next]);
              setProvider(next);
              edited('provider');
            }}
            description={
              editing
                ? 'Provider and host stay as they are. Delete the connection and add a new one to change them.'
                : "Pick it yourself: a self-hosted address doesn't say which software runs there."
            }
          >
            <div className="grid grid-cols-3 gap-1.5">
              {PROVIDERS.map((id) => (
                <RadioCard key={id} value={id} label={PROVIDER_LABELS[id]} />
              ))}
            </div>
          </RadioGroup>
          <TextField
            label="Host"
            name="host"
            mono
            autoComplete="off"
            spellCheck="false"
            placeholder="git.example.com"
            value={host}
            isReadOnly={editing !== null}
            onChange={(value) => {
              setHost(value);
              edited('host');
            }}
            description={editing ? undefined : hostHint(provider)}
            isInvalid={Boolean(errors.host)}
            errorMessage={errors.host}
            validationBehavior="aria"
          />
          <TextField
            label="Name"
            name="name"
            autoComplete="off"
            placeholder={suggestedName(provider, 'team')}
            value={name}
            onChange={(value) => {
              setName(value);
              setErrors((current) => ({ ...current, name: undefined }));
            }}
            isInvalid={Boolean(errors.name)}
            errorMessage={errors.name}
            validationBehavior="aria"
          />
          <TextField
            label={
              <span className="flex items-baseline">
                <span>Access token</span>
                {preview ? (
                  <span aria-hidden className="ml-auto text-xs font-normal text-fg-3">
                    {preview}
                  </span>
                ) : null}
              </span>
            }
            name="token"
            type="password"
            mono
            autoComplete="off"
            spellCheck="false"
            placeholder={
              editing
                ? `Leave empty to keep the token${editing.tokenHint ? ` ending in ${editing.tokenHint}` : ''}`
                : undefined
            }
            value={token}
            onChange={(value) => {
              setToken(value);
              edited('token');
            }}
            description={
              <span className="leading-normal">
                {scope.before}{' '}
                {scope.code.map((code, index) => (
                  <span key={code}>
                    {index > 0 ? ' and ' : null}
                    <InlineCode className="text-xs text-fg">{code}</InlineCode>
                  </span>
                ))}{' '}
                {scope.after}
              </span>
            }
            // A rejected token keeps the scope hint visible: only the border turns red.
            inputClassName={check?.state === 'rejected' ? 'border-danger' : undefined}
            isInvalid={Boolean(errors.token)}
            errorMessage={errors.token}
            validationBehavior="aria"
          />
          {check ? <CheckResult check={check} adding={editing === null} /> : null}
        </DialogBody>
        <DialogFooter
          start={<span className="text-xs text-fg-2">The token is encrypted and never shown again.</span>}
        >
          <Button variant="secondary" onPress={() => void test()} isDisabled={testing || saving}>
            {testing ? 'Testing…' : 'Test'}
          </Button>
          <Button type="submit" isPending={saving} isDisabled={testing || failed}>
            Save connection
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function CheckResult({ check, adding }: { check: Check; adding: boolean }) {
  let body: ReactNode;
  if (check.state === 'testing') {
    body = <>Testing the token against {check.host}…</>;
  } else if (check.state === 'working') {
    const repos =
      check.repoCount == null
        ? ''
        : ` and can read ${check.repoCount} ${check.repoCount === 1 ? 'repository' : 'repositories'}`;
    body = check.login ? (
      <>
        <b>Working.</b> Signed in as <span className="font-medium text-fg">{check.login}</span>
        {repos}.
      </>
    ) : (
      <>
        <b>Working.</b> The token is accepted{repos}.
      </>
    );
  } else {
    const label = check.state === 'rejected' ? 'Token rejected.' : 'Host unreachable.';
    const saved = adding ? ' Nothing was saved.' : ' The saved token stays.';
    body = (
      <>
        <b>{label}</b> {check.detail}
        {check.detail.endsWith('Nothing was saved.') ? '' : saved}
      </>
    );
  }
  const isError = check.state === 'rejected' || check.state === 'unreachable';
  const dot =
    check.state === 'testing'
      ? 'reading'
      : check.state === 'working'
        ? 'healthy'
        : check.state === 'rejected'
          ? 'failed'
          : 'warnings';
  return (
    <div
      role={check.state === 'testing' ? 'status' : isError ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm leading-normal [&_b]:font-semibold',
        isError ? 'border-danger bg-danger-soft' : 'border-line bg-bg-grp',
      )}
    >
      <SourceStatusDot state={dot} decorative className="mt-1.25" />
      <span className="min-w-0">{body}</span>
    </div>
  );
}
