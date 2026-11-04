// Dashboard and Home stress run (PM-8, M5): query plans on a large throwaway workspace.
//
//   pnpm exec tsx packages/core/scripts/dashboard-stress.ts [--suite dashboard|home]
//     [--db-prefix pm_stress] [--runs 5] [--scope everyone|mine] [--verbose] [--keep]
//     [--try-index "create index ..."]...
//
// --suite home (M5): applies every migration, seeds the same data plus the M5 fields (due dates,
// labels, blockers, subtasks), then EXPLAINs every query getHome issues for the owner on the Mine,
// Everyone and Agents tabs, with a label filter on Mine, and getHomeCounts. Phases: "current", then
// one per --try-index. The rest of this note describes the default dashboard suite.
//
// Creates a database on the server in STRESS_DATABASE_URL (else TEST_DATABASE_URL, else the local
// dev Postgres), applies every migration before dashboard_indexes, seeds 100 projects, 100k tasks,
// 300k activity rows, 60k comments and their mentions with bulk SQL, then runs the queries
// getDashboard issues for the Everyone scope (--scope mine: the owner's Mine scope). The SQL and parameters are captured from the real
// core function through a Drizzle logger, so the plans are the production ones. Each query runs
// under EXPLAIN (ANALYZE, BUFFERS) once to warm up, then --runs times (median reported, JIT
// included and shown) before the migration, after it,
// and once more per --try-index candidate (an index tried without adding it to the schema).
// Statistics are gathered once, after the seed, so every phase plans with the same estimates and
// a plan change comes from the indexes alone. The database is dropped at the end, also on failure,
// unless --keep is given (then its URL is printed for manual EXPLAINs).
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createDb, type DbHandle, migrationsFolder, relations } from '@pm/db';
import { createDatabase, dropDatabase, withDatabase } from '@pm/db/admin';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import type { Actor } from '../src/authz';
import { getDashboard } from '../src/dashboard';
import { getHome, getHomeCounts } from '../src/home';

type Pool = DbHandle['pool'];

const NEW_MIGRATION_SUFFIX = '_dashboard_indexes';

const PROJECTS = 100;
const TASKS_PER_PROJECT = 1000;
const ACTIVITY_PER_TASK = 3;
const COMMENTS = 60_000;
/** Share of comments that mention someone; each mentions one user. */
const MENTION_SHARE = 0.25;
const PEOPLE = 20;
const AGENTS = 10;

const { values: options } = parseArgs({
  options: {
    suite: { type: 'string', default: 'dashboard' },
    'db-prefix': { type: 'string', default: 'pm_stress' },
    runs: { type: 'string', default: '5' },
    scope: { type: 'string', default: 'everyone' },
    verbose: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
    'try-index': { type: 'string', multiple: true, default: [] },
  },
});
const runs = Math.max(1, Number(options.runs) || 5);
if (options.scope !== 'everyone' && options.scope !== 'mine') throw new Error('--scope is everyone or mine');
const scope = options.scope;
if (options.suite !== 'dashboard' && options.suite !== 'home')
  throw new Error('--suite is dashboard or home');
const suite = options.suite;
const serverUrl =
  process.env.STRESS_DATABASE_URL ||
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/postgres';
const databaseName = `${options['db-prefix']}_${Date.now().toString(36)}`;
const url = withDatabase(serverUrl, databaseName);

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

