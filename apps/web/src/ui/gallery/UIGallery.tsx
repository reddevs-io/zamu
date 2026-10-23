import { type ReactNode, useMemo, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Avatar, MemberLabel } from '../Avatar';
import { Banner } from '../Banner';
import { Button } from '../Button';
import { Checkbox, CheckboxGroup } from '../Checkbox';
import { CodeBlock, InlineCode } from '../CodeBlock';
import { ComboBox } from '../ComboBox';
import { cn } from '../cn';
import { type DataColumn, DataTable } from '../DataTable';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTrigger, Modal } from '../Dialog';
import { EmptyState } from '../EmptyState';
import { Kbd } from '../Kbd';
import { ActivityTimeline } from '../layout/ActivityTimeline';
import { AppFrame } from '../layout/AppFrame';
import { FilterBar } from '../layout/FilterBar';
import { PageHeader } from '../layout/PageHeader';
import { PropertyGrid } from '../layout/PropertyGrid';
import { Rail } from '../layout/Rail';
import { SettingsNav } from '../layout/SettingsNav';
import { Menu, MenuItem, MenuSeparator, MenuTrigger } from '../Menu';
import { PRIORITIES, PRIORITY_LABELS, STATUS_LABELS, TASK_STATUSES } from '../meta';
import { PriorityGlyph } from '../PriorityGlyph';
import { RadioCard, RadioGroup } from '../RadioGroup';
import { Select } from '../Select';
import { Skeleton } from '../Skeleton';
import { StatusBar } from '../StatusBar';
import { StatusSquare } from '../StatusSquare';
import { Switch } from '../Switch';
import { Tab, TabList, TabPanel, Tabs } from '../Tabs';
import { Tag } from '../Tag';
import { SearchField, TextArea, TextField } from '../TextField';
import { Tooltip, TooltipTrigger } from '../Tooltip';
import { useHotkeys } from '../useHotkeys';
import { M2Gallery } from './M2Gallery';
import { M2TokensSheet } from './M2TokensSheet';
import { M3Gallery } from './M3Gallery';
import { M3TokensSheet } from './M3TokensSheet';
import { M4Gallery } from './M4Gallery';
import {
  ASSIGNEE_OPTIONS,
  COLLAPSED_BY_DEFAULT,
  MEMBERS,
  manyTasks,
  type SampleTask,
  TASK_GROUPS,
} from './sample';
import { TokensSheet } from './TokensSheet';

/**
 * /__ui: the M1 tokens frame (1280×800), the M2 tokens frame and the M4 kit frame (1280 wide) and the M3
 * tokens frame (1280×800), each compared with its design frame, then every component and state.
 */
export function UIGallery() {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <TokensSheet />
      <div className="border-t border-line">
        <M2TokensSheet />
      </div>
      <div className="border-t border-line">
        <M3TokensSheet />
        <M4Gallery />
      </div>
      <div className="flex w-[1280px] flex-col gap-12 border-t border-line px-10 py-10">
        <M3Gallery />
        <M2Gallery />
        <ButtonsSection />
        <FieldsSection />
        <ChoiceSection />
        <OverlaySection />
        <FeedbackSection />
        <IdentitySection />
        <DataSection />
        <LayoutSection />
        <HotkeysSection />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <h2 className="m-0 border-b border-line pb-2 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Demo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="caps">{label}</span>
      {children}
    </div>
  );
}

function ButtonsSection() {
  return (
    <Section title="Buttons and keys">
      <div className="grid grid-cols-2 gap-6">
        <Demo label="Variants">
          <div className="flex flex-wrap items-center gap-2">
            <Button kbd="C">New</Button>
            <Button variant="accent">Copy</Button>
            <Button variant="secondary">Cancel</Button>
            <Button variant="destructive">Revoke</Button>
            <Button variant="ghost">Open as page</Button>
          </div>
        </Demo>
        <Demo label="Sizes and states">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary">
              Retry
            </Button>
            <Button kbd="⌘↵">Create task</Button>
            <Button size="lg">Sign in</Button>
            <Button isDisabled>Disabled</Button>
            <Button isPending variant="secondary">
              Saving
            </Button>
          </div>
        </Demo>
        <Demo label="Full width">
          <Button size="lg" fullWidth>
            Continue
          </Button>
        </Demo>
        <Demo label="Kbd">
          <div className="flex items-center gap-2">
            <Kbd>Esc</Kbd>
            <Kbd>/</Kbd>
            <Kbd>⌘↵</Kbd>
            <Kbd>J</Kbd>
            <Kbd>K</Kbd>
          </div>
        </Demo>
      </div>
    </Section>
  );
}

