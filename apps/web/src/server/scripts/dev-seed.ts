// Seeds local development data and prints fresh API keys.
//
//   pnpm exec tsx --env-file-if-exists=.env apps/web/src/server/scripts/dev-seed.ts      (repo root)
//   eval "$(pnpm -s exec tsx --env-file-if-exists=.env apps/web/src/server/scripts/dev-seed.ts)"
//
// stdout carries only `export PM_API_KEY=...` lines (claude-dev's key) and PM_ADMIN_API_KEY (the
// admin's), so `eval` sets them; the summary goes to stderr. Reads DATABASE_URL, BETTER_AUTH_SECRET,
// BETTER_AUTH_URL and PUBLIC_URL; SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD and SEED_WORKSPACE override
// the first-run admin and workspace. SEED_PLANNING=0 skips the M2 demo data; SEED_BACKLOG=1 adds the
// mirrored Backlog.md project BACK (needs APP_ENCRYPTION_KEY). Never run it against production.
import { createServerContext } from '../context';
import { SEED_DEFAULTS, seedDevData } from '../seed';

async function main() {
  const ctx = createServerContext(process.env);
  try {
    const result = await seedDevData(ctx, {
      adminEmail: process.env.SEED_ADMIN_EMAIL || SEED_DEFAULTS.adminEmail,
      adminPassword: process.env.SEED_ADMIN_PASSWORD || SEED_DEFAULTS.adminPassword,
      workspaceName: process.env.SEED_WORKSPACE || SEED_DEFAULTS.workspaceName,
      planning: process.env.SEED_PLANNING !== '0',
      backlog: process.env.SEED_BACKLOG === '1',
      dashboard: process.env.SEED_PLANNING !== '0',
    });
    const log = (line = '') => process.stderr.write(`${line}\n`);
    log(result.bootstrapped ? 'Set up the instance (first run).' : 'Instance already set up; added to it.');
    log(`Web app:   ${ctx.publicUrl}`);
    log(
      result.admin.password
        ? `Sign in:   ${result.admin.email} / ${result.admin.password}`
        : `Admin:     ${result.admin.name} <${result.admin.email}> (existing password)`,
    );
    log(`Agent:     ${result.agent.name}, acting for ${result.admin.name}`);
    if (result.member) log(`Member:    ${result.member.name} <${result.member.email}>`);
    log(
      result.createdProjects.length
        ? `Projects:  ${result.createdProjects.map((p) => `${p.key} (${p.tasks} tasks)`).join(', ')}`
        : 'Projects:  the seed projects already existed; left unchanged',
    );
    log('API keys (shown once), all projects, read and write:');
    process.stdout.write(`export PM_API_KEY=${result.agentKey}\n`);
    process.stdout.write(`export PM_ADMIN_API_KEY=${result.adminKey}\n`);
    log(`Try: curl -H "Authorization: Bearer $PM_API_KEY" ${ctx.publicUrl}/api/v1/projects`);
  } finally {
    await ctx.jobs.stop();
    await ctx.pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('dev-seed failed:', error);
  process.exitCode = 1;
});
