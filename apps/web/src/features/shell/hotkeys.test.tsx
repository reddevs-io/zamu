import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRefusalText } from '~/features/project-header/mirror';
import { SearchField, TextField, useHotkeys } from '~/ui';
import { GO_TO_WINDOW_MS, useGoToHotkeys, useShellHotkeys } from './hotkeys';
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

const MIRRORED_TEXT = createRefusalText('Payments');

/** The shell's providers with PAY mirrored from Backlog.md. */
function MirroredProviders({ children }: { children: ReactNode }) {
  return (
    <QuickCreateProvider refuse={(key) => (key === 'PAY' ? MIRRORED_TEXT : null)}>
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

  it('C in a project mirrored from Backlog.md shows the refusal instead of the dialog', async () => {
    const user = userEvent.setup();
    const text = MIRRORED_TEXT;
    const { unmount } = render(<Probe projectKey="PAY" />, { wrapper: MirroredProviders });
    await user.keyboard('c');
    expect(screen.getByLabelText('quick create')).toHaveTextContent('closed');
    expect(screen.getByText(text).closest('[role="status"]')).toBeInTheDocument();
    expect(text).toBe(
      'Tasks in Payments come from Backlog.md. Add a file under backlog/tasks/, or run backlog task create, and push. It shows up here after the next refresh.',
    );
    unmount();
    // Other projects still open the dialog.
    render(<Probe projectKey="WEB" />, { wrapper: MirroredProviders });
    await user.keyboard('c');
    expect(screen.getByLabelText('quick create')).toHaveTextContent('open:WEB');
  });

  it('falls back to the first search field in <main>', async () => {
    const user = userEvent.setup();
    render(<Unregistered />, { wrapper: Providers });
    await user.keyboard('/');
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveFocus();
  });
});

function GoTo({ onMyTasks, onM }: { onMyTasks: () => void; onM: () => void }) {
  useGoToHotkeys({ m: onMyTasks });
  // A page shortcut on the same letter (M focuses the comment composer on task screens).
  useHotkeys({ m: onM });
  return (
    <main>
      <TextField label="Notes" />
    </main>
  );
}

describe('useGoToHotkeys', () => {
  afterEach(() => vi.useRealTimers());

  it('G then M goes to My tasks, and the page does not also get M', async () => {
    const user = userEvent.setup();
    const onMyTasks = vi.fn();
    const onM = vi.fn();
    render(<GoTo onMyTasks={onMyTasks} onM={onM} />);
    await user.keyboard('gm');
    expect(onMyTasks).toHaveBeenCalledTimes(1);
    expect(onM).not.toHaveBeenCalled();
    // M alone is the page's.
    await user.keyboard('m');
    expect(onMyTasks).toHaveBeenCalledTimes(1);
    expect(onM).toHaveBeenCalledTimes(1);
  });

  it('ignores the sequence while typing and after the window passes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const user = userEvent.setup();
    const onMyTasks = vi.fn();
    render(<GoTo onMyTasks={onMyTasks} onM={() => {}} />);
    await user.click(screen.getByLabelText('Notes'));
    await user.keyboard('gm');
    expect(onMyTasks).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Notes')).toHaveValue('gm');
    await user.click(document.body);
    await user.keyboard('g');
    vi.setSystemTime(Date.now() + GO_TO_WINDOW_MS + 1);
    await user.keyboard('m');
    expect(onMyTasks).not.toHaveBeenCalled();
    // Another key between G and M cancels it.
    await user.keyboard('gxm');
    expect(onMyTasks).not.toHaveBeenCalled();
  });
});
