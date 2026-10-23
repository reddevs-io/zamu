import { z } from 'zod';
import {
  Activity,
  Comment,
  CommentList,
  Cycle,
  CycleDetail,
  CycleList,
  Me,
  MilestoneList,
  MilestoneWithProgress,
  ProjectList,
  Task,
  TaskListPage,
  TimelineItem,
} from './entities';
import { Problem } from './problem';

// Versioned `pm ... --json` output. Every result is { "schema": "pm.v1.<name>", "data": ... }.
// Adding optional fields keeps v1. Removing or renaming fields, or changing a type, needs pm.v2.

export const CLI_SCHEMA_VERSION = 'v1';

/** Data schema for each CLI result name. */
export const cliDataSchemas = {
  /** pm login */
  login: z.object({ url: z.url(), me: Me }),
  /** pm logout */
  logout: z.object({ url: z.url().nullable() }),
  /** pm whoami */
  whoami: Me,
  /** pm projects list */
  'projects.list': ProjectList,
  /** pm tasks list [--mine] [--project ...] [--milestone ...] [--cycle ...] */
  'tasks.list': TaskListPage,
  /**
   * pm tasks show. `activity` is the M1 field and stays for v1 readers; `timeline` (M2) holds
   * activity and comments in one list, oldest first.
   */
  'tasks.show': z.object({
    task: Task,
    activity: z.array(Activity),
    timeline: z.array(TimelineItem).optional(),
  }),
  /** pm tasks create */
  'tasks.create': Task,
  /** pm tasks update */
  'tasks.update': Task,
  /** pm comments list */
  'comments.list': CommentList,
  /** pm comments add */
  'comments.add': Comment,
  /** pm comments edit */
  'comments.edit': Comment,
  /** pm comments delete: the comment as it is after the soft delete (body null). */
  'comments.delete': Comment,
  /** pm milestones list */
  'milestones.list': MilestoneList,
  /** pm milestones create */
  'milestones.create': MilestoneWithProgress,
  /** pm milestones update */
  'milestones.update': MilestoneWithProgress,
  /** pm cycles list */
  'cycles.list': CycleList,
  /** pm cycles create */
  'cycles.create': Cycle,
  /** pm cycles current: null when the project has no current cycle. */
  'cycles.current': Cycle.nullable(),
  /** pm cycles end: the completed cycle with its summary and rollovers. */
  'cycles.end': CycleDetail,
  /** Any command that fails while --json is set (printed to stdout, exit code still non-zero). */
  error: Problem,
} as const;

export type CliResultName = keyof typeof cliDataSchemas;
export const CLI_RESULT_NAMES = Object.keys(cliDataSchemas) as CliResultName[];

export type CliSchemaId<N extends CliResultName = CliResultName> = `pm.${typeof CLI_SCHEMA_VERSION}.${N}`;

export function cliSchemaId<N extends CliResultName>(name: N): CliSchemaId<N> {
  return `pm.${CLI_SCHEMA_VERSION}.${name}`;
}

function envelope<N extends CliResultName>(name: N) {
  return z.object({
    schema: z.literal(cliSchemaId(name)),
    data: cliDataSchemas[name] as (typeof cliDataSchemas)[N],
  });
}

type CliOutputSchemas = { [N in CliResultName]: ReturnType<typeof envelope<N>> };

/** Full envelope schema per result name, e.g. `cliOutputSchemas['tasks.list']`. */
export const cliOutputSchemas = Object.fromEntries(
  CLI_RESULT_NAMES.map((name) => [name, envelope(name)]),
) as CliOutputSchemas;

/** Any CLI JSON output, discriminated by `schema`. */
export const CliOutput = z.discriminatedUnion(
  'schema',
  Object.values(cliOutputSchemas) as unknown as [
    CliOutputSchemas[CliResultName],
    ...CliOutputSchemas[CliResultName][],
  ],
);

export type CliOutput<N extends CliResultName = CliResultName> = z.output<CliOutputSchemas[N]>;
export type CliData<N extends CliResultName> = z.output<(typeof cliDataSchemas)[N]>;

/**
 * Wraps data in the versioned envelope after validating it, so the CLI can never print a shape
 * the contract does not describe. Dates become ISO strings on the way through.
 */
export function cliOutput<N extends CliResultName>(
  name: N,
  data: z.input<(typeof cliDataSchemas)[N]>,
): CliOutput<N> {
  return cliOutputSchemas[name].parse({ schema: cliSchemaId(name), data }) as CliOutput<N>;
}

/** Parses CLI JSON output (for scripts and tests). Pass a name to require that result. */
export function parseCliOutput<N extends CliResultName>(value: unknown, name: N): CliOutput<N>;
export function parseCliOutput(value: unknown): CliOutput;
export function parseCliOutput(value: unknown, name?: CliResultName): CliOutput {
  return (name ? cliOutputSchemas[name] : CliOutput).parse(value) as CliOutput;
}
