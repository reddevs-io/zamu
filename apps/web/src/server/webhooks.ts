// POST /api/webhooks/backlog/{webhookId}: push notifications from GitHub, GitLab and Gitea/Forgejo.
// Framework-free so tests call it directly; routes/api/webhooks/backlog/$webhookId.ts mounts it.
// The raw body is read once (signatures are computed over its exact bytes) and handed to core's
// acceptBacklogWebhook, which verifies it, records the delivery and enqueues a refresh. Not oRPC:
// the senders are git hosts, not API clients, and they get bare status codes.
import { acceptBacklogWebhook, type WebhookContext } from '@zamu/core';

/** Larger push payloads are refused before reading. GitHub caps deliveries at 25 MB. */
export const MAX_WEBHOOK_BODY_BYTES = 25 * 1024 * 1024;

function empty(status: number): Response {
  return new Response(null, { status, headers: { 'cache-control': 'no-store' } });
}

/** Any other method: 405, instead of the app's HTML page. */
export function webhookMethodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } });
}

/** Reads at most `limit` bytes; null when the body is longer. */
async function readBody(request: Request, limit: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * 202 refresh queued (or one already waiting), 204 accepted but nothing to do (other branch, not a
 * push), 404 unknown id or bad signature (no detail), 410 detached, 413 body too large.
 */
export async function handleBacklogWebhook(
  ctx: WebhookContext,
  request: Request,
  webhookId: string,
  options: { maxBodyBytes?: number } = {},
): Promise<Response> {
  const body = await readBody(request, options.maxBodyBytes ?? MAX_WEBHOOK_BODY_BYTES);
  if (!body) return empty(413);
  try {
    const decision = await acceptBacklogWebhook(ctx, webhookId, request.headers, body);
    return empty(decision.status);
  } catch (error) {
    // Database or queue failures: the git host retries or shows the failed delivery.
    console.error('webhooks: delivery failed:', error instanceof Error ? error.message : error);
    return empty(500);
  }
}