function FieldsSection() {
  return (
    <Section title="Text fields">
      <div className="grid grid-cols-3 gap-6">
        <TextField
          label="Name"
          mono
          defaultValue="docs-bot"
          description="Lowercase, numbers and dashes. Shows in activity next to every change it makes."
        />
        <TextField
          label="Project key"
          defaultValue="pay!"
          isInvalid
          errorMessage="Use 2 to 6 letters or digits."
          description="Prefixes every task ID."
        />
        <TextField label="Disabled" defaultValue="Read only value" isDisabled />
        <TextArea label="Description" placeholder="Add a description. Markdown works." />
        <Demo label="Search">
          <div className="flex items-center gap-2">
            <SearchField />
            <SearchField width={140} defaultValue="webhook" />
          </div>
        </Demo>
        <TextField label="Placeholder" placeholder="you@example.com" type="email" />
      </div>
    </Section>
  );
}

const STATUS_OPTIONS = TASK_STATUSES.map((status) => ({
  id: status,
  label: STATUS_LABELS[status],
  prefix: <StatusSquare status={status} />,
}));
const PRIORITY_OPTIONS = [...PRIORITIES].reverse().map((priority) => ({
  id: priority,
  label: PRIORITY_LABELS[priority],
  prefix: <PriorityGlyph priority={priority} />,
}));

function ChoiceSection() {
  return (
    <Section title="Selection controls">
      <div className="grid grid-cols-3 gap-6">
        <Select
          label="Responsible human"
          items={ASSIGNEE_OPTIONS.filter((option) => option.avatar?.kind === 'person')}
          defaultValue="ana"
          description='The agent acts for this person. Activity reads "docs-bot for Ana Ruiz".'
        />
        <ComboBox label="Assignee" items={ASSIGNEE_OPTIONS} placeholder="Search people and agents" />
        <Demo label="Chips (quick create)">
          <div className="flex flex-wrap gap-1.5">
            <Select aria-label="Status" variant="chip" items={STATUS_OPTIONS} defaultValue="todo" />
            <Select aria-label="Priority" variant="chip" items={PRIORITY_OPTIONS} defaultValue="medium" />
            <Select aria-label="Assignee" variant="chip" items={ASSIGNEE_OPTIONS} defaultValue="claude" />
          </div>
        </Demo>
        <Demo label="Filters">
          <div className="flex items-center gap-4">
            <Select label="Status" variant="filter" selectionMode="multiple" items={STATUS_OPTIONS} />
            <Select label="Priority" variant="filter" selectionMode="multiple" items={PRIORITY_OPTIONS} />
            <Select
              label="Assignee"
              variant="filter"
              items={[{ id: 'me', label: 'Me' }, { id: 'agents', label: 'Agents' }, ...ASSIGNEE_OPTIONS]}
            />
          </div>
        </Demo>
        <RadioGroup label="Access" defaultValue="selected">
          <RadioCard value="workspace" label="Whole workspace" />
          <RadioCard value="selected" label="Selected projects" />
        </RadioGroup>
        <CheckboxGroup aria-label="Projects" columns={2} defaultValue={['DOCS', 'CLI']}>
          {[
            ['DOCS', 'Documentation'],
            ['CLI', 'pm CLI'],
            ['PAY', 'Payments'],
            ['WEB', 'Web app'],
          ].map(([key, name]) => (
            <Checkbox key={key} value={key}>
              <span className="font-mono text-[10.5px]">{key}</span>
              {name}
            </Checkbox>
          ))}
        </CheckboxGroup>
        <RadioGroup label="Permission" layout="grid" defaultValue="rw" className="col-span-2">
          <RadioCard value="rw" label="Read and write" description="Create and update tasks" />
          <RadioCard value="ro" label="Read only" description="List and view tasks" />
        </RadioGroup>
        <Demo label="Switch and checkbox states">
          <div className="flex flex-col gap-2">
            <Switch defaultSelected>Create more</Switch>
            <Switch>Off</Switch>
            <Checkbox isIndeterminate>Indeterminate</Checkbox>
            <Checkbox isDisabled>Disabled</Checkbox>
          </div>
        </Demo>
      </div>
    </Section>
  );
}

