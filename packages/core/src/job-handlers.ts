// Handlers for the jobs in ./jobs. The worker looks a handler up by job name, parses the payload
// with parseJobPayload and calls it; the business logic stays here in core.
import type { DbContext } from './context';
import { type ClockContext, endDueCycles } from './cycles';
import { expireInvitations } from './invitations';
import { CYCLES_END_DUE, INVITATIONS_EXPIRE, type JobName, type JobPayload, parseJobPayload } from './jobs';

/** What handlers get from the worker: the database and the clock (APP_TIME_ZONE as `timeZone`). */
export type JobContext = DbContext & ClockContext;

export type JobHandler<N extends JobName> = (ctx: JobContext, payload: JobPayload<N>) => Promise<unknown>;

export const jobHandlers: { [N in JobName]: JobHandler<N> } = {
  [INVITATIONS_EXPIRE]: (ctx, payload) =>
    expireInvitations(ctx, payload.now ? { now: new Date(payload.now) } : {}),
  [CYCLES_END_DUE]: (ctx, payload) => {
    const now = payload.now ? new Date(payload.now) : undefined;
    return endDueCycles(now ? { ...ctx, now: () => now } : ctx);
  },
};

/** Parses `data` for `name` and runs its handler. Throws on an invalid payload, which fails the job. */
export async function runJob<N extends JobName>(ctx: JobContext, name: N, data: unknown): Promise<unknown> {
  const handler = jobHandlers[name] as JobHandler<N>;
  return handler(ctx, parseJobPayload(name, data));
}
