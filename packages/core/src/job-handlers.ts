// Handlers for the jobs in ./jobs. The worker looks a handler up by job name, parses the payload
// with parseJobPayload and calls it; the business logic stays here in core.
import type { DbContext } from './context';
import { expireInvitations } from './invitations';
import { INVITATIONS_EXPIRE, type JobName, type JobPayload, parseJobPayload } from './jobs';

export type JobHandler<N extends JobName> = (ctx: DbContext, payload: JobPayload<N>) => Promise<unknown>;

export const jobHandlers: { [N in JobName]: JobHandler<N> } = {
  [INVITATIONS_EXPIRE]: (ctx, payload) =>
    expireInvitations(ctx, payload.now ? { now: new Date(payload.now) } : {}),
};

/** Parses `data` for `name` and runs its handler. Throws on an invalid payload, which fails the job. */
export async function runJob<N extends JobName>(ctx: DbContext, name: N, data: unknown): Promise<unknown> {
  const handler = jobHandlers[name] as JobHandler<N>;
  return handler(ctx, parseJobPayload(name, data));
}
