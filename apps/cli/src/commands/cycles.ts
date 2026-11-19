// zamu cycles list | create | current | end.
import {
  CreateCycleInput,
  type Cycle,
  type CycleDetail,
  CycleList,
  EndCycleInput,
  ListCyclesInput,
} from '@zamu/contracts';
import { type CommandContext, emit } from '../context';
import { cycleDates, cycleLabel, cycleStateLabel, fields, formatTime, statusLabel, table } from '../format';
import { requireProject } from '../project';
import { normalizeCycle, parseInput } from './shared';

/** "3 days left", "1 day left" or "" for cycles that are not current. */
function daysLeftLabel(cycle: Cycle): string {
  if (cycle.daysLeft === null) return '';
  return cycle.daysLeft === 1 ? '1 day left' : `${cycle.daysLeft} days left`;
}

/** Done of all tasks in the cycle: "4/9 done". Ended cycles read their summary. */
function doneLabel(cycle: Cycle): string {
  if (cycle.summary) return `${cycle.summary.completed}/${cycle.summary.scope} done`;
  return `${cycle.counts.done}/${cycle.counts.total} done`;
}

function cycleFields(context: CommandContext, cycle: Cycle): string {
  const { counts } = cycle;
  const state =
    cycle.daysLeft === null
      ? cycleStateLabel(cycle.state)
      : `${cycleStateLabel(cycle.state)}, ${daysLeftLabel(cycle)}`;
  const entries: [string, string][] = [
    ['State', state],
    ['Dates', cycleDates(cycle)],
  ];
  // Live counts until the cycle ends; after that its tasks moved on and the summary tells the story.
  if (!cycle.summary) {
    entries.push([
      'Tasks',
      `${counts.total} · ${counts.done} done · ${counts.in_progress + counts.in_review} in progress · ` +
        `${counts.backlog + counts.todo} open${counts.canceled ? ` · ${counts.canceled} canceled` : ''}`,
    ]);
    if (counts.addedAfterStart) entries.push(['Added late', String(counts.addedAfterStart)]);
  }
  if (cycle.completedAt) {
    entries.push(['Ended', `${formatTime(cycle.completedAt)} by ${cycle.endedBy?.name ?? 'System'}`]);
  }
  if (cycle.summary) {
    const s = cycle.summary;
    entries.push([
      'Summary',
      `${s.completed}/${s.scope} completed · ${s.rolledOver} rolled over · ${s.canceled} canceled · ` +
        `${s.addedAfterStart} added after start`,
    ]);
  }
  return fields(entries, context.style);
}

// ---------------------------------------------------------------------------
// zamu cycles list
// ---------------------------------------------------------------------------

export async function listCycles(context: CommandContext, options: { project?: string }): Promise<void> {
  const input = parseInput(ListCyclesInput, { project: await requireProject(context, options.project) });
  const client = await context.client();
  const cycles = await client.cycles.list(input);
  emit(context, 'cycles.list', cycles, (data) => {
    if (data.items.length === 0) return `No cycles in ${input.project}.\n`;
    const { style } = context;
    return table(
      data.items,
      [
        { header: 'CYCLE', value: (c) => String(c.number), style: (_c, cell) => style.bold(cell) },
        { header: 'STATE', value: (c) => cycleStateLabel(c.state) },
        { header: 'STARTS', value: (c) => c.startsOn },
        { header: 'ENDS', value: (c) => c.endsOn },
        { header: 'LEFT', value: (c) => (c.daysLeft === null ? '' : `${c.daysLeft}d`) },
        { header: 'TASKS', value: (c) => doneLabel(c) },
        { header: 'NAME', value: (c) => c.name ?? '' },
      ],
      style,
      context.io.columns,
    );
  });
}

// ---------------------------------------------------------------------------
// zamu cycles create
// ---------------------------------------------------------------------------

export interface CreateCycleOptions {
  project?: string;
  starts?: string;
  ends?: string;
  name?: string;
}

export async function createCycle(context: CommandContext, options: CreateCycleOptions): Promise<void> {
  const input = parseInput(CreateCycleInput, {
    project: await requireProject(context, options.project),
    ...(options.starts !== undefined ? { startsOn: options.starts } : {}),
    ...(options.ends !== undefined ? { endsOn: options.ends } : {}),
    ...(options.name !== undefined ? { name: options.name } : {}),
  });
  const client = await context.client();
  const cycle = await client.cycles.create(input);
  emit(context, 'cycles.create', cycle, (data) => {
    const head = `Created ${context.style.bold(cycleLabel(data))} in ${data.project.key}`;
    return `${head}\n${cycleFields(context, data)}`;
  });
}

// ---------------------------------------------------------------------------
// zamu cycles current
// ---------------------------------------------------------------------------

export async function currentCycle(context: CommandContext, options: { project?: string }): Promise<void> {
  const input = parseInput(ListCyclesInput, {
    project: await requireProject(context, options.project),
    state: 'current',
  });
  const client = await context.client();
  // cycles.get with `current` answers 404 when there is none; the list answers an empty list.
  const { items } = CycleList.parse(await client.cycles.list(input));
  emit(context, 'cycles.current', items[0] ?? null, (data) => {
    if (!data) return `${input.project} has no current cycle.\n`;
    return `${context.style.bold(cycleLabel(data))}\n${cycleFields(context, data)}`;
  });
}

// ---------------------------------------------------------------------------
// zamu cycles end
// ---------------------------------------------------------------------------

export interface EndCycleOptions {
  project?: string;
  moveTo?: string;
}

function rolloverText(context: CommandContext, cycle: CycleDetail): string {
  if (cycle.rollovers.length === 0) return '';
  const { style } = context;
  const rows = table(
    cycle.rollovers,
    [
      { header: 'KEY', value: (r) => r.task.key, style: (_r, cell) => style.bold(cell) },
      { header: 'STATUS', value: (r) => statusLabel(r.statusAtEnd) },
      { header: 'MOVED TO', value: (r) => (r.movedTo ? `Cycle ${r.movedTo.number}` : 'No cycle') },
      { header: 'TITLE', value: (r) => r.task.title },
    ],
    style,
    context.io.columns,
  );
  return `\n${style.dim('Rolled over')}\n${rows}`;
}

export async function endCycle(
  context: CommandContext,
  number: string | undefined,
  options: EndCycleOptions,
): Promise<void> {
  const input = parseInput(EndCycleInput, {
    project: await requireProject(context, options.project),
    number: number === undefined ? 'current' : normalizeCycle(number),
    ...(options.moveTo !== undefined ? { moveTo: normalizeCycle(options.moveTo) } : {}),
  });
  const client = await context.client();
  const cycle = await client.cycles.end(input);
  emit(context, 'cycles.end', cycle, (data) => {
    const head = `Ended ${context.style.bold(cycleLabel(data))} in ${data.project.key}`;
    return `${head}\n${cycleFields(context, data)}${rolloverText(context, data)}`;
  });
}
