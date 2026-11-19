// Everything the CLI touches outside itself, so tests can run commands in-process: output streams,
// stdin, environment, terminal facts and the fetch used to reach the server.
import { homedir } from 'node:os';

export type FetchLike = (request: Request) => Promise<Response>;

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Reads all of stdin (for `--description -` and `--key -`). */
  readStdin: () => Promise<string>;
  env: Record<string, string | undefined>;
  /** Home directory, used when XDG_CONFIG_HOME is not set. */
  homeDir: string;
  /** Working directory: where zamu looks for .zamu.json, the git remote and AGENTS.md. */
  cwd: string;
  /** stdout is a terminal: colour and column truncation are allowed. */
  isTTY: boolean;
  /** Terminal width when stdout is a terminal. */
  columns?: number;
  /** Replaces the global fetch (tests pass the in-process API handler). */
  fetch?: FetchLike;
  /** Waits between polls (zamu backlog refresh --wait). Default: a timer. Tests pass a fake. */
  sleep?: (ms: number) => Promise<void>;
  /** Current time in milliseconds. Default: Date.now. */
  now?: () => number;
}

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export function processIo(): CliIo {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    readStdin: () => readAll(process.stdin),
    env: process.env,
    homeDir: homedir(),
    cwd: process.cwd(),
    isTTY: process.stdout.isTTY === true,
    ...(process.stdout.isTTY && process.stdout.columns ? { columns: process.stdout.columns } : {}),
  };
}

/**
 * Colour only on a terminal. NO_COLOR (any non-empty value) turns it off, FORCE_COLOR=0 too;
 * FORCE_COLOR with another value turns it on even when piped.
 */
export function useColor(io: CliIo): boolean {
  if (io.env.NO_COLOR) return false;
  const force = io.env.FORCE_COLOR;
  if (force !== undefined && force !== '') return force !== '0' && force !== 'false';
  return io.isTTY && io.env.TERM !== 'dumb';
}
