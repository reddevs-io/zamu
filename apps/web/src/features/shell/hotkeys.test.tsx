import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { SearchField, TextField } from '~/ui';
import { useShellHotkeys } from './hotkeys';
import { NewProjectProvider, useNewProject } from './new-project';
import { PageSearchProvider, usePageSearchRef } from './page-search';
import { QuickCreateProvider, useQuickCreate } from './quick-create';

function Probe({ projectKey }: { projectKey?: string }) {
  useShellHotkeys(projectKey);
  const quickCreate = useQuickCreate();
  const newProject = useNewProject();
  const searchRef = usePageSearchRef();
  return (
    <main>
      <output aria-label="quick create">
        {quickCreate.isOpen ? `open:${quickCreate.projectKey ?? 'none'}` : 'closed'}
      </output>
      <output aria-label="new project">{newProject.isOpen ? 'open' : 'closed'}</output>
      <SearchField aria-label="Search projects" inputRef={searchRef} />
      <TextField label="Notes" />
      <button type="button" onClick={quickCreate.close}>
        Close quick create
      </button>
    </main>
  );
}

function Unregistered() {
  useShellHotkeys(undefined);
  return (
    <main>
      <SearchField aria-label="Search tasks" />
    </main>
  );
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <QuickCreateProvider>
      <NewProjectProvider>
        <PageSearchProvider>{children}</PageSearchProvider>
      </NewProjectProvider>
    </QuickCreateProvider>
  );
}

describe('useShellHotkeys', () => {
  it('C opens quick create in the current project', async () => {
    const user = userEvent.setup();
    render(<Probe projectKey="PAY" />, { wrapper: Providers });
    await user.keyboard('c');
    expect(screen.getByLabelText('quick create')).toHaveTextContent('open:PAY');
  });

  it('C outside a project leaves the project to the dialog', async () => {
    const user = userEvent.setup();
    render(<Probe />, { wrapper: Providers });
    await user.keyboard('c');
    expect(screen.getByLabelText('quick create')).toHaveTextContent('open:none');
  });

  it('P opens New project and / focuses the page search', async () => {
    const user = userEvent.setup();
    render(<Probe />, { wrapper: Providers });
    await user.keyboard('p');
    expect(screen.getByLabelText('new project')).toHaveTextContent('open');
    await user.keyboard('/');
    expect(screen.getByRole('searchbox', { name: 'Search projects' })).toHaveFocus();
  });

  it('ignores C and P while typing', async () => {
    const user = userEvent.setup();
    render(<Probe projectKey="PAY" />, { wrapper: Providers });
    await user.click(screen.getByLabelText('Notes'));
    await user.keyboard('cp/');
    expect(screen.getByLabelText('quick create')).toHaveTextContent('closed');
    expect(screen.getByLabelText('new project')).toHaveTextContent('closed');
    expect(screen.getByLabelText('Notes')).toHaveValue('cp/');
  });

  it('falls back to the first search field in <main>', async () => {
    const user = userEvent.setup();
    render(<Unregistered />, { wrapper: Providers });
    await user.keyboard('/');
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveFocus();
  });
});
