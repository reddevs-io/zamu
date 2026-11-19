// zamu labels list | create | update | delete (M5), and the label name lookups zamu tasks list uses.
import {
  CreateLabelInput,
  DeleteLabelInput,
  LabelId,
  LabelList,
  type LabelWithUsage,
  ListLabelsInput,
  UpdateLabelInput,
} from '@zamu/contracts';
import type { ApiClient } from '../client';
import { type CommandContext, emit } from '../context';
import { notFoundError, usageError } from '../errors';
import { fields, table } from '../format';
import { requireProject } from '../project';
import { parseInput } from './shared';

/** "Used on 1 task", "Used on 12 tasks", "Not used". */
export function usageLabel(count: number): string {
  if (count === 0) return 'Not used';
  return count === 1 ? 'Used on 1 task' : `Used on ${count} tasks`;
}

function sourceLabel(label: Pick<LabelWithUsage, 'source'>): string {
  return label.source === 'backlog' ? 'Backlog.md' : 'App';
}

/** The quoted names of a project's labels, for "Labels in PAY: ..." hints. */
function namesHint(project: string, items: readonly LabelWithUsage[]): string {
  return items.length
    ? `Labels in ${project}: ${items.map((label) => `"${label.name}"`).join(', ')}`
    : `${project} has no labels.`;
}

async function loadLabels(client: ApiClient, project: string): Promise<LabelWithUsage[]> {
  return LabelList.parse(await client.labels.list(parseInput(ListLabelsInput, { project }))).items;
}

/**
 * Finds one label of a project by id or by name (ignoring case). An unknown name is a not-found
 * error (exit 3) that lists the project's labels.
 */
async function findLabel(client: ApiClient, project: string, value: string): Promise<LabelWithUsage> {
  const trimmed = value.trim();
  const items = await loadLabels(client, project);
  const byId = LabelId.safeParse(trimmed).success ? items.find((label) => label.id === trimmed) : undefined;
  const lower = trimmed.toLowerCase();
  const found = byId ?? items.find((label) => label.name.toLowerCase() === lower);
  if (!found) throw notFoundError(`No label named "${trimmed}" in ${project}.`, [namesHint(project, items)]);
  return found;
}

/**
 * Label filter of zamu tasks list: names (ignoring case) or ids to the ids the API takes. With several
 * projects a name matches in each project that has it; a name no project has is a usage error
 * listing the labels there.
 */
export async function resolveLabelIds(
  client: ApiClient,
  projects: readonly string[] | undefined,
  values: readonly string[],
): Promise<string[]> {
  const ids = values.filter((value) => LabelId.safeParse(value).success);
  const names = values.filter((value) => !LabelId.safeParse(value).success);
  if (names.length === 0) return ids;
  if (!projects?.length) {
    throw usageError(
      `--label "${names[0]}" needs --project to look the name up (or run zamu in a clone linked to a project).`,
    );
  }
  const keys = projects.map((project) => project.trim().toUpperCase());
  const lists = await Promise.all(keys.map((project) => loadLabels(client, project)));
  const found = new Set(ids);
  for (const name of names) {
    const lower = name.toLowerCase();
    const matches = lists.flat().filter((label) => label.name.toLowerCase() === lower);
    if (matches.length === 0) {
      const where = keys.length === 1 ? keys[0] : `${keys.slice(0, -1).join(', ')} or ${keys.at(-1)}`;
      throw usageError(
        `No label named "${name}" in ${where}.`,
        [{ path: 'label', message: `Unknown label "${name}"` }],
        keys.map((project, i) => namesHint(project, lists[i] ?? [])),
      );
    }
    for (const label of matches) found.add(label.id);
  }
  return [...found];
}

