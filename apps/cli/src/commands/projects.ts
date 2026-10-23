// pm projects list.
import { parseRepositoryUrl } from '@pm/contracts';
import { type CommandContext, emit } from '../context';
import { formatDate, table } from '../format';

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
