// "Refresh on every push" (frames 2k, 2l): the webhook URL and secret to paste into the repository,
// steps per provider, and the last notification, polled every 5 seconds while the dialog is open.
import type { BacklogWebhookInfo, GitProvider } from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useNow } from '~/features/tasks/clock';
import {
  Banner,
  Button,
  CopyField,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  InlineCode,
  Modal,
  NoticeStrip,
  PROVIDER_LABELS,
  Skeleton,
  SourceStatusDot,
  Tab,
  TabList,
  Tabs,
} from '~/ui';
import { errorMessage } from '../settings/result';
import { agoText, maskSecret } from './format';
import { webhookInfoQuery } from './queries';

export const WEBHOOK_POLL_MS = 5_000;

export interface WebhookDialogProps {
  projectKey: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Short form of the repository: gitlab.com/reddevs/payments. */
  repository: string | null;
  defaultBranch: string | null;
}

/** The dialog wired to the webhook info server function. */
export function WebhookDialog({
  projectKey,
  isOpen,
  onOpenChange,
  repository,
  defaultBranch,
}: WebhookDialogProps) {
  return (
    <Modal width={640} top={24} isOpen={isOpen} onOpenChange={onOpenChange}>
      <WebhookInfoLoader
        projectKey={projectKey}
        repository={repository}
        defaultBranch={defaultBranch}
        close={() => onOpenChange(false)}
      />
    </Modal>
  );
}

function WebhookInfoLoader({
  projectKey,
  repository,
  defaultBranch,
  close,
}: Omit<WebhookDialogProps, 'isOpen' | 'onOpenChange'> & { close: () => void }) {
  // Mounted only while the dialog is open, so the polling stops with it.
  const info = useQuery({ ...webhookInfoQuery(projectKey), refetchInterval: WEBHOOK_POLL_MS });
  return (
    <WebhookContent
      info={info.data}
      error={info.error ? errorMessage(info.error) : null}
      repository={repository}
      defaultBranch={defaultBranch}
      close={close}
    />
  );
}

export interface WebhookContentProps {
  info: BacklogWebhookInfo | undefined;
  error: string | null;
  repository: string | null;
  defaultBranch: string | null;
  close: () => void;
}

export function WebhookContent({ info, error, repository, defaultBranch, close }: WebhookContentProps) {
  const now = useNow();
  const [provider, setProvider] = useState<GitProvider | null>(null);
  const shown = provider ?? info?.provider ?? 'github';
  const branch = defaultBranch ?? 'main';
  const repo = repository ?? 'the repository';

  return (
    <Dialog>
      <DialogHeader title="Refresh on every push">
        <span className="text-faint">optional</span>
      </DialogHeader>
      <DialogBody className="gap-3.5">
        <p className="m-0 leading-[1.55]">
          Add a webhook in the repository so the mirror refreshes seconds after a push. Without one, the
          hourly check picks changes up.
        </p>
        {error ? <Banner>Couldn't load the webhook settings. {error}</Banner> : null}
        {info ? (
          <>
            <CopyField label="URL" value={info.url} />
            <CopyField
              label="Secret token"
              value={info.secret ?? undefined}
              maskedValue={maskSecret(info.secret)}
            />
            {info.secret === null ? (
              <span className="-mt-2 text-[11.5px] text-muted">
                Only owners and admins can see the secret. Ask one of them to add the webhook.
              </span>
            ) : null}
          </>
        ) : !error ? (
          <div aria-busy className="flex flex-col gap-3">
            <Skeleton height={34} />
            <Skeleton height={34} />
          </div>
        ) : null}
        <Tabs selectedKey={shown} onSelectionChange={(key) => setProvider(key as GitProvider)}>
          <div className="border-b border-line-2">
            <TabList aria-label="Provider">
              {(['github', 'gitlab', 'gitea'] as const).map((id) => (
                <Tab key={id} id={id} className="h-8">
                  {PROVIDER_LABELS[id]}
                </Tab>
              ))}
            </TabList>
          </div>
        </Tabs>
        <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-[12.5px] leading-[1.55] [&_b]:font-semibold">
          {webhookSteps(shown, repo, branch).map((step, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed list of steps
            <li key={index}>{step}</li>
          ))}
        </ol>
        <NoticeStrip
          marker={<SourceStatusDot state={info?.lastAt ? 'healthy' : 'paused'} decorative />}
          trailing={info?.lastAt ? null : <span className="text-faint">Listening…</span>}
        >
          <span role="status">
            Last notification received:{' '}
            <b>{info?.lastAt ? (now !== null ? agoText(info.lastAt, now) : '') : 'never'}</b>
          </span>
        </NoticeStrip>
      </DialogBody>
      <DialogFooter
        start={<span className="text-[11.5px] text-muted">Pushes to other branches are ignored.</span>}
      >
        <Button variant="secondary" onPress={close}>
          Skip, hourly is fine
        </Button>
        <Button onPress={close}>Done</Button>
      </DialogFooter>
    </Dialog>
  );
}

/** Where to add the webhook, per provider (GitLab copy from frame 2k). */
export function webhookSteps(provider: GitProvider, repository: string, branch: string): ReactNode[] {
  const code = <InlineCode className="text-[11px]">{branch}</InlineCode>;
  switch (provider) {
    case 'gitlab':
      return [
        <>
          Open <b>{repository}</b> → Settings → Webhooks → Add new webhook.
        </>,
        <>
          Paste the URL, and the secret into <b>Secret token</b>.
        </>,
        <>
          Under Trigger, tick <b>Push events</b> only, for the {code} branch.
        </>,
        <>
          Save, then press <b>Test → Push events</b>. The line below turns green.
        </>,
      ];
    case 'github':
      return [
        <>
          Open <b>{repository}</b> → Settings → Webhooks → Add webhook.
        </>,
        <>
          Paste the URL into <b>Payload URL</b>, pick <b>application/json</b> as the content type, and paste
          the secret into <b>Secret</b>.
        </>,
        <>
          Keep <b>Just the push event</b>. Pushes to branches other than {code} are ignored here.
        </>,
        <>
          Save. GitHub sends a <b>ping</b> right away, and the line below turns green.
        </>,
      ];
    case 'gitea':
      return [
        <>
          Open <b>{repository}</b> → Settings → Webhooks → Add webhook → Forgejo (or Gitea).
        </>,
        <>
          Paste the URL into <b>Target URL</b>, keep <b>POST</b> and <b>application/json</b>, and paste the
          secret into <b>Secret</b>.
        </>,
        <>
          Under Trigger on, pick <b>Push events</b> and set the branch filter to {code}.
        </>,
        <>
          Save, then open the webhook and press <b>Test delivery</b>. The line below turns green.
        </>,
      ];
  }
}
