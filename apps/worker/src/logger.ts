// Structured logs: one JSON object per line on stdout, so container log collectors can parse them.
//
// Every line has `time` (ISO UTC), `level`, `msg` and the logger's bound fields, then the event's own fields.
// Errors anywhere in the fields are serialized with name, message, code, stack and cause.

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  fatal(msg: string, fields?: LogFields): void;
  /** A logger that adds `fields` to every line. */
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  /** Lowest level written. Defaults to info. */
  level?: LogLevel;
  /** Fields added to every line. */
  base?: LogFields;
  /** Receives each line without the trailing newline. Defaults to stdout. */
  write?: (line: string) => void;
  /** Clock for `time`. Defaults to the system clock. */
  now?: () => Date;
}

export function isLogLevel(value: string | undefined): value is LogLevel {
  return value !== undefined && (LOG_LEVELS as readonly string[]).includes(value);
}

const writeStdout = (line: string) => {
  // Synchronous for files and pipes on Linux, so lines written right before process.exit are kept.
  process.stdout.write(`${line}\n`);
};

export function createLogger(options: LoggerOptions = {}): Logger {
  const { level = 'info', base = {}, write = writeStdout, now = () => new Date() } = options;
  const threshold = LOG_LEVELS.indexOf(level);

  const log = (lineLevel: LogLevel, msg: string, fields: LogFields = {}) => {
    if (LOG_LEVELS.indexOf(lineLevel) < threshold) return;
    write(serialize({ time: now().toISOString(), level: lineLevel, msg, ...base, ...fields }));
  };

  return {
    debug: (msg, fields) => log('debug', msg, fields),
    info: (msg, fields) => log('info', msg, fields),
    warn: (msg, fields) => log('warn', msg, fields),
    error: (msg, fields) => log('error', msg, fields),
    fatal: (msg, fields) => log('fatal', msg, fields),
    child: (fields) => createLogger({ level, base: { ...base, ...fields }, write, now }),
  };
}

/** A plain object for an Error, keeping the fields that help diagnose it. */
export function serializeError(error: unknown, depth = 0): unknown {
  if (!(error instanceof Error)) return error;
  const result: Record<string, unknown> = { name: error.name, message: error.message };
  const code = (error as { code?: unknown }).code;
  if (code !== undefined) result.code = code;
  if (error.stack) result.stack = error.stack;
  if (error.cause !== undefined && depth < 3) result.cause = serializeError(error.cause, depth + 1);
  return result;
}

function serialize(entry: LogFields): string {
  const replacer = (_key: string, value: unknown) => {
    if (value instanceof Error) return serializeError(value);
    if (typeof value === 'bigint') return value.toString();
    return value;
  };
  try {
    return JSON.stringify(entry, replacer);
  } catch (error) {
    // Circular fields: keep the line and say why its fields are missing.
    const { time, level, msg } = entry;
    return JSON.stringify({ time, level, msg, logError: serializeError(error) }, replacer);
  }
}