/** Bulk inserts in one session, seeded random() so runs are comparable. Times are relative to now(). */
const SEED_SQL = [
  `select setseed(0.42)`,
  `insert into "user" (name, email, kind)
    select 'Person ' || g, 'person-' || lpad(g::text, 2, '0') || '@stress.invalid', 'person'
    from generate_series(1, ${PEOPLE}) g`,
  `insert into "user" (name, email, kind, responsible_user_id)
    select 'agent-' || lpad(g::text, 2, '0'), 'agent-' || lpad(g::text, 2, '0') || '@agents.invalid', 'agent',
      (select id from "user" where email = 'person-' || lpad(((g - 1) % ${PEOPLE} + 1)::text, 2, '0') || '@stress.invalid')
    from generate_series(1, ${AGENTS}) g`,
  `insert into organization (name, slug) values ('Stress', 'stress')`,
  `insert into member (organization_id, user_id, role)
    select o.id, u.id, case when u.email = 'person-01@stress.invalid' then 'owner' else 'member' end
    from organization o cross join "user" u`,
  `create temp table people as select array_agg(id order by email) as ids from "user" where kind = 'person'`,
  `create temp table agents as select array_agg(id order by email) as ids from "user" where kind = 'agent'`,
  `insert into project (workspace_id, key, name, next_task_number, next_cycle_number, created_at, updated_at)
    select o.id, 'P' || lpad(g::text, 3, '0'), 'Project ' || g, ${TASKS_PER_PROJECT + 1}, 7,
      now() - interval '200 days', now() - interval '200 days'
    from organization o, generate_series(1, ${PROJECTS}) g`,
  `create temp table proj as select id, row_number() over (order by key)::int as rn from project`,
  // Ten milestones per project: 1-3 completed, 4-5 active, 6-10 planned; target dates two weeks
  // apart around today (4 and some of 5 overdue), the last one undated.
  `insert into milestone (workspace_id, project_id, name, target_date, status, completed_at, created_by_id)
    select o.id, p.id, 'Milestone ' || k,
      case when k = 10 then null else current_date + (k - 5) * 14 + (p.rn % 10) - 5 end,
      (case when k <= 3 then 'completed' when k <= 5 then 'active' else 'planned' end)::milestone_status,
      case when k <= 3 then now() - interval '30 days' end, people.ids[1]
    from organization o, proj p, people, generate_series(1, 10) k`,
  `create temp table ms as
    select m.project_id, substring(m.name from 11)::int as k, m.id from milestone m`,
  // Six two-week cycles per project: five completed, the sixth current (ending in 0 to 13 days).
  `insert into cycle (workspace_id, project_id, number, starts_on, ends_on, completed_at)
    select o.id, p.id, k,
      current_date - (p.rn % 14) + (k - 6) * 14, current_date - (p.rn % 14) + (k - 6) * 14 + 13,
      case when k < 6 then (current_date - (p.rn % 14) + (k - 6) * 14 + 14)::timestamptz end
    from organization o, proj p, generate_series(1, 6) k`,
  `create temp table cyc as select project_id, number as k, id from cycle`,
  `create temp table t_seed as
    select g, p.id as project_id, (g % ${TASKS_PER_PROJECT}) + 1 as number,
      random() as r_status, random() as r_assignee, random() as r_ms, random() as r_cycle,
      random() as r_time, random() as r_age, floor(random() * 1000)::int as pick
    from generate_series(0, ${PROJECTS * TASKS_PER_PROJECT - 1}) g
    join proj p on p.rn = g / ${TASKS_PER_PROJECT} + 1`,
  `alter table t_seed add column status task_status`,
  `update t_seed set status = (case
      when r_status < 0.45 then 'done' when r_status < 0.50 then 'canceled'
      when r_status < 0.65 then 'backlog' when r_status < 0.80 then 'todo'
      when r_status < 0.92 then 'in_progress' else 'in_review' end)::task_status`,
  // Open tasks were touched in the last 30 days (in progress: 10), closed ones in the last 180.
  `insert into task (project_id, number, title, status, priority, assignee_id, created_by_id,
      milestone_id, cycle_id, cycle_added_at, rank, created_at, updated_at)
    select s.project_id, s.number, 'Task ' || s.number, s.status, s.pick % 5,
      case when s.r_assignee < 0.3 then agents.ids[1 + s.pick % ${AGENTS}]
        when s.r_assignee < 0.8 then people.ids[1 + s.pick % ${PEOPLE}] end,
      people.ids[1 + (s.pick / 7) % ${PEOPLE}],
      ms.id, cyc.id, case when cyc.id is not null then upd.at - interval '1 day' * s.r_age * 30 end,
      s.number, upd.at - interval '1 day' * s.r_age * 30, upd.at
    from t_seed s
    cross join people cross join agents
    cross join lateral (select now() - interval '1 day' * s.r_time * case
      when s.status = 'in_progress' then 10 when s.status in ('done', 'canceled') then 180 else 30 end as at) upd
    left join ms on ms.project_id = s.project_id and s.r_ms < 0.4 and ms.k = 1 + s.pick % 10
    left join cyc on cyc.project_id = s.project_id and s.r_cycle < 0.4
      and cyc.k = case when s.status in ('done', 'canceled') then 1 + s.pick % 5 else 6 end`,
  // Three rows per task between its creation and last update: 40% agents (with their responsible
  // person), 57% people, 3% the system. The last row of an in-review task is the status change.
  `insert into activity (workspace_id, project_id, task_id, actor_id, on_behalf_of_id, type, changes, created_at)
    select o.id, x.project_id, x.id, au.id, au.responsible_user_id,
      case when au.id is null then 'cycle.ended' when x.n = 1 then 'task.created' else 'task.updated' end,
      case when x.n = ${ACTIVITY_PER_TASK} and x.status = 'in_review'
        then '[{"field":"status","from":"in_progress","to":"in_review"}]'::jsonb
        else '[{"field":"title","from":"a","to":"b"}]'::jsonb end,
      x.created_at + (x.updated_at - x.created_at) * (x.n - 1) / ${ACTIVITY_PER_TASK - 1}.0
    from (
      select t.*, n, random() as r, floor(random() * 1000)::int as pick
      from task t, generate_series(1, ${ACTIVITY_PER_TASK}) n) x
    cross join organization o cross join people cross join agents
    left join "user" au on au.id = case
      when x.r < 0.40 then agents.ids[1 + x.pick % ${AGENTS}]
      when x.r < 0.97 then people.ids[1 + x.pick % ${PEOPLE}] end`,
  `create temp table trow as
    select id, project_id, created_at, updated_at, row_number() over (order by id)::int as rn from task`,
  `create temp table c_seed as
    select g, 1 + floor(random() * ${PROJECTS * TASKS_PER_PROJECT})::int as rn, random() as r_author,
      random() as r_mention, random() as r_time, floor(random() * 1000)::int as pick
    from generate_series(1, ${COMMENTS}) g`,
  // 35% of comments by agents; a quarter mention someone other than the author; 2% deleted.
  `insert into comment (workspace_id, project_id, task_id, author_id, on_behalf_of_id, body, created_at, deleted_at)
    select o.id, t.project_id, t.id, au.id, au.responsible_user_id,
      case when s.r_time < 0.02 then null
        when s.r_mention < ${MENTION_SHARE} then '[@' || mu.name || '](mention:' || mu.id || ') can you take a look at this?'
        else 'Looked into this, notes below.' end,
      least(now(), t.created_at + (t.updated_at - t.created_at + interval '2 days') * s.r_time),
      case when s.r_time < 0.02 then now() end
    from c_seed s
    join trow t on t.rn = s.rn
    cross join organization o cross join people cross join agents
    join "user" au on au.id = case when s.r_author < 0.35 then agents.ids[1 + s.pick % ${AGENTS}]
      else people.ids[1 + s.pick % ${PEOPLE}] end
    join "user" mu on mu.id = case when (s.pick / 3) % 3 = 0 then agents.ids[1 + (s.pick / 9) % ${AGENTS}]
      else people.ids[1 + (s.pick / 9) % ${PEOPLE}] end`,
  `insert into comment_mention (comment_id, user_id)
    select c.id, substring(c.body from 'mention:([0-9a-f-]{36})')::uuid
    from comment c where c.body like '%](mention:%'
    and substring(c.body from 'mention:([0-9a-f-]{36})')::uuid <> c.author_id`,
];