function QuickCreateDemo() {
  return (
    <DialogTrigger>
      <Button kbd="C">Quick create</Button>
      <Modal width={640} top={110}>
        <Dialog aria-label="New task">
          {({ close }) => (
            <>
              <DialogHeader>
                <span className="inline-flex h-[26px] items-center gap-[7px] border border-line bg-surface px-2.5 text-[12.5px]">
                  <span className="font-mono text-[10px]">PAY</span>Payments
                </span>
                <span className="text-faint">New task</span>
              </DialogHeader>
              <DialogBody>
                <TextField
                  aria-label="Title"
                  autoFocus
                  defaultValue="Record retry attempts in the delivery log"
                  inputClassName="h-auto border-0 bg-transparent px-0 text-[18px] font-semibold focus:shadow-none"
                />
                <TextArea aria-label="Description" placeholder="Add a description. Markdown works." />
                <div className="flex flex-wrap gap-1.5">
                  <Select aria-label="Status" variant="chip" items={STATUS_OPTIONS} defaultValue="todo" />
                  <Select
                    aria-label="Priority"
                    variant="chip"
                    items={PRIORITY_OPTIONS}
                    defaultValue="medium"
                  />
                  <Select
                    aria-label="Assignee"
                    variant="chip"
                    items={ASSIGNEE_OPTIONS}
                    defaultValue="claude"
                  />
                </div>
              </DialogBody>
              <DialogFooter start={<Switch defaultSelected>Create more</Switch>}>
                <Button variant="secondary" onPress={close}>
                  Cancel
                </Button>
                <Button kbd="⌘↵" onPress={close}>
                  Create task
                </Button>
              </DialogFooter>
            </>
          )}
        </Dialog>
      </Modal>
    </DialogTrigger>
  );
}

function KeyCreatedDemo() {
  return (
    <DialogTrigger>
      <Button variant="secondary">Key created</Button>
      <Modal width={580} top={142} isDismissable={false}>
        <Dialog role="alertdialog">
          {({ close }) => (
            <>
              <DialogHeader title="Key created for docs-bot" showEsc={false} />
              <DialogBody>
                <Banner tone="info">
                  Copy it now. You won't see it again. If it gets lost, revoke it and create a new one.
                </Banner>
                <CodeBlock variant="secret" copyLabel="Copy API key">
                  pm_live_7Hq2mV9xKc4TzR8bN3wLp6Ye1Ua5Fj0D
                </CodeBlock>
                <div className="flex flex-col gap-1.5">
                  <span className="caps">Use it from the CLI</span>
                  <CodeBlock>pm login --key pm_live_7Hq2mV9xKc4TzR8bN3wLp6Ye1Ua5Fj0D</CodeBlock>
                </div>
                <p className="m-0 text-[11.5px] text-muted">
                  Scope: DOCS and CLI, read and write. Acts for Ana Ruiz.
                </p>
              </DialogBody>
              <DialogFooter>
                <Button onPress={close}>I copied the key</Button>
              </DialogFooter>
            </>
          )}
        </Dialog>
      </Modal>
    </DialogTrigger>
  );
}

