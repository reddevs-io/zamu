// Backlog.md folder parser. Pure: callers pass file contents and get typed records or error values.
// See .agent/plans/m3-backlog-md-mirror.html, workstream M3-02, for the format reference.
export {
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
  DEFAULT_TASK_PREFIX,
  defaultConfig,
  parseConfig,
  parseRootConfig,
} from './config';
export { parseBacklogDate, parseDueDate } from './dates';
export { type FolderFile, type ParsedFile, type ParsedFolder, parseBacklogFolder } from './folder';
export { canonicalTaskRef, type MilestoneId, parseBacklogId, parseMilestoneId } from './ids';
export {
  legacyConfigMilestones,
  type MilestoneCandidate,
  matchMilestone,
  parseMilestone,
} from './milestone';
export { type ClassifyOptions, classifyPath } from './paths';
export { renderDescription } from './render';
export { parseSections } from './sections';
export { parseTask } from './task';
export type * from './types';
