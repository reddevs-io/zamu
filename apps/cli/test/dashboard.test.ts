// pm dashboard against a fake server: a fixed Dashboard with a full In review group (cut after 10
// lines), no mentions, a stalled agent task and both kinds of deadline. No database: the fake fetch
// answers GET /api/v1/dashboard and records the scope it was asked for. The real route is covered
// in cli.test.ts.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Dashboard, parseCliOutput } from '@pm/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CliIo } from '../src/io';
import { main } from '../src/main';

const URL = 'http://pm.test';
const KEY = 'pm_live_fake_dashboard_key';
const NOW = '2026-10-23T12:00:00.000Z';

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const hoursAgo = (hours: number) => new Date(Date.parse(NOW) - hours * 3_600_000).toISOString();

const ana = { id: id(1), name: 'Ana Ruiz', kind: 'person' as const };
const tomas = { id: id(2), name: 'Tomás Berg', kind: 'person' as const };
const claude = { ...{ id: id(3), name: 'claude-dev', kind: 'agent' as const }, responsible: ana };
const codex = { ...{ id: id(4), name: 'codex-ci', kind: 'agent' as const }, responsible: tomas };
const pay = { key: 'PAY', name: 'Payments' };
const web = { key: 'WEB', name: 'Website' };

const task = (project: typeof pay, number: number, title: string, status = 'in_review' as const) => ({
  key: `${project.key}-${number}`,
  title,
  status,
  priority: 'medium' as const,
  project,
});

/** Twelve items of fourteen, newest wait first: PAY-101 has waited 3 hours, PAY-112 14 hours. */
const reviewItems = Array.from({ length: 12 }, (_, i) => ({
  task: task(pay, 101 + i, `Review item ${i + 1}`),
  assignee: i === 0 ? claude : { ...ana, responsible: null },
  since: hoursAgo(3 + i),
}));

function fixture(scope: 'mine' | 'everyone'): Dashboard {
  return {
    scope,
    generatedAt: NOW,
    groups: {
      review: { total: 14, items: reviewItems },
      mentions:
        scope === 'mine'
          ? { total: 0, items: [] }
          : {
              total: 1,
              items: [
                {
                  task: task(web, 3, 'Collapse the sidebar'),
                  comment: {
                    id: id(50),
                    excerpt: '@Ana Ruiz the sidebar collapses below `900px`.\nFine to ship?',
                    createdAt: hoursAgo(2),
                  },
                  author: claude,
                  onBehalfOf: ana,
                  mentioned: { ...tomas, responsible: null },
                },
              ],
            },
      stalled: {
        total: 1,
        items: [
          {
            task: { ...task(web, 1, 'Settings page'), status: 'in_progress' },
            assignee: claude,
            lastTouchedAt: hoursAgo(26),
            thresholdHours: 24,
          },
        ],
      },
      deadlines: {
        total: 2,
        items: [
          {
            kind: 'milestone',
            project: pay,
            milestone: { id: id(60), name: 'PCI audit', targetDate: '2026-10-12' },
            daysOverdue: 11,
            openTasks: 4,
            progress: { done: 7, total: 11 },
          },
          {
            kind: 'cycle',
            project: web,
            cycle: { number: 4, name: 'Settings polish', startsOn: '2026-10-12', endsOn: '2026-10-24' },
            daysLeft: 2,
            openTasks: 7,
            progress: { done: 12, total: 19 },
          },
        ],
      },
    },
    projects: [
      {
        ...pay,
        openCounts: { backlog: 5, todo: 6, in_progress: 4, in_review: 3 },
        openCount: 18,
        usesMilestones: true,
        usesCycles: true,
        lastActivityAt: hoursAgo(0.1),
        currentCycle: { number: 9, name: null, endsOn: '2026-10-28', daysLeft: 6, done: 5, total: 12 },
        nextMilestone: {
          id: id(60),
          name: 'PCI audit',
          targetDate: '2026-10-12',
          overdue: true,
          done: 7,
          total: 11,
          others: 1,
        },
      },
      {
        ...web,
        openCounts: { backlog: 20, todo: 0, in_progress: 5, in_review: 2 },
        openCount: 27,
        usesMilestones: false,
        usesCycles: true,
        lastActivityAt: hoursAgo(30),
        currentCycle: {
          number: 4,
          name: 'Settings polish',
          endsOn: '2026-10-24',
          daysLeft: 2,
          done: 12,
          total: 19,
        },
        nextMilestone: null,
      },
    ],
    agents: [
      {
        agent: claude,
        currentTask: { ...task(web, 1, 'Settings page'), status: 'in_progress' },
        inProgressCount: 2,
        stalled: true,
        lastActivityAt: hoursAgo(0.5),
      },
      { agent: codex, currentTask: null, inProgressCount: 0, stalled: false, lastActivityAt: null },
    ],
  };
}

