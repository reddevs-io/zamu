// pm milestones list | create | update.
import {
  CreateMilestoneInput,
  ListMilestonesInput,
  MilestoneId,
  type MilestoneWithProgress,
  UpdateMilestoneInput,
} from '@pm/contracts';
import { type CommandContext, emit } from '../context';
import { fields, milestoneStatusLabel, progressLabel, table } from '../format';
import { requireProject, resolveProject } from '../project';
import { isNone, normalizeChoice, parseInput, readText, resolveMilestone } from './shared';

function days(count: number): string {
  return count === 1 ? '1 day' : `${count} days`;
}

/** "2026-11-14 (22 days left)", "2026-10-20 (overdue by 3 days)" or "None". */
function targetLabel(milestone: MilestoneWithProgress, { long }: { long: boolean }): string {
  const date = milestone.targetDate;
  if (!date) return long ? 'None' : '';
  if (milestone.overdue) {
    return long && milestone.daysLeft !== null
      ? `${date} (overdue by ${days(-milestone.daysLeft)})`
      : `${date} overdue`;
  }
  if (!long || milestone.status === 'completed' || milestone.daysLeft === null) return date;
  return milestone.daysLeft === 0 ? `${date} (today)` : `${date} (${days(milestone.daysLeft)} left)`;
}

function milestoneSummary(context: CommandContext, verb: string, milestone: MilestoneWithProgress): string {
  const { style } = context;
  const head = `${verb} milestone ${style.bold(milestone.name)} in ${milestone.project.key}`;
  return `${head}\n${fields(
    [
      ['Status', milestoneStatusLabel(milestone.status)],
      ['Target', targetLabel(milestone, { long: true })],
      ['Progress', progressLabel(milestone.progress)],
      ['Id', milestone.id],
    ],
    style,
  )}`;
}

// ---------------------------------------------------------------------------
// pm milestones list
// ---------------------------------------------------------------------------

export async function listMilestones(context: CommandContext, options: { project?: string }): Promise<void> {
  const input = parseInput(ListMilestonesInput, { project: await requireProject(context, options.project) });
  const client = await context.client();
  const milestones = await client.milestones.list(input);
  emit(context, 'milestones.list', milestones, (data) => {
    if (data.items.length === 0) return `No milestones in ${input.project}.\n`;
    const { style } = context;
    return table(
      data.items,
      [
        { header: 'STATUS', value: (m) => milestoneStatusLabel(m.status) },
        { header: 'TARGET', value: (m) => targetLabel(m, { long: false }) },
        { header: 'DONE', value: (m) => progressLabel(m.progress) },
        { header: 'IN PROGRESS', value: (m) => String(m.progress.inProgress) },
        { header: 'OPEN', value: (m) => String(m.progress.open) },
        { header: 'NAME', value: (m) => m.name, style: (_m, cell) => style.bold(cell) },
      ],
      style,
      context.io.columns,
    );
  });
}

// ---------------------------------------------------------------------------
// pm milestones create
// ---------------------------------------------------------------------------

export interface CreateMilestoneOptions {
  project?: string;
  target?: string;
  description?: string;
}

export async function createMilestone(
  context: CommandContext,
  nameWords: string[],
  options: CreateMilestoneOptions,
): Promise<void> {
  const input = parseInput(CreateMilestoneInput, {
    project: await requireProject(context, options.project),
    name: nameWords.join(' '),
    ...(options.target !== undefined ? { targetDate: isNone(options.target) ? null : options.target } : {}),
    ...(options.description !== undefined
      ? { description: await readText(context, options.description) }
      : {}),
  });
  const client = await context.client();
  const milestone = await client.milestones.create(input);
  emit(context, 'milestones.create', milestone, (data) => milestoneSummary(context, 'Created', data));
}

// ---------------------------------------------------------------------------
// pm milestones update
// ---------------------------------------------------------------------------

export interface UpdateMilestoneOptions {
  project?: string;
  name?: string;
  target?: string;
  status?: string;
  description?: string;
}

export async function updateMilestone(
  context: CommandContext,
  idOrName: string,
  options: UpdateMilestoneOptions,
): Promise<void> {
  const description =
    options.description === undefined ? undefined : await readText(context, options.description);
  const changes = {
    ...(options.name !== undefined ? { name: options.name } : {}),
    ...(options.target !== undefined ? { targetDate: isNone(options.target) ? null : options.target } : {}),
    ...(options.status !== undefined ? { status: normalizeChoice(options.status) } : {}),
    // An empty description clears it.
    ...(description !== undefined ? { description: description.trim() ? description : null } : {}),
  };
  // A placeholder id lets the field rules run before the name is looked up.
  const placeholder = '00000000-0000-7000-8000-000000000000';
  parseInput(UpdateMilestoneInput, { id: placeholder, ...changes });
  const client = await context.client();
  // A name needs a project to look it up in; an id does not.
  const project = MilestoneId.safeParse(idOrName.trim()).success
    ? options.project
    : (await resolveProject(context, options.project))?.key;
  const id = await resolveMilestone(client, project, idOrName, 'Milestone');
  const input = parseInput(UpdateMilestoneInput, { id, ...changes });
  const milestone = await client.milestones.update(input);
  emit(context, 'milestones.update', milestone, (data) => milestoneSummary(context, 'Updated', data));
}