function OverlaySection() {
  return (
    <Section title="Overlays and navigation">
      <div className="grid grid-cols-4 gap-6">
        <Demo label="Dialog">
          <div className="flex gap-2">
            <QuickCreateDemo />
            <KeyCreatedDemo />
          </div>
        </Demo>
        <Demo label="Menu">
          <MenuTrigger>
            <Button variant="ghost" aria-label="Member actions">
              ⋯
            </Button>
            <Menu>
              <MenuItem id="keys">Manage keys</MenuItem>
              <MenuItem id="copy" kbd="⌘C">
                Copy name
              </MenuItem>
              <MenuSeparator />
              <MenuItem id="remove" tone="danger">
                Remove
              </MenuItem>
            </Menu>
          </MenuTrigger>
        </Demo>
        <Demo label="Tooltip">
          <TooltipTrigger>
            <AriaButton className="max-w-48 cursor-default truncate text-left font-semibold outline-none focus-visible:focus-ring">
              Customer-facing documentation, onboarding guides, migration notes
            </AriaButton>
            <Tooltip>
              Customer-facing documentation, onboarding guides, migration notes for v1 customers
            </Tooltip>
          </TooltipTrigger>
        </Demo>
        <Demo label="Tabs" className="col-span-4">
          <Tabs>
            <TabList aria-label="Members">
              <Tab id="all" count={7}>
                All
              </Tab>
              <Tab id="people" count={4}>
                People
              </Tab>
              <Tab id="agents" count={3}>
                Agents
              </Tab>
            </TabList>
            <TabPanel id="all" className="pt-3 text-muted">
              Everyone in the workspace.
            </TabPanel>
            <TabPanel id="people" className="pt-3 text-muted">
              People only.
            </TabPanel>
            <TabPanel id="agents" className="pt-3 text-muted">
              Agents only.
            </TabPanel>
          </Tabs>
        </Demo>
      </div>
    </Section>
  );
}

function FeedbackSection() {
  return (
    <Section title="Feedback">
      <div className="grid grid-cols-2 gap-6">
        <Demo label="Error banner">
          <Banner
            action={
              <Button variant="secondary" size="sm">
                Retry
              </Button>
            }
          >
            Couldn't load tasks. The server took too long to answer.
          </Banner>
          <p className="m-0 text-[11.5px] text-muted">
            Your filters are kept. If this keeps happening, an admin can check the server logs for request{' '}
            <InlineCode>req_8f2c41</InlineCode>.
          </p>
        </Demo>
        <Demo label="Info note">
          <Banner tone="info">Copy it now. You won't see it again.</Banner>
        </Demo>
        <Demo label="Empty state">
          <EmptyState
            title="No projects yet"
            text="A project holds tasks. Each one gets a short key that prefixes its task IDs, like PAY-42."
            action={<Button kbd="P">New project</Button>}
            cli={{ label: 'Or from the CLI', command: 'pm projects create --name "Payments" --key PAY' }}
          />
        </Demo>
        <Demo label="Skeleton">
          <div className="flex flex-col gap-3.5">
            <Skeleton width="80%" height={14} />
            <Skeleton width="55%" height={14} />
            <Skeleton height={44} className="mt-2" />
            <Skeleton width="90%" />
            <Skeleton width="70%" />
          </div>
        </Demo>
        <Demo label="Code">
          <CodeBlock>pm tasks list --project PAY --json</CodeBlock>
          <CodeBlock copyable copyLabel="Copy command">
            pm tasks create --project BIL "Match Stripe payouts to invoices"
          </CodeBlock>
          <p className="m-0">
            Backoff is <InlineCode>30s × 2^n</InlineCode> with jitter.
          </p>
        </Demo>
        <Demo label="Secret">
          <CodeBlock variant="secret" copyLabel="Copy API key">
            pm_live_7Hq2mV9xKc4TzR8bN3wLp6Ye1Ua5Fj0D
          </CodeBlock>
        </Demo>
      </div>
    </Section>
  );
}