let home: string;
let requests: URL[];

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'pm-cli-dashboard-'));
  requests = [];
  return () => rm(home, { recursive: true, force: true });
});

interface RunOptions {
  env?: Record<string, string | undefined>;
  tty?: boolean;
  columns?: number;
  body?: (scope: 'mine' | 'everyone') => unknown;
}

async function pm(args: string[], options: RunOptions = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    readStdin: async () => '',
    env: { XDG_CONFIG_HOME: join(home, 'xdg'), PM_URL: URL, PM_KEY: KEY, ...options.env },
    homeDir: home,
    cwd: home,
    isTTY: options.tty ?? false,
    ...(options.columns ? { columns: options.columns } : {}),
    fetch: async (request) => {
      const url = new globalThis.URL(request.url);
      requests.push(url);
      expect(request.method).toBe('GET');
      expect(request.headers.get('authorization')).toBe(`Bearer ${KEY}`);
      if (url.pathname !== '/api/v1/dashboard') {
        return Response.json(
          { type: 'about:blank', title: 'Not found', status: 404, code: 'NOT_FOUND' },
          { status: 404 },
        );
      }
      const scope = url.searchParams.get('scope') === 'everyone' ? 'everyone' : 'mine';
      return Response.json((options.body ?? fixture)(scope));
    },
  };
  const code = await main(args, io);
  return { code, stdout: out.join(''), stderr: err.join('') };
}

/** Text between a section heading and the next blank line. */
function sectionOf(stdout: string, heading: string): string[] {
  const lines = stdout.split('\n');
  const start = lines.findIndex((line) => line.startsWith(heading));
  expect(start, `section ${heading}`).toBeGreaterThan(-1);
  const end = lines.indexOf('', start);
  return lines.slice(start, end === -1 ? undefined : end);
}

