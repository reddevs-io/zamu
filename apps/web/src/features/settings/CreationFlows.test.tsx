import type { ApiKeyCreated, Member } from '@pm/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '~/ui';
import { AgentCreation, KeyCreation } from './CreationFlows';
import { SettingsError } from './result';
import type { AgentCreatedResult, CreateAgentValues, CreateApiKeyValues } from './types';

const ana = { id: '00000000-0000-4000-8000-000000000001', name: 'Ana Ruiz' };
const tomas = { id: '00000000-0000-4000-8000-000000000002', name: 'Tomás Berg' };
const projects = [
  { id: '20000000-0000-4000-8000-000000000001', key: 'PAY', name: 'Payments' },
  { id: '20000000-0000-4000-8000-000000000002', key: 'WEB', name: 'Web app' },
];
const SECRET = 'pm_live_7Hq2mV9xKc4TzR8bN3wLp6Ye1Ua5Fj0D';
const SERVER = 'https://pm.example.test';

function createdKey(
  owner: { id: string; name: string },
  overrides: Partial<ApiKeyCreated> = {},
): ApiKeyCreated {
  return {
    id: '10000000-0000-4000-8000-000000000009',
    name: `${owner.name} key`,
    start: SECRET.slice(0, 12),
    owner: { ...owner, kind: 'agent' },
    scope: { projects: [projects[0] ?? { id: '', key: 'PAY', name: '' }], access: 'write' },
    revoked: false,
    createdAt: '2026-10-22T10:00:00.000Z',
    lastUsedAt: null,
    expiresAt: null,
    key: SECRET,
    ...overrides,
  };
}

function agentResult(values: CreateAgentValues): AgentCreatedResult {
  const agent: Member = {
    id: '00000000-0000-4000-8000-000000000003',
    name: values.name,
    email: null,
    kind: 'agent',
    role: 'member',
    responsible: { ...ana, kind: 'person' },
    lastActiveAt: null,
    apiKeyCount: 1,
    joinedAt: '2026-10-22T10:00:00.000Z',
  };
  return { agent, key: createdKey({ id: agent.id, name: agent.name }) };
}

function AgentHarness({
  onSubmit,
}: {
  onSubmit: (values: CreateAgentValues) => Promise<AgentCreatedResult>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onPress={() => setOpen(true)}>Add agent</Button>
      <AgentCreation
        isOpen={open}
        onOpenChange={setOpen}
        people={[ana, tomas]}
        defaultResponsibleId={ana.id}
        projects={projects}
        onSubmit={onSubmit}
        serverUrl={SERVER}
      />
    </>
  );
}

const secretShown = () => document.body.textContent?.includes(SECRET) ?? false;

// Long interaction flows: give them room when the whole suite runs in parallel on a busy machine.
const FLOW_TIMEOUT = 20_000;