/**
 * M5 fields on top of SEED_SQL (needs the M5 migration): due dates on 30% of open tasks from 10
 * days ago to 20 days ahead, eight labels per project (names shared across projects, mixed case)
 * on 40% of tasks, one blocker on 5% of tasks and a parent on 10% (one level: parents are the
 * first 100 tasks of a project, children the rest), all inside the task's project.
 */
const HOME_SEED_SQL = [
  `select setseed(0.43)`,
  `update task set due_date = current_date + floor(random() * 30)::int - 10
    where status in ('backlog', 'todo', 'in_progress', 'in_review') and random() < 0.3`,
  `insert into label (workspace_id, project_id, name, color)
    select p.workspace_id, p.id, case when k % 2 = 0 then 'Label ' || k else 'label ' || k end, 1 + k % 9
    from project p, generate_series(1, 8) k`,
  `create temp table lbl as
    select l.project_id, row_number() over (partition by l.project_id order by l.name)::int as k, l.id
    from label l`,
  `insert into task_label (task_id, label_id)
    select distinct x.id, lbl.id
    from (select id, project_id, random() as r, floor(random() * 8)::int as a, floor(random() * 8)::int as b
      from task) x
    join lbl on lbl.project_id = x.project_id and (lbl.k = 1 + x.a or (x.r < 0.15 and lbl.k = 1 + x.b))
    where x.r < 0.4`,
  `insert into task_dependency (task_id, blocker_id)
    select t.id, b.id
    from task t
    join task b on b.project_id = t.project_id
      and b.number = 1 + (t.number + 1 + floor(random() * 50)::int) % ${TASKS_PER_PROJECT}
    where random() < 0.05 and b.id <> t.id
    on conflict do nothing`,
  `update task t set parent_id = parent.id
    from task parent
    where parent.project_id = t.project_id and t.number > 100 and random() < 0.1
      and parent.number = 1 + t.number % 100`,
];