describe('pm dashboard --json', () => {
  it('prints the pm.v1.dashboard envelope for Mine by default', async () => {
    const result = await pm(['dashboard', '--json']);
    expect(result.code, result.stderr).toBe(0);
    expect(requests.map((url) => url.searchParams.get('scope'))).toEqual(['mine']);
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    const output = parseCliOutput(JSON.parse(result.stdout), 'dashboard');
    expect(output.schema).toBe('pm.v1.dashboard');
    expect(output.data).toEqual(fixture('mine'));
  });

  it('asks for scope=everyone with --everyone', async () => {
    const result = await pm(['dashboard', '--everyone', '--json']);
    expect(result.code, result.stderr).toBe(0);
    expect(requests.map((url) => url.searchParams.get('scope'))).toEqual(['everyone']);
    const output = parseCliOutput(JSON.parse(result.stdout), 'dashboard');
    expect(output.data.scope).toBe('everyone');
    expect(output.data.groups.mentions.total).toBe(1);
  });

  it('exits 5 when the server answers outside the contract', async () => {
    const result = await pm(['dashboard', '--json'], { body: () => ({ scope: 'mine', groups: {} }) });
    expect(result.code).toBe(5);
    expect(parseCliOutput(JSON.parse(result.stdout), 'error').data.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('pm dashboard (human output)', () => {
  it('prints the four groups with totals, reasons and the "… N more" cut', async () => {
    const result = await pm(['dashboard']);
    expect(result.code, result.stderr).toBe(0);
    const out = result.stdout;
    expect(out.startsWith('Needs you · 17\n\n')).toBe(true);
    expect(out).not.toContain('\u001b[');

    const review = sectionOf(out, 'In review');
    expect(review[0]).toBe('In review · 14');
    // Ten items, then the rest of the total (14 - 10), not of the 12 items returned.
    expect(review).toHaveLength(12);
    expect(review[11]).toBe('  … 4 more');
    expect(review[1]).toMatch(/^ {2}PAY-101 {2}Review item 1 {2,}claude-dev for Ana Ruiz {2}in review 3h$/);
    expect(review[10]).toMatch(/^ {2}PAY-110 {2}Review item 10 {2}Ana Ruiz {17}in review 12h$/);
    expect(out).not.toContain('PAY-111');

    expect(sectionOf(out, 'Mentions')).toEqual(['Mentions · none']);

    expect(sectionOf(out, 'Stalled')).toEqual([
      'Stalled · 1',
      '  WEB-1  Settings page  claude-dev for Ana Ruiz  no update 26h',
    ]);

    expect(sectionOf(out, 'Deadlines')).toEqual([
      'Deadlines · 2',
      '  PAY  Milestone PCI audit        7/11 done   4 open  11 days overdue',
      '  WEB  Cycle 4 · Settings polish  12/19 done  7 open  ends tomorrow',
    ]);
  });

  it('prints the projects table and the agents', async () => {
    const result = await pm(['dashboard']);
    const out = result.stdout;
    expect(sectionOf(out, 'Projects')).toEqual([
      'Projects · 2',
      '  KEY  NAME      OPEN  DOING  REVIEW  CYCLE                            NEXT MILESTONE                   ACTIVE',
      '  PAY  Payments  18    4      3       Cycle 9 · 5/12 · 6d left         PCI audit · 7/11 · overdue · +1  6m ago',
      '  WEB  Website   27    5      2       Cycle 4 · 12/19 · ends tomorrow  not used                         30h ago',
    ]);
    expect(sectionOf(out, 'Agents')).toEqual([
      'Agents · 2',
      '  AGENT       FOR         ACTIVE   DOING  CURRENT TASK',
      '  claude-dev  Ana Ruiz    30m ago  2      Stalled · WEB-1 Settings page',
      '  codex-ci    Tomás Berg  never    0      Idle',
    ]);
    expect(out.endsWith('Idle\n')).toBe(true);
  });

  it('words cycle deadlines by days left: today, tomorrow, in 2 days; and one overdue day', async () => {
    const body = (scope: 'mine' | 'everyone') => {
      const data = fixture(scope);
      const [milestone, cycle] = data.groups.deadlines.items;
      if (milestone?.kind !== 'milestone' || cycle?.kind !== 'cycle') throw new Error('fixture changed');
      const items = [{ ...milestone, daysOverdue: 1 }, ...[1, 3].map((daysLeft) => ({ ...cycle, daysLeft }))];
      const projects = data.projects.map((p) =>
        p.currentCycle ? { ...p, currentCycle: { ...p.currentCycle, daysLeft: 3 } } : p,
      );
      return { ...data, groups: { ...data.groups, deadlines: { total: 3, items } }, projects };
    };
    const result = await pm(['dashboard'], { body });
    expect(result.code, result.stderr).toBe(0);
    expect(sectionOf(result.stdout, 'Deadlines').map((line) => line.replace(/ +/g, ' '))).toEqual([
      'Deadlines · 3',
      ' PAY Milestone PCI audit 7/11 done 4 open 1 day overdue',
      ' WEB Cycle 4 · Settings polish 12/19 done 7 open ends today',
      ' WEB Cycle 4 · Settings polish 12/19 done 7 open ends in 2 days',
    ]);
    // The projects table uses the same words inside the deadline window.
    expect(result.stdout).toContain('Cycle 9 · 5/12 · ends in 2 days');
  });

  it('shows who wrote and who is asked in Everyone', async () => {
    const result = await pm(['dashboard', '--everyone']);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout.startsWith('Needs someone · 18\n')).toBe(true);
    // Newlines in the excerpt collapse; inline code keeps its backticks.
    expect(sectionOf(result.stdout, 'Mentions')).toEqual([
      'Mentions · 1',
      '  WEB-3  claude-dev for Ana Ruiz → Tomás Berg  @Ana Ruiz the sidebar collapses below `900px`. Fine to ship?  2h ago',
    ]);
  });

  it('fits the terminal width by cutting titles, and colours only when allowed', async () => {
    const tty = await pm(['dashboard', '--everyone'], { tty: true, columns: 62 });
    expect(tty.code, tty.stderr).toBe(0);
    expect(tty.stdout).toContain('\u001b[');
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI escape sequences
    const plain = tty.stdout.replace(/\u001b\[[0-9;]*m/g, '');
    const review = sectionOf(plain, 'In review');
    for (const line of review) expect([...line].length, line).toBeLessThanOrEqual(62);
    // The title gives way; the reason at the end of the line stays.
    expect(review[1]).toMatch(/^ {2}PAY-101 {2}Review ite… {2}claude-dev for Ana Ruiz {2}in review 3h$/);
    // A cut column keeps at least 10 characters, even if the line then runs past the width.
    expect(sectionOf(plain, 'Mentions')[1]).toMatch(/→ Tomás Berg {2}@Ana Ruiz… {2}2h ago$/);

    const noColor = await pm(['dashboard'], { tty: true, columns: 60, env: { NO_COLOR: '1' } });
    expect(noColor.stdout).not.toContain('\u001b[');
  });
});