describe('AgentCreation', () => {
  it(
    'validates the name, creates the agent and reveals its key once',
    async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn(async (values: CreateAgentValues) => agentResult(values));
      render(<AgentHarness onSubmit={onSubmit} />);

      await user.click(screen.getByRole('button', { name: 'Add agent' }));
      const name = screen.getByLabelText('Name');
      expect(name).toHaveFocus();
      await user.type(name, 'Docs Bot');
      await user.click(screen.getByRole('button', { name: 'Create agent' }));
      expect(screen.getByText('Use lowercase letters, numbers and dashes.')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();

      await user.clear(name);
      await user.type(name, 'docs-bot');
      expect(
        screen.getByText('The agent acts for this person. Activity reads "docs-bot for Ana Ruiz".'),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('radio', { name: 'Selected projects' }));
      await user.click(screen.getByRole('button', { name: 'Create agent' }));
      expect(screen.getByText('Pick at least one project.')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();

      await user.click(screen.getByRole('checkbox', { name: /PAY/ }));
      await user.click(screen.getByRole('button', { name: 'Create agent' }));
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'docs-bot',
        responsibleUserId: ana.id,
        scope: { projects: [projects[0]?.id], access: 'write' },
      });

      // The form closes and the reveal-once dialog shows the secret with the CLI hint.
      const reveal = await screen.findByRole('alertdialog');
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
      expect(reveal).toHaveTextContent('Key created for docs-bot');
      expect(reveal).toHaveTextContent(`pm login --key ${SECRET} --url ${SERVER}`);
      expect(reveal).toHaveTextContent('Scope: PAY, read and write. Acts for Ana Ruiz.');
      expect(screen.getByRole('button', { name: 'Copy API key' })).toBeInTheDocument();

      // Esc does not dismiss it: only "I copied the key" does.
      await user.keyboard('{Escape}');
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'I copied the key' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(secretShown()).toBe(false);

      // Opening the dialog again starts from an empty form; the secret never comes back.
      await user.click(screen.getByRole('button', { name: 'Add agent' }));
      expect(screen.getByLabelText('Name')).toHaveValue('');
      expect(secretShown()).toBe(false);
      expect(onSubmit).toHaveBeenCalledTimes(1);
    },
    FLOW_TIMEOUT,
  );

  it(
    'keeps the form open and marks the name when the agent already exists',
    async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn(async () => {
        throw new SettingsError({
          code: 'CONFLICT',
          message: 'An agent named docs-bot already exists in this workspace',
          issues: [],
        });
      });
      render(<AgentHarness onSubmit={onSubmit} />);
      await user.click(screen.getByRole('button', { name: 'Add agent' }));
      await user.type(screen.getByLabelText('Name'), 'docs-bot{Enter}');

      expect(
        await screen.findByText('An agent named docs-bot already exists in this workspace'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    },
    FLOW_TIMEOUT,
  );

  it(
    'opens prefilled from a Backlog.md assignee and reports the new agent',
    async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn(async (values: CreateAgentValues) => agentResult(values));
      const onCreated = vi.fn();
      render(
        <AgentCreation
          isOpen
          onOpenChange={vi.fn()}
          people={[ana, tomas]}
          defaultResponsibleId={ana.id}
          projects={projects}
          onSubmit={onSubmit}
          onCreated={onCreated}
          defaultName="claude"
          defaultScope={{ access: 'selected', projectIds: [projects[0]?.id ?? ''], permission: 'write' }}
          nameDescription="From @claude in the files. Lowercase, numbers and dashes."
        />,
      );

      expect(screen.getByLabelText('Name')).toHaveValue('claude');
      expect(
        screen.getByText('From @claude in the files. Lowercase, numbers and dashes.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Selected projects' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /PAY/ })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /WEB/ })).not.toBeChecked();

      await user.click(screen.getByRole('button', { name: 'Create agent' }));
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'claude',
        responsibleUserId: ana.id,
        scope: { projects: [projects[0]?.id], access: 'write' },
      });
      await waitFor(() =>
        expect(onCreated).toHaveBeenCalledWith(
          expect.objectContaining({ agent: expect.objectContaining({ name: 'claude' }) }),
        ),
      );
      expect(await screen.findByRole('alertdialog')).toHaveTextContent('Key created for claude');
    },
    FLOW_TIMEOUT,
  );
});

const CLAUDE = { id: '00000000-0000-4000-8000-000000000003', name: 'claude-dev' };

function KeyHarness({
  agent,
  onSubmit,
}: {
  agent: { id: string; name: string };
  onSubmit: (values: CreateApiKeyValues) => Promise<ApiKeyCreated>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onPress={() => setOpen(true)}>New key</Button>
      <KeyCreation
        isOpen={open}
        onOpenChange={setOpen}
        agent={agent}
        actsFor="Ana Ruiz"
        projects={projects}
        onSubmit={onSubmit}
        serverUrl={SERVER}
      />
    </>
  );
}

describe('KeyCreation', () => {
  it(
    'creates a key for an agent and drops the secret after "I copied the key"',
    async () => {
      const user = userEvent.setup();
      const agent = CLAUDE;
      const onSubmit = vi.fn(async (values: CreateApiKeyValues) =>
        createdKey(agent, { name: values.name, scope: { projects: 'all', access: values.scope.access } }),
      );
      render(<KeyHarness agent={agent} onSubmit={onSubmit} />);

      await user.click(screen.getByRole('button', { name: 'New key' }));
      expect(screen.getByRole('heading', { name: 'New key for claude-dev' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Create key' }));
      expect(screen.getByText('Name the key, for example after the machine it runs on.')).toBeInTheDocument();

      await user.type(screen.getByLabelText('Name'), 'CI runner');
      await user.click(screen.getByRole('radio', { name: /Read only/ }));
      await user.click(screen.getByRole('button', { name: 'Create key' }));
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'CI runner',
        ownerId: agent.id,
        scope: { projects: 'all', access: 'read' },
      });

      const reveal = await screen.findByRole('alertdialog');
      expect(reveal).toHaveTextContent('Scope: whole workspace, read only. Acts for Ana Ruiz.');
      expect(secretShown()).toBe(true);
      await user.click(screen.getByRole('button', { name: 'I copied the key' }));
      await waitFor(() => expect(secretShown()).toBe(false));
    },
    FLOW_TIMEOUT,
  );
});
