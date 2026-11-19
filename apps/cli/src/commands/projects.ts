// zamu projects list | delete.
import { DeleteProjectInput, ProjectKeyInput, parseRepositoryUrl } from '@zamu/contracts';
import { type CommandContext, emit } from '../context';
import { usageError } from '../errors';
import { formatDate, table } from '../format';
import { parseInput } from './shared';

export async function listProjects(context: CommandContext): Promise<void> {
  const client = await context.client();
  const projects = await client.projects.list();
  emit(context, 'projects.list', projects, (data) => {
    if (data.items.length === 0) return 'No projects yet.\n';
    const { style } = context;
    return table(
      data.items,
      [
        { header: 'KEY', value: (p) => p.key, style: (_p, cell) => style.bold(cell) },
        { header: 'OPEN', value: (p) => String(p.openCount) },
        { header: 'BACKLOG', value: (p) => String(p.openCounts.backlog) },
        { header: 'TODO', value: (p) => String(p.openCounts.todo) },
        { header: 'IN PROGRESS', value: (p) => String(p.openCounts.in_progress) },
        { header: 'IN REVIEW', value: (p) => String(p.openCounts.in_review) },
        { header: 'ACTIVE', value: (p) => formatDate(p.lastActivityAt) },
        { header: 'NAME', value: (p) => p.name },
        ...(data.items.some((p) => p.repository)
          ? [
              {
                header: 'REPOSITORY',
                value: (p: (typeof data.items)[number]) =>
                  p.repository ? (parseRepositoryUrl(p.repository)?.short ?? p.repository) : '',
              },
            ]
          : []),
      ],
      style,
      context.io.columns,
    );
  });
}

/**
 * zamu projects delete <KEY> --confirm <KEY>. Without --confirm, or with another key, nothing is
 * sent: deleting takes every task, comment and the Backlog.md mirror with it.
 */
export async function deleteProject(
  context: CommandContext,
  key: string,
  options: { confirm?: string },
): Promise<void> {
  const project = parseInput(ProjectKeyInput, key);
  const input = DeleteProjectInput.safeParse({ project, confirmKey: options.confirm ?? '' });
  if (!input.success) {
    throw usageError(`Pass --confirm ${project} to delete project ${project}.`, [
      { path: 'confirmKey', message: 'Type the project key to confirm' },
    ]);
  }
  const client = await context.client();
  await client.projects.delete(input.data);
  emit(context, 'projects.delete', { deleted: project }, (data) => {
    return `Deleted project ${context.style.bold(data.deleted)}\n`;
  });
}