async function seed(pool: Pool, home = false) {
  const client = await pool.connect();
  try {
    for (const statement of SEED_SQL) await client.query(statement);
    if (home) for (const statement of HOME_SEED_SQL) await client.query(statement);
  } finally {
    client.release();
  }
  await pool.query('vacuum analyze');
}

async function counts(pool: Pool) {
  const { rows } = await pool.query<Record<string, string>>(`select
    (select count(*) from project) as projects, (select count(*) from task) as tasks,
    (select count(*) from activity) as activity, (select count(*) from comment) as comments,
    (select count(*) from comment_mention) as mentions, (select count(*) from milestone) as milestones,
    (select count(*) from cycle) as cycles, (select count(*) from "user") as users${
      suite === 'home'
        ? `, (select count(*) from task where due_date is not null) as due,
    (select count(*) from task_label) as task_labels, (select count(*) from task_dependency) as dependencies,
    (select count(*) from task where parent_id is not null) as subtasks`
        : ''
    }`);
  return rows[0] ?? {};
}

// ---------------------------------------------------------------------------
// Queries and plans
// ---------------------------------------------------------------------------

interface Captured {
  name: string;
  text: string;
  params: unknown[];
}

/** Names a query getDashboard issued by the source it came from. */
function queryName(text: string): string {
  if (text.includes('with agent as')) return 'agentRows';
  if (text.includes('comment_mention cm')) return 'mentionsSource';
  if (text.includes(`'milestone' as kind`)) return 'deadlinesSource';
  if (text.includes('last_task_update')) return 'projectRows';
  if (text.includes(`t.status = 'in_review'`)) return 'reviewSource';
  if (text.includes(`t.status = 'in_progress'`)) return 'stalledSource';
  return 'readableProjects';
}

/** The queries of one getDashboard call in --scope, as sent to Postgres. */
async function captureQueries(pool: Pool, actor: Actor, now: Date): Promise<Captured[]> {
  const captured: Captured[] = [];
  const db = drizzle({
    client: pool,
    relations,
    logger: { logQuery: (text, params) => captured.push({ name: queryName(text), text, params }) },
  });
  await getDashboard({ db, now: () => now }, actor, { scope });
  return captured.filter((query) => query.name !== 'readableProjects');
}