function IdentitySection() {
  return (
    <Section title="People, agents, status and priority">
      <div className="grid grid-cols-3 gap-6">
        <Demo label="Avatars">
          <div className="flex items-center gap-2">
            <Avatar name="Ana Ruiz" hue={25} />
            <Avatar name="Tomás Berg" hue={220} />
            <Avatar name="Mira Okafor" initials="MO" hue={145} />
            <Avatar name="claude-dev" kind="agent" />
            <Avatar name="codex-ci" kind="agent" initials="X" />
            <Avatar name="Ana Ruiz" hue={25} size="md" />
            <Avatar name="Jo Park" size="md" />
            <Avatar name="claude-dev" kind="agent" size="md" />
          </div>
        </Demo>
        <Demo label="Member labels">
          <div className="flex flex-col gap-2 text-[12px] text-muted">
            <MemberLabel {...MEMBERS.claude} />
            <MemberLabel {...MEMBERS.ana} />
            <MemberLabel {...MEMBERS.claude} onBehalfOf="Ana Ruiz" />
          </div>
        </Demo>
        <Demo label="Tags">
          <div className="flex gap-2">
            <Tag>Person</Tag>
            <Tag tone="accent">Agent</Tag>
            <Tag>Owner</Tag>
            <Tag>Revoked</Tag>
          </div>
        </Demo>
        <Demo label="Status">
          <div className="flex flex-col gap-1.5">
            {TASK_STATUSES.map((status) => (
              <StatusSquare key={status} status={status} withLabel />
            ))}
          </div>
        </Demo>
        <Demo label="Priority">
          <div className="flex flex-col gap-1.5">
            {[...PRIORITIES].reverse().map((priority) => (
              <PriorityGlyph key={priority} priority={priority} withLabel />
            ))}
          </div>
        </Demo>
        <Demo label="Status bar">
          <div className="flex flex-col gap-3">
            <StatusBar width={200} counts={{ in_progress: 3, in_review: 2, todo: 4, backlog: 3 }} />
            <StatusBar width={200} counts={{ in_progress: 4, in_review: 2, todo: 7, backlog: 14 }} />
            <StatusBar width={200} counts={{ in_review: 1, todo: 2, backlog: 6 }} />
            <StatusBar counts={{ in_progress: 1, todo: 1 }} />
          </div>
        </Demo>
      </div>
    </Section>
  );
}

const TASK_COLUMNS: DataColumn<SampleTask>[] = [
  {
    id: 'key',
    header: 'Key',
    width: 72,
    isRowHeader: true,
    skeleton: 48,
    cell: (task) => <span className="font-mono text-[10.5px] text-muted">{task.key}</span>,
  },
  {
    id: 'title',
    header: 'Title',
    width: '1fr',
    isRowHeader: true,
    cell: (task) => <span className="truncate">{task.title}</span>,
  },
  {
    id: 'priority',
    header: 'Pri',
    width: 34,
    skeleton: 20,
    cell: (task) => <PriorityGlyph priority={task.priority} />,
  },
  {
    id: 'assignee',
    header: 'Assignee',
    width: 112,
    skeleton: 70,
    cell: (task) =>
      task.assignee ? <MemberLabel {...task.assignee} className="text-[12px] text-muted" /> : null,
  },
  {
    id: 'updated',
    header: 'Upd',
    width: 34,
    align: 'end',
    skeleton: 24,
    cell: (task) => <span className="font-mono text-[10px] text-faint">{task.updated}</span>,
  },
];

function TaskTableDemo({ onOpen }: { onOpen?: (key: string) => void }) {
  const [selected, setSelected] = useState<string | null>('PAY-142');
  return (
    <DataTable
      aria-label="Tasks"
      columns={TASK_COLUMNS}
      groups={TASK_GROUPS}
      defaultCollapsedGroups={COLLAPSED_BY_DEFAULT}
      getKey={(task) => task.key}
      selectedKey={selected}
      onSelectionChange={setSelected}
      onRowAction={(key) => onOpen?.(key)}
    />
  );
}

