// pm login, pm logout, pm whoami.
import { relative } from 'node:path';
import {
  ApiKeySecret,
  type CliResolvedProject,
  type Me,
  Me as MeSchema,
  parseRepositoryUrl,
  toProblemIssues,
} from '@pm/contracts';
import { createApiClient } from '../client';
import {
  configPath,
  DEFAULT_URL,
  deleteConfig,
  envKey,
  normalizeUrl,
  readConfig,
  writeConfig,
} from '../config';
import { type CommandContext, emit } from '../context';
import { usageError } from '../errors';
import { fields, personLabel, scopeLabel } from '../format';
import { resolveProject } from '../project';

export interface LoginOptions {
  key: string;
  url?: string;
}

const envKeyName = (io: CommandContext['io']) => (io.env.PM_KEY ? 'PM_KEY' : 'PM_API_KEY');

function whoLine(me: Me): string {
  return `${personLabel(me.user)} (${me.user.kind === 'agent' ? 'agent' : (me.user.email ?? 'person')})`;
}

/** "PAY (from .pm.json)", for whoami. */
function projectLabel(context: CommandContext, project: CliResolvedProject | null | undefined): string {
  if (!project) return 'none here: pass --project, or run pm link in a clone';
  const from = {
    flag: '--project',
    env: 'PM_PROJECT',
    file: project.from ? relative(context.io.cwd, project.from) || project.from : '.pm.json',
    remote: `git remote ${parseRepositoryUrl(project.from ?? '')?.short ?? project.from ?? ''}`,
  }[project.source];
  return `${project.key} (from ${from})`;
}

function meFields(context: CommandContext, me: Me, url: string, project?: CliResolvedProject | null): string {
  return fields(
    [
      ['Workspace', me.workspace.name],
      ['Role', me.role],
      ['Access', me.auth.scope ? `API key: ${scopeLabel(me.auth.scope)}` : 'Session: full member rights'],
      ['Server', url],
      ...(project === undefined ? [] : [['Project', projectLabel(context, project)] as [string, string]]),
    ],
    context.style,
  );
}

export async function login(context: CommandContext, options: LoginOptions): Promise<void> {
  const { io } = context;
  const key = options.key === '-' ? (await io.readStdin()).trim() : options.key.trim();
  const parsedKey = ApiKeySecret.safeParse(key);
  if (!parsedKey.success) {
    throw usageError('That is not a pm API key.', toProblemIssues(parsedKey.error.issues), [
      'Keys start with pm_live_. Create one in Settings > API keys.',
    ]);
  }
  const stored = await readConfig(io).catch(() => null);
  const url = normalizeUrl(options.url ?? (io.env.PM_URL || stored?.url || DEFAULT_URL));
  context.url = url;

  const client = createApiClient({ url, key: parsedKey.data, ...(io.fetch ? { fetch: io.fetch } : {}) });
  const me = MeSchema.parse(await client.me.get());
  const path = await writeConfig(io, { url, key: parsedKey.data });

  if (envKey(io) && envKey(io) !== parsedKey.data) {
    io.stderr(`pm: ${envKeyName(io)} is set in this shell and takes precedence over the stored key.\n`);
  }
  emit(context, 'login', { url, me }, (data) => {
    const { style } = context;
    return `Logged in as ${style.bold(whoLine(data.me))}\n${meFields(context, data.me, data.url)}${style.dim(`Key stored in ${path}`)}\n`;
  });
}

export async function logout(context: CommandContext): Promise<void> {
  const { io } = context;
  const path = configPath(io);
  const url = await deleteConfig(io);
  emit(context, 'logout', { url }, (data) => {
    const lines = [
      data.url ? `Logged out of ${data.url}. Removed ${path}.` : 'Not logged in; nothing to remove.',
    ];
    if (envKey(io)) lines.push(`${envKeyName(io)} is still set in this shell, so commands keep using it.`);
    return `${lines.join('\n')}\n`;
  });
}

export async function whoami(context: CommandContext): Promise<void> {
  const client = await context.client();
  const me = await client.me.get();
  const url = context.url as string;
  const project = await resolveProject(context);
  emit(
    context,
    'whoami',
    { ...me, project },
    (data) => `${context.style.bold(whoLine(data))}\n${meFields(context, data, url, data.project ?? null)}`,
  );
}
