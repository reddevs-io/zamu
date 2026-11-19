// zamu agents: writes how to use zamu into AGENTS.md (or CLAUDE.md) between two markers, so coding
// agents in this repository know the commands. Running it again replaces only that block.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { ProjectKeyInput } from '@zamu/contracts';
import { envKey, readConfig } from '../config';
import { type CommandContext, emit } from '../context';
import { EXIT, toCliError, usageError } from '../errors';
import { gitRoot, resolveProject } from '../project';

export interface AgentsOptions {
  file?: string;
  print?: boolean;
  project?: string;
}

export const AGENTS_BLOCK_START = '<!-- zamu:start (written by zamu agents; run it again to update) -->';
export const AGENTS_BLOCK_END = '<!-- zamu:end -->';
const BLOCK = /<!-- zamu:start[^>]*-->[\s\S]*?<!-- zamu:end -->/;

/** The instructions, for the project of this repository when one is known. */
export function agentsBlock(project: string | null): string {
  const key = project ?? 'KEY';
  const task = `${key}-12`;
  const projectFlag = project ? '' : ' --project KEY';
  const intro = project
    ? `Tasks for this repository are in project ${project}. zamu picks ${project} here, so --project is optional.`
    : 'Pass --project KEY to commands that work on one project. Run zamu link --project KEY once in a clone so zamu picks it by itself.';
  return [
    AGENTS_BLOCK_START,
    '## Tasks: the zamu CLI',
    '',
    `Track work with \`zamu\`, the CLI of the Zamu server. ${intro}`,
    'Credentials come from ZAMU_URL and ZAMU_KEY, or from `zamu login`. Never write a key into the repository.',
    '`zamu whoami` shows who you act as and which project zamu uses here.',
    '',
    `- Find work: \`zamu tasks list --mine --status todo --cycle current --json\``,
    `- Read a task and its history: \`zamu tasks show ${task} --json\``,
    `- Start it: \`zamu tasks update ${task} --status in_progress\``,
    `- Report progress or a blocker: \`zamu comments add ${task} "..."\` (\`-\` reads the body from stdin; \`@name\` mentions a member)`,
    `- Hand it over for review: \`zamu tasks update ${task} --status in_review\``,
    `- Add a follow-up: \`zamu tasks create "Title"${projectFlag} --description -\``,
    `- Milestones and cycles: \`zamu milestones list${projectFlag}\`, \`zamu cycles current${projectFlag}\``,
    `- Split or link work: \`zamu tasks create "Title" --parent ${task}\`, \`zamu tasks update ${task} --blocked-by ${key}-9 --label bug\``,
    '',
    'In a project mirrored from Backlog.md, Backlog.md ids work as task keys, and the task files own title,',
    'description, status, priority, assignee and milestone: change those in the files (or with `backlog task edit`)',
    `and push, then \`zamu backlog refresh${projectFlag} --wait\`. Comments and cycles still change through zamu.`,
    '',
    'Add `--json` to any command for versioned output (`zamu.v1.*`). Exit codes: 0 ok, 1 usage or',
    'rejected input, 2 not logged in or key refused, 3 not found, 4 outside the key scope or read-only, 5 server,',
    '6 the change belongs in Backlog.md, or the mirror is paused or detached.',
    AGENTS_BLOCK_END,
  ].join('\n');
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** --file, else AGENTS.md or CLAUDE.md at the git root (working directory outside a repository). */
async function targetFile(context: CommandContext, file: string | undefined): Promise<string> {
  const { io } = context;
  if (file !== undefined) return resolve(io.cwd, file);
  const dir = (await gitRoot(io)) ?? io.cwd;
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const path = join(dir, name);
    if (await exists(path)) return path;
  }
  return join(dir, 'AGENTS.md');
}

/**
 * The project to name in the block. The remote lookup needs credentials and the server; without
 * them, or when it fails, the block names no project.
 */
async function blockProject(context: CommandContext, flag: string | undefined): Promise<string | null> {
  const { io } = context;
  if (flag !== undefined) {
    const parsed = ProjectKeyInput.safeParse(flag);
    if (!parsed.success) throw usageError(`--project ${flag}: not a project key.`);
    return parsed.data;
  }
  const credentials = Boolean(envKey(io)) || (await readConfig(io).catch(() => null)) !== null;
  try {
    return (await resolveProject(context, undefined, { remote: credentials }))?.key ?? null;
  } catch (error) {
    const failure = toCliError(error, context.url);
    // A broken .zamu.json or ZAMU_PROJECT is the caller's to fix; a failed lookup only loses the key.
    if (failure.exitCode === EXIT.usage) throw failure;
    if (!context.json) {
      io.stderr(
        `zamu: could not look up the project of this clone (${failure.message}). The block names none.\n`,
      );
    }
    return null;
  }
}

export async function agents(context: CommandContext, options: AgentsOptions): Promise<void> {
  const { io } = context;
  const project = await blockProject(context, options.project);
  const block = agentsBlock(project);

  if (options.print) {
    emit(context, 'agents', { file: null, action: 'printed', project, block }, (data) => `${data.block}\n`);
    return;
  }

  const path = await targetFile(context, options.file);
  const current = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw usageError(`Cannot read ${path}: ${error.message}`);
  });
  let next: string;
  let action: 'created' | 'updated' | 'unchanged';
  if (current === null) {
    next = `${block}\n`;
    action = 'created';
  } else if (BLOCK.test(current)) {
    next = current.replace(BLOCK, () => block);
    action = next === current ? 'unchanged' : 'updated';
  } else {
    next = current.trim() ? `${current.trimEnd()}\n\n${block}\n` : `${block}\n`;
    action = 'updated';
  }
  if (action !== 'unchanged') {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, next);
  }

  const shown = relative(io.cwd, path) || path;
  emit(context, 'agents', { file: path, action, project, block }, (data) => {
    const named = data.project ? ` for ${data.project}` : '';
    if (data.action === 'created') return `Created ${shown} with zamu instructions${named}.\n`;
    if (data.action === 'updated') return `Wrote zamu instructions${named} into ${shown}.\n`;
    return `${shown} already has the current zamu instructions.\n`;
  });
}