function DataSection() {
  const many = useMemo(() => manyTasks(300), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <Section title="Data table">
      <p className="m-0 text-muted">
        Arrow keys or <Kbd>J</Kbd> <Kbd>K</Kbd> move the selection, <Kbd>↵</Kbd> opens a row or toggles a
        group. Last opened: <span className="font-mono text-[11px] text-fg">{opened ?? 'none'}</span>
      </p>
      <div className="grid grid-cols-2 gap-6">
        <Demo label="Grouped by status">
          <div className="flex h-[420px] w-[600px] flex-col border border-line">
            <TaskTableDemo onOpen={setOpened} />
          </div>
        </Demo>
        <Demo label="300 rows, virtualized">
          <div className="flex h-[420px] w-[560px] flex-col border border-line">
            <DataTable
              aria-label="Many tasks"
              columns={TASK_COLUMNS}
              items={many}
              getKey={(task) => task.key}
              selectedKey={selected}
              onSelectionChange={setSelected}
              onRowAction={setOpened}
            />
          </div>
        </Demo>
        <Demo label="Loading">
          <div className="flex h-[240px] w-[600px] flex-col border border-line">
            <DataTable
              aria-label="Loading tasks"
              columns={TASK_COLUMNS}
              getKey={(task) => task.key}
              isLoading
              skeletonRows={5}
            />
          </div>
        </Demo>
        <Demo label="Error">
          <div className="flex h-[240px] w-[600px] flex-col border border-line">
            <DataTable
              aria-label="Tasks that failed to load"
              columns={TASK_COLUMNS}
              items={[]}
              getKey={(task) => task.key}
              renderEmptyState={() => (
                <div className="px-6 py-4">
                  <Banner
                    action={
                      <Button variant="secondary" size="sm">
                        Retry
                      </Button>
                    }
                  >
                    Couldn't load tasks. The server took too long to answer.
                  </Banner>
                </div>
              )}
            />
          </div>
        </Demo>
      </div>
    </Section>
  );
}

