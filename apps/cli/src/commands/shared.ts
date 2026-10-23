// Helpers shared by the commands: input parsing, stdin text, choice normalisation and the name
// lookups (members, milestones) that turn what people type into the ids the API takes.
import {
  ASSIGNEE_AGENTS,
  ASSIGNEE_ME,
  MemberList,
  MilestoneId,
  MilestoneList,
  type ProblemIssue,
  UserId,
} from '@pm/contracts';
import type { z } from 'zod';
import type { ApiClient } from '../client';
import type { CommandContext } from '../context';
import { inputError, notFoundError, usageError } from '../errors';
import { personLabel } from '../format';

/** `In progress`, `in-progress` and `IN_PROGRESS` all mean in_progress. */
export function normalizeChoice(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** Commander collector for repeatable, comma-separated options (`--status todo,in_progress`). */
export function collectList(value: string, previous: string[] = []): string[] {
  return [...previous, ...value.split(',').map(normalizeChoice).filter(Boolean)];
}

/** Like collectList, but keeps the values as typed (project keys: `--project PAY,WEB`). */
export function collectKeys(value: string, previous: string[] = []): string[] {
  return [
    ...previous,
    ...value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  ];
}

export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw inputError(parsed.error);
  return parsed.data;
}

/** `-` reads the text from stdin. */
export async function readText(context: CommandContext, value: string): Promise<string> {
  return value === '-' ? context.io.readStdin() : value;
}

/** `none` (any case) clears a field or filters for tasks without it. */
export function isNone(value: string): boolean {
  return value.trim().toLowerCase() === 'none';
}

/** `current`, `next` and `none` are case-insensitive; numbers pass through. */
export function normalizeCycle(value: string): string {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  return lower === 'current' || lower === 'next' || lower === 'none' ? lower : trimmed;
}

/**
 * Resolves an --assignee value to what the API takes: `me`, `agents` (list filter only), a user id,
 * or a member name or email looked up through GET /members.
 */
export async function resolveAssignee(
  client: ApiClient,
  value: string,
  { allowAgents }: { allowAgents: boolean },
): Promise<string> {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower === ASSIGNEE_ME) return ASSIGNEE_ME;
  if (lower === ASSIGNEE_AGENTS) {
    if (allowAgents) return ASSIGNEE_AGENTS;
    throw usageError('--assignee agents only filters pm tasks list. Name one agent instead.');
  }
  if (UserId.safeParse(trimmed).success) return trimmed;

  const members = MemberList.parse(await client.members.list()).items;
  const matches = members.filter(
    (member) => member.name.toLowerCase() === lower || member.email?.toLowerCase() === lower,
  );
  if (matches.length === 1) return (matches[0] as (typeof matches)[number]).id;
  if (matches.length === 0) {
    throw notFoundError(`No workspace member named "${trimmed}".`, [
      `Members: ${members.map((member) => member.name).join(', ') || 'none'}`,
    ]);
  }
  throw usageError(`More than one member is named "${trimmed}". Pass the user id instead.`, undefined, [
    ...matches.map((member) => `${member.id}  ${personLabel(member)}`),
  ]);
}

/** A usage error whose issues (printed as hints too) list what the caller could have meant. */
function candidatesError(detail: string, path: string, candidates: string[]) {
  const issues: ProblemIssue[] = [{ path, message: candidates.join('; ') }];
  return usageError(detail, issues, candidates);
}

/**
 * Resolves a milestone given by id or by name (case-insensitive, within one project) to its id.
 * An unknown or ambiguous name is an input error listing the candidates.
 */
export async function resolveMilestone(
  client: ApiClient,
  project: string | undefined,
  value: string,
  flag = '--milestone',
): Promise<string> {
  const trimmed = value.trim();
  if (MilestoneId.safeParse(trimmed).success) return trimmed;
  if (!project) {
    throw usageError(
      `${flag} "${trimmed}" needs one --project to look the name up. Pass the milestone id instead.`,
    );
  }
  const projectKey = project.trim().toUpperCase();
  const { items } = MilestoneList.parse(await client.milestones.list({ project: projectKey }));
  const lower = trimmed.toLowerCase();
  const matches = items.filter((milestone) => milestone.name.trim().toLowerCase() === lower);
  if (matches.length === 1) return (matches[0] as (typeof matches)[number]).id;
  if (matches.length === 0) {
    const names = items.map((milestone) => `"${milestone.name}"`);
    throw candidatesError(
      `No milestone named "${trimmed}" in ${projectKey}.`,
      'milestone',
      names.length
        ? [`Milestones in ${projectKey}: ${names.join(', ')}`]
        : [`${projectKey} has no milestones.`],
    );
  }
  throw candidatesError(
    `More than one milestone in ${projectKey} is named "${trimmed}". Pass the id instead.`,
    'milestone',
    matches.map((milestone) => `${milestone.id}  ${milestone.name}`),
  );
}