/** Names a query of getHome or getHomeCounts by what it reads. */
function homeQueryName(text: string): string {
  const tab = text.includes(`then 'creator'`)
    ? 'mine'
    : text.includes('with bl as')
      ? 'everyone'
      : text.includes('with agents as')
        ? 'waiting'
        : null;
  if (tab && text.includes('row_number() over (partition by c.g')) return `${tab} groups`;
  if (tab && text.includes('group by c.g')) return `${tab} totals`;
  if (text.includes('"kindRank"')) return 'deadlines';
  if (text.includes('as assigned')) return 'agent cards';
  if (text.includes('group by x.actor_id')) return 'agent changes today';
  if (text.includes(`'activity' as kind`)) return 'agent recent actions';
  if (text.includes('from task_label tl')) return 'row labels';
  if (text.includes('d.blocker_id as "taskId"')) return 'row blocks';
  if (text.includes('from task_dependency d')) return 'row blockers';
  if (text.includes('s.parent_id')) return 'row subtasks';
  if (text.includes('from label l')) return 'label filter ids';
  if (text.includes('from milestone where')) return 'row milestones';
  if (text.includes('from cycle where')) return 'row cycles';
  if (text.includes('count(*) as n from member')) return 'agent count';
  if (text.includes('"backlog_source"')) return 'row mirrors';
  if (text.includes('"activity"') || text.includes('"milestone"') || text.includes('"cycle"')) {
    return 'activity mapper';
  }
  if (text.includes('from "user"')) return 'users';
  return 'readableProjects';
}

/** The Home calls the home suite measures, by name. */
const HOME_CALLS: [
  string,
  (db: Parameters<typeof getHome>[0]['db'], actor: Actor, now: Date) => Promise<unknown>,
][] = [
  ['mine', (db, actor, now) => getHome({ db, now: () => now }, actor, { tab: 'mine' })],
  ['everyone', (db, actor, now) => getHome({ db, now: () => now }, actor, { tab: 'everyone' })],
  ['agents', (db, actor, now) => getHome({ db, now: () => now }, actor, { tab: 'agents' })],
  [
    'mine label',
    (db, actor, now) =>
      getHome({ db, now: () => now }, actor, { tab: 'mine', label: ['LABEL 2', 'label 3'] }),
  ],
  ['counts', (db, actor, now) => getHomeCounts({ db, now: () => now }, actor)],
];