function LayoutSection() {
  return (
    <Section title="Layout: frame, rail, header, filters, detail pane">
      <div className="h-[800px] w-[1200px] overflow-hidden border border-line">
        <AppFrame
          className="h-full"
          rail={
            <Rail
              workspace={{ name: 'Reddevs', initial: 'R', href: '/__ui' }}
              nav={[{ id: 'projects', label: 'Projects', href: '/__ui' }]}
              projects={[
                { key: 'PAY', name: 'Payments', openCount: 12, href: '/__ui', isCurrent: true },
                { key: 'WEB', name: 'Web app', openCount: 27, href: '/__ui' },
                { key: 'CLI', name: 'pm CLI', openCount: 9, href: '/__ui', mirrored: true },
                { key: 'INF', name: 'Infra', openCount: 5, href: '/__ui' },
              ]}
              settings={{ href: '/__ui' }}
              user={{ name: 'Ana Ruiz', hue: 25 }}
              userActions={[{ id: 'signout', label: 'Sign out', onAction: () => {} }]}
            />
          }
        >
          <div className="grid min-h-0 flex-1 grid-cols-[600px_minmax(0,1fr)]">
            <section className="flex min-h-0 min-w-0 flex-col border-r border-line">
              <PageHeader
                title="Payments"
                subtitle={
                  <>
                    <span className="font-mono">PAY</span> · 12 open · grouped by status
                  </>
                }
                actions={
                  <>
                    <SearchField width={140} />
                    <Button kbd="C">New</Button>
                  </>
                }
              />
              <FilterBar>
                <Select label="Status" variant="filter" selectionMode="multiple" items={STATUS_OPTIONS} />
                <Select label="Priority" variant="filter" selectionMode="multiple" items={PRIORITY_OPTIONS} />
                <Select label="Assignee" variant="filter" items={ASSIGNEE_OPTIONS} />
              </FilterBar>
              <TaskTableDemo />
            </section>
            <section className="flex min-h-0 min-w-0 flex-col">
              <PageHeader>
                <span className="font-mono">PAY-142</span>
                <span className="flex-1" />
                <Button variant="ghost" className="px-0 font-normal">
                  Open as page
                </Button>
                <Kbd>Esc</Kbd>
              </PageHeader>
              <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-auto px-7 pt-[22px]">
                <h2 className="m-0 text-[22px] leading-tight font-semibold tracking-[-0.015em] text-pretty">
                  Retry failed webhook deliveries with exponential backoff
                </h2>
                <PropertyGrid
                  items={[
                    { id: 'status', label: 'Status', value: <StatusSquare status="in_progress" withLabel /> },
                    { id: 'priority', label: 'Priority', value: <PriorityGlyph priority="high" withLabel /> },
                    {
                      id: 'assignee',
                      label: 'Assignee',
                      value: <MemberLabel {...MEMBERS.claude} />,
                      sub: 'for Ana Ruiz',
                    },
                    { id: 'created', label: 'Created', value: 'Ana Ruiz', sub: 'Oct 20' },
                  ]}
                />
                <p className="m-0 text-[13.5px] leading-[1.55] text-pretty">
                  Deliveries that fail with a 5xx or time out are dropped today. Retry them with exponential
                  backoff, capped at 6 attempts over about 24 hours.
                </p>
                <div className="caps border-t border-line pt-3.5">Activity</div>
                <ActivityTimeline
                  items={[
                    {
                      id: '1',
                      actor: { name: 'Ana Ruiz', kind: 'person' },
                      action: 'created the task',
                      time: 'Oct 20',
                    },
                    {
                      id: '2',
                      actor: { name: 'Ana Ruiz', kind: 'person' },
                      action: 'assigned it to claude-dev',
                      time: 'Oct 20',
                    },
                    {
                      id: '3',
                      actor: { name: 'claude-dev', kind: 'agent' },
                      onBehalfOf: 'Ana Ruiz',
                      action: 'moved it from Todo to In progress',
                      time: '40m',
                    },
                    {
                      id: '4',
                      actor: { name: 'claude-dev', kind: 'agent' },
                      onBehalfOf: 'Ana Ruiz',
                      action: 'checked off 2 items',
                      time: '3m',
                    },
                  ]}
                />
              </div>
              <div className="mx-7 mt-3 mb-[18px] flex h-[38px] shrink-0 items-center border border-dashed border-line px-3 text-faint">
                Comments arrive in a later release.
              </div>
            </section>
          </div>
        </AppFrame>
      </div>
      <div className="flex h-[300px] w-[720px] border border-line">
        <SettingsNav
          sections={[
            {
              label: 'Workspace',
              items: [
                { id: 'members', label: 'Members', href: '/__ui', isCurrent: true },
                { id: 'keys', label: 'API keys', href: '/__ui' },
              ],
            },
            { label: 'You', items: [{ id: 'mykeys', label: 'Your API keys', href: '/__ui' }] },
          ]}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <PageHeader
            title="Members"
            subtitle="4 people and 3 agents in Reddevs"
            actions={
              <>
                <Button variant="secondary">Invite person</Button>
                <Button>Add agent</Button>
              </>
            }
          />
        </div>
      </div>
    </Section>
  );
}

function HotkeysSection() {
  const [last, setLast] = useState('none yet');
  useHotkeys({
    c: () => setLast('C: new task'),
    p: () => setLast('P: new project'),
    '/': () => setLast('/: focus search'),
    i: () => setLast('I: assign to me'),
    'Mod+Enter': () => setLast('Mod+Enter: submit'),
  });
  return (
    <Section title="Hotkeys">
      <p className="m-0 text-muted">
        Press <Kbd>C</Kbd>, <Kbd>P</Kbd>, <Kbd>/</Kbd>, <Kbd>I</Kbd> or <Kbd>⌘↵</Kbd> outside a text field.
        Last:{' '}
        <span className="font-mono text-[11px] text-fg" data-testid="last-hotkey">
          {last}
        </span>
      </p>
      <TextField
        aria-label="Typing here does not trigger plain shortcuts"
        placeholder="Type c or p here"
        className="w-80"
      />
    </Section>
  );
}