/** --color: a palette hue from 1 to 9. */
function colorValue(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function labelSummary(context: CommandContext, verb: string, project: string, label: LabelWithUsage): string {
  const { style } = context;
  const entries: [string, string][] = [
    ['Colour', String(label.color)],
    ['Usage', usageLabel(label.usageCount)],
  ];
  if (label.source === 'backlog') entries.push(['Source', 'Backlog.md (the name changes in the files)']);
  entries.push(['Id', label.id]);
  return `${verb} label ${style.bold(label.name)} in ${project}\n${fields(entries, style)}`;
}

// ---------------------------------------------------------------------------
// zamu labels list
// ---------------------------------------------------------------------------

export async function listLabels(context: CommandContext, options: { project?: string }): Promise<void> {
  const input = parseInput(ListLabelsInput, { project: await requireProject(context, options.project) });
  const client = await context.client();
  const labels = await client.labels.list(input);
  emit(context, 'labels.list', labels, (data) => {
    if (data.items.length === 0) return `No labels in ${input.project}.\n`;
    const { style } = context;
    return table(
      data.items,
      [
        { header: 'NAME', value: (l) => l.name, style: (_l, cell) => style.bold(cell) },
        { header: 'COLOUR', value: (l) => String(l.color) },
        { header: 'TASKS', value: (l) => String(l.usageCount) },
        { header: 'SOURCE', value: (l) => sourceLabel(l) },
      ],
      style,
      context.io.columns,
    );
  });
}

// ---------------------------------------------------------------------------
// zamu labels create
// ---------------------------------------------------------------------------

export async function createLabel(
  context: CommandContext,
  nameWords: string[],
  options: { project?: string; color?: string },
): Promise<void> {
  const project = await requireProject(context, options.project);
  context.target = { ...context.target, project };
  const color = colorValue(options.color);
  const input = parseInput(CreateLabelInput, {
    project,
    name: nameWords.join(' '),
    ...(color !== undefined ? { color } : {}),
  });
  const client = await context.client();
  const label = await client.labels.create(input);
  emit(context, 'labels.create', label, (data) => labelSummary(context, 'Created', input.project, data));
}

// ---------------------------------------------------------------------------
// zamu labels update
// ---------------------------------------------------------------------------

export async function updateLabel(
  context: CommandContext,
  idOrName: string,
  options: { project?: string; name?: string; color?: string },
): Promise<void> {
  const { project } = parseInput(ListLabelsInput, {
    project: await requireProject(context, options.project),
  });
  context.target = { ...context.target, project };
  const color = colorValue(options.color);
  const changes = {
    ...(options.name !== undefined ? { name: options.name } : {}),
    ...(color !== undefined ? { color } : {}),
  };
  // A placeholder id lets the field rules run before the name is looked up.
  const placeholder = '00000000-0000-7000-8000-000000000000';
  parseInput(UpdateLabelInput, { project, id: placeholder, ...changes });
  const client = await context.client();
  const current = await findLabel(client, project, idOrName);
  const label = await client.labels.update(
    parseInput(UpdateLabelInput, { project, id: current.id, ...changes }),
  );
  emit(context, 'labels.update', label, (data) => labelSummary(context, 'Updated', project, data));
}

// ---------------------------------------------------------------------------
// zamu labels delete
// ---------------------------------------------------------------------------

/**
 * zamu labels delete <name> --confirm <name>. Without --confirm, or with another name, nothing is
 * sent: deleting takes the label off every task.
 */
export async function deleteLabel(
  context: CommandContext,
  idOrName: string,
  options: { project?: string; confirm?: string },
): Promise<void> {
  const { project } = parseInput(ListLabelsInput, {
    project: await requireProject(context, options.project),
  });
  context.target = { ...context.target, project };
  const client = await context.client();
  const label = await findLabel(client, project, idOrName);
  const confirm = options.confirm?.trim().toLowerCase();
  if (confirm !== label.name.toLowerCase() && confirm !== label.id) {
    throw usageError(
      `Pass --confirm ${shellWord(label.name)} to delete label ${label.name} from ${project}.`,
      [{ path: 'confirm', message: 'Type the label name to confirm' }],
      [`${usageLabel(label.usageCount)}; deleting takes it off every task.`],
    );
  }
  await client.labels.delete(parseInput(DeleteLabelInput, { project, id: label.id }));
  const { usageCount, ...deleted } = label;
  emit(context, 'labels.delete', { deleted, usageCount }, (data) => {
    const from =
      data.usageCount === 0
        ? ''
        : ` and took it off ${data.usageCount === 1 ? '1 task' : `${data.usageCount} tasks`}`;
    return `Deleted label ${context.style.bold(data.deleted.name)} from ${project}${from}\n`;
  });
}

/** A name as it would be typed in a shell: quoted when it has spaces or shell characters. */
function shellWord(text: string): string {
  return /^[\w.:@/+-]+$/.test(text) ? text : `"${text.replace(/(["\\$`])/g, '\\$1')}"`;
}