/** The queries of every Home call, named "<call>: <query>", without duplicates of the same text. */
async function captureHomeQueries(pool: Pool, actor: Actor, now: Date): Promise<Captured[]> {
  const captured: Captured[] = [];
  for (const [call, run] of HOME_CALLS) {
    const db = drizzle({
      client: pool,
      relations,
      logger: {
        logQuery: (text, params) => captured.push({ name: `${call}: ${homeQueryName(text)}`, text, params }),
      },
    });
    await run(db, actor, now);
  }
  const seen = new Set<string>();
  return captured.filter((query) => {
    if (query.name.endsWith('readableProjects') || query.name.endsWith('users')) return false;
    const id = `${query.name}\n${query.text}\n${JSON.stringify(query.params)}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Median wall time of getHome on the three tabs in a row, after one warm-up round. */
async function homeTime(pool: Pool, actor: Actor, now: Date): Promise<number> {
  const db = drizzle({ client: pool, relations });
  const times: number[] = [];
  for (let run = 0; run <= runs; run++) {
    const start = performance.now();
    for (const tab of ['mine', 'everyone', 'agents'] as const) {
      await getHome({ db, now: () => now }, actor, { tab });
    }
    if (run > 0) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? 0;
}

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Actual Rows'?: number;
  'Actual Loops'?: number;
  'Rows Removed by Filter'?: number;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  Plans?: PlanNode[];
}

interface Measure {
  ms: number;
  jitMs: number;
  buffers: number;
  indexes: string[];
  seqScans: string[];
  text: string;
}

function walk(node: PlanNode, visit: (node: PlanNode) => void) {
  visit(node);
  for (const child of node.Plans ?? []) walk(child, visit);
}

async function explain(pool: Pool, query: Captured): Promise<Measure> {
  const times: number[] = [];
  let plan: PlanNode | undefined;
  let jitMs = 0;
  // Run 0 warms the cache and is not counted.
  for (let run = 0; run <= runs; run++) {
    const { rows } = await pool.query<{
      'QUERY PLAN': [{ Plan: PlanNode; 'Execution Time': number; JIT?: { Timing?: { Total?: number } } }];
    }>(`explain (analyze, buffers, format json) ${query.text}`, query.params);
    const [result] = rows[0]?.['QUERY PLAN'] ?? [];
    if (!result) throw new Error(`no plan for ${query.name}`);
    if (run === 0) continue;
    times.push(result['Execution Time']);
    plan = result.Plan;
    jitMs = result.JIT?.Timing?.Total ?? 0;
  }
  if (!plan) throw new Error(`no plan for ${query.name}`);
  const indexes = new Set<string>();
  const seqScans: string[] = [];
  walk(plan, (node) => {
    if (node['Index Name']) indexes.add(node['Index Name']);
    if (node['Node Type'] === 'Seq Scan') {
      const rows = (node['Actual Rows'] ?? 0) * (node['Actual Loops'] ?? 1);
      const removed = (node['Rows Removed by Filter'] ?? 0) * (node['Actual Loops'] ?? 1);
      seqScans.push(
        `${node['Relation Name']} (${rows} kept, ${removed} removed, ${node['Actual Loops']} loops)`,
      );
    }
  });
  const { rows: textRows } = await pool.query<{ 'QUERY PLAN': string }>(
    `explain (analyze, buffers) ${query.text}`,
    query.params,
  );
  times.sort((a, b) => a - b);
  return {
    ms: times[Math.floor(times.length / 2)] ?? 0,
    jitMs,
    buffers: (plan['Shared Hit Blocks'] ?? 0) + (plan['Shared Read Blocks'] ?? 0),
    indexes: [...indexes].sort(),
    seqScans,
    text: textRows.map((row) => row['QUERY PLAN']).join('\n'),
  };
}

async function measureAll(pool: Pool, queries: Captured[]) {
  const result = new Map<string, Measure>();
  for (const query of queries) {
    let name = query.name;
    for (let n = 2; result.has(name); n++) name = `${query.name} #${n}`;
    result.set(name, await explain(pool, query));
  }
  return result;
}

/** Median wall time of a whole getDashboard call (six queries in parallel), after one warm-up call. */
async function dashboardTime(pool: Pool, actor: Actor, now: Date): Promise<number> {
  const db = drizzle({ client: pool, relations });
  const times: number[] = [];
  for (let run = 0; run <= runs; run++) {
    const start = performance.now();
    await getDashboard({ db, now: () => now }, actor, { scope });
    if (run > 0) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? 0;
}

const ms = (value: number) => `${value.toFixed(1)} ms`;

/** What the wall time of a phase measures. */
const wallLabel = () => (suite === 'home' ? 'getHome mine + everyone + agents' : `getDashboard ${scope}`);

function printPhase(title: string, measures: Map<string, Measure>, total: number) {
  console.log(`\n## ${title} (${wallLabel()}: ${ms(total)})`);
  for (const [name, measure] of measures) {
    const jit = measure.jitMs > 0 ? ` (JIT ${ms(measure.jitMs)})` : '';
    console.log(`\n${name}: ${ms(measure.ms)}${jit}, ${measure.buffers} buffers`);
    console.log(`  indexes: ${measure.indexes.join(', ') || 'none'}`);
    console.log(`  seq scans: ${measure.seqScans.join('; ') || 'none'}`);
    if (options.verbose) console.log(measure.text.replace(/^/gm, '    '));
  }
}

function printSummary(phases: { title: string; measures: Map<string, Measure>; total: number }[]) {
  const [before, ...later] = phases;
  if (!before) return;
  const what = suite === 'home' ? 'Home' : `${scope} scope`;
  console.log(`\n## Summary: ${what}, median of ${runs} runs, EXPLAIN ANALYZE execution time\n`);
  console.log(
    `| query | ${phases.map((phase) => phase.title).join(' | ')} | indexes the before plan did not use |`,
  );
  console.log(`|---|${phases.map(() => '---|').join('')}---|`);
  for (const [name, first] of before.measures) {
    const cells = phases.map((phase) => {
      const measure = phase.measures.get(name);
      return measure ? `${ms(measure.ms)} (${measure.buffers} buf)` : '-';
    });
    const added = later.map((phase) => {
      const used = phase.measures.get(name)?.indexes.filter((index) => !first.indexes.includes(index)) ?? [];
      return `${phase.title}: ${used.join(', ') || 'none'}`;
    });
    console.log(`| ${name} | ${cells.join(' | ')} | ${added.join('; ')} |`);
  }
  console.log(`| ${wallLabel()} (wall) | ${phases.map((phase) => ms(phase.total)).join(' | ')} | |`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function migrateFolder(folder: string) {
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await drizzleMigrate(db, { migrationsFolder: folder });
  } finally {
    await pool.end();
  }
}

async function ownerActor(pool: Pool): Promise<Actor> {
  const { rows } = await pool.query<{ user_id: string; organization_id: string }>(
    `select m.user_id, m.organization_id from member m where m.role = 'owner'`,
  );
  const owner = rows[0];
  if (!owner) throw new Error('seed has no owner');
  return {
    userId: owner.user_id,
    kind: 'person',
    workspaceId: owner.organization_id,
    role: 'owner',
    onBehalfOfId: null,
  };
}

/** --suite home: every migration, the M5 seed, the Home queries now and with each --try-index. */
async function mainHome() {
  console.log(`database ${databaseName}; migrating to the latest schema`);
  await createDatabase(url);
  const { pool } = createDb(url, { max: 8 });
  try {
    await migrateFolder(migrationsFolder);
    const start = performance.now();
    await seed(pool, true);
    console.log(`seeded in ${ms(performance.now() - start)}:`, await counts(pool));
    const actor = await ownerActor(pool);
    const now = new Date();
    const queries = await captureHomeQueries(pool, actor, now);

    const phases: { title: string; measures: Map<string, Measure>; total: number }[] = [];
    const runPhase = async (title: string) => {
      const measures = await measureAll(pool, queries);
      const total = await homeTime(pool, actor, now);
      phases.push({ title, measures, total });
      printPhase(title, measures, total);
    };
    await runPhase('current');
    for (const [i, statement] of (options['try-index'] ?? []).entries()) {
      await pool.query(statement);
      await pool.query('analyze');
      await runPhase(`current + try ${i + 1}`);
      console.log(`  try ${i + 1}: ${statement}`);
    }
    printSummary(phases);
  } finally {
    await pool.end();
    if (options.keep) console.log(`\nkept ${url}`);
    else {
      await dropDatabase(url);
      console.log(`\ndropped ${databaseName}`);
    }
  }
}

async function main() {
  if (suite === 'home') return mainHome();
  const migrations = readdirSync(migrationsFolder).sort();
  const target = migrations.find((name) => name.endsWith(NEW_MIGRATION_SUFFIX));
  if (!target) throw new Error(`no migration ending in ${NEW_MIGRATION_SUFFIX} in ${migrationsFolder}`);
  const previous = migrations.filter((name) => name < target);

  const folder = mkdtempSync(join(tmpdir(), 'pm-stress-migrations-'));
  for (const name of previous) cpSync(join(migrationsFolder, name), join(folder, name), { recursive: true });

  console.log(`database ${databaseName}; migrating to ${previous.at(-1)}`);
  await createDatabase(url);
  const { pool } = createDb(url, { max: 8 });
  try {
    await migrateFolder(folder);
    let start = performance.now();
    await seed(pool);
    console.log(`seeded in ${ms(performance.now() - start)}:`, await counts(pool));

    const actor = await ownerActor(pool);
    const now = new Date();
    const queries = await captureQueries(pool, actor, now);

    const phases: { title: string; measures: Map<string, Measure>; total: number }[] = [];
    const runPhase = async (title: string) => {
      const measures = await measureAll(pool, queries);
      const total = await dashboardTime(pool, actor, now);
      phases.push({ title, measures, total });
      printPhase(title, measures, total);
    };

    await runPhase('before');
    start = performance.now();
    await migrateFolder(migrationsFolder);
    console.log(`\n${target} applied in ${ms(performance.now() - start)}`);
    await runPhase('after');

    for (const [i, statement] of (options['try-index'] ?? []).entries()) {
      await pool.query(statement);
      await runPhase(`after + try ${i + 1}`);
      console.log(`  try ${i + 1}: ${statement}`);
    }
    printSummary(phases);
  } finally {
    await pool.end();
    rmSync(folder, { recursive: true, force: true });
    if (options.keep) console.log(`\nkept ${url}`);
    else {
      await dropDatabase(url);
      console.log(`\ndropped ${databaseName}`);
    }
  }
}

await main();
