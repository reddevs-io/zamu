// pm link: links the project to this clone's repository on the server (so pm finds the project in
// every clone of it), unlinks it with --clear, or writes .pm.json with --file.
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  type CliData,
  PROJECT_FILE_NAME,
  ProjectKeyInput,
  ProjectList,
  type ProjectWithCounts,
  parseRepositoryUrl,
  sameRepository,
  UpdateProjectInput,
} from '@pm/contracts';
import type { ApiClient } from '../client';
import { type CommandContext, emit } from '../context';
import { notFoundError, usageError } from '../errors';
import { gitRemote, gitRoot, parseProjectFile, resolveProject } from '../project';
import { parseInput } from './shared';

export interface LinkOptions {
  project?: string;
  force?: boolean;
  clear?: boolean;
  file?: boolean;
  here?: boolean;
}

const short = (url: string) => parseRepositoryUrl(url)?.short ?? url;

/** The project by key among those the caller can read, with its current repository. */
async function readableProject(client: ApiClient, key: string): Promise<ProjectWithCounts> {
  const { items } = ProjectList.parse(await client.projects.list());
  const found = items.find((project) => project.key === key);
  if (!found) {
    throw notFoundError(`No project ${key} that this key can read.`, [
      `Projects: ${items.map((project) => project.key).join(', ') || 'none'}`,
    ]);
  }
  return found;
}

function projectKey(value: string): string {
  return parseInput(ProjectKeyInput, value);
}

function printLink(context: CommandContext, data: CliData<'link'>, previous: string | null): string {
  const { style } = context;
  const key = style.bold(data.project);
  switch (data.action) {
    case 'linked':
      return `Linked ${key} to ${data.repository}. pm now picks ${data.project} in clones of it.\n`;
    case 'replaced':
      return `Linked ${key} to ${data.repository} (was ${previous}).\n`;
    case 'cleared':
      return `Unlinked ${key} from ${previous}. In clones of it, pass --project ${data.project} again.\n`;
    case 'created':
    case 'updated':
      return `Wrote ${data.file}: pm uses ${key} in this folder and below. Commit it so every clone gets it.\n`;
    default:
      return data.target === 'file'
        ? `${data.file} already names ${key}.\n`
        : data.repository
          ? `${key} is already linked to ${data.repository}.\n`
          : `${key} has no repository linked.\n`;
  }
}

export async function link(context: CommandContext, options: LinkOptions): Promise<void> {
  if (options.clear && options.file) throw usageError('Use either --file or --clear, not both.');
  if (options.here && !options.file) throw usageError('--here only works with --file.');
  if (options.force && (options.clear || options.file)) {
    throw usageError('--force only works when linking the repository on the server.');
  }
  if (options.file) return linkFile(context, options);
  if (options.clear) return clearLink(context, options);
  return linkRemote(context, options);
}

/** Sets the project's repository to this clone's remote. */
async function linkRemote(context: CommandContext, options: LinkOptions): Promise<void> {
  const { io } = context;
  const remote = await gitRemote(io);
  if (!remote) {
    const inRepo = (await gitRoot(io)) !== null;
    throw usageError(
      inRepo ? 'This clone has no git remote to link.' : 'This folder is not inside a git repository.',
      undefined,
      [
        "Run pm link in a clone with an origin remote, or set the repository in the project's settings on the web.",
      ],
    );
  }
  const repository = parseRepositoryUrl(remote.url);
  if (!repository) {
    throw usageError(`The remote ${remote.name} (${remote.url}) is not a URL pm can link.`, undefined, [
      'pm links HTTPS and SSH remotes, like https://host/owner/repo or git@host:owner/repo.',
    ]);
  }
  // The remote is what is being linked, so it cannot also pick the project.
  const resolved = await resolveProject(context, options.project, { remote: false });
  if (!resolved) throw usageError('Name the project to link: pm link --project KEY');
  const key = projectKey(resolved.key);

  const client = await context.client();
  const current = await readableProject(client, key);
  const previous = current.repository ? short(current.repository) : null;
  let action: CliData<'link'>['action'];
  if (current.repository && sameRepository(current.repository, remote.url)) {
    action = 'unchanged';
  } else {
    if (current.repository && !options.force) {
      throw usageError(`${key} is already linked to ${previous}.`, undefined, [
        `Pass --force to link it to ${repository.short} instead.`,
      ]);
    }
    await client.projects.update(parseInput(UpdateProjectInput, { project: key, repository: remote.url }));
    action = current.repository ? 'replaced' : 'linked';
  }
  emit(
    context,
    'link',
    { project: key, target: 'server', action, repository: repository.short, file: null },
    (data) => printLink(context, data, previous),
  );
}

/** Removes the project's repository. Without --project, the project of this clone. */
async function clearLink(context: CommandContext, options: LinkOptions): Promise<void> {
  const resolved = await resolveProject(context, options.project);
  if (!resolved) throw usageError('Name the project to unlink: pm link --clear --project KEY');
  const key = projectKey(resolved.key);
  const client = await context.client();
  const current = await readableProject(client, key);
  const previous = current.repository ? short(current.repository) : null;
  if (current.repository) {
    await client.projects.update(parseInput(UpdateProjectInput, { project: key, repository: null }));
  }
  emit(
    context,
    'link',
    {
      project: key,
      target: 'server',
      action: current.repository ? 'cleared' : 'unchanged',
      repository: null,
      file: null,
    },
    (data) => printLink(context, data, previous),
  );
}

/** Writes .pm.json at the git root, or in the working directory with --here. */
async function linkFile(context: CommandContext, options: LinkOptions): Promise<void> {
  const { io } = context;
  const resolved = await resolveProject(context, options.project);
  if (!resolved) throw usageError('Name the project for .pm.json: pm link --file --project KEY');
  const key = projectKey(resolved.key);
  // Catch a mistyped key now rather than on the next command.
  await readableProject(await context.client(), key);

  const dir = options.here ? io.cwd : ((await gitRoot(io)) ?? io.cwd);
  const path = join(dir, PROJECT_FILE_NAME);
  const existing = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw usageError(`Cannot read ${path}: ${error.message}`);
  });
  let action: CliData<'link'>['action'] = 'created';
  if (existing !== null) {
    // A broken file is replaced; one that already names the project is left alone.
    let current: string | null = null;
    try {
      current = parseProjectFile(path, existing).project;
    } catch {
      current = null;
    }
    action = current === key ? 'unchanged' : 'updated';
  }
  if (action !== 'unchanged') await writeFile(path, `${JSON.stringify({ project: key }, null, 2)}\n`);
  const shown = relative(io.cwd, path) || PROJECT_FILE_NAME;
  emit(context, 'link', { project: key, target: 'file', action, repository: null, file: path }, (data) =>
    printLink(context, { ...data, file: shown }, null),
  );
}
