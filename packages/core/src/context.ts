// What core services need from their host. Adapters build one CoreContext at startup and pass it
// (or the subset a service asks for) with the actor of each request.
import type { Auth } from '@pm/auth';
import type { Db } from '@pm/db';
import type { JobQueue } from './jobs';

export interface DbContext {
  db: Db;
  /** IANA time zone that decides "today" for cycles and milestones (APP_TIME_ZONE). Default UTC. */
  timeZone?: string;
  /** Clock override for tests. Default: the current time. */
  now?: () => Date;
}

/** Services that create API keys go through Better Auth's API-key plugin. */
export interface AuthContext extends DbContext {
  auth: Auth;
}

/** Services that build links (invitations) need the public origin of the web app. */
export interface LinkContext extends DbContext {
  /** PUBLIC_URL, e.g. https://pm.example.com. No trailing slash needed. */
  publicUrl: string;
}

export interface CoreContext extends AuthContext, LinkContext {
  /** Producer for background jobs. Optional: services that enqueue nothing work without it. */
  jobs?: JobQueue;
}
