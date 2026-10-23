// Webhook verification. GitHub signs the raw body with HMAC-SHA256 (X-Hub-Signature-256:
// sha256=<hex>); Gitea and Forgejo do the same in hex without a prefix (X-Forgejo-Signature,
// X-Gitea-Signature); GitLab sends the secret itself in X-Gitlab-Token. Comparisons are constant
// time. The payload is parsed only after the signature checks out.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { ProviderKind, WebhookHeaders, WebhookVerification } from './types';

function header(headers: WebhookHeaders, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted || value === undefined) continue;
    return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function bytesOf(body: string | Uint8Array): Buffer {
  return typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
}

/** Constant-time string equality that does not leak the length either. */
function sameSecret(received: string, expected: string): boolean {
  const a = createHash('sha256').update(received, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b) && received.length === expected.length;
}

function hmacHex(secret: string, body: Buffer): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function parsePayload(body: Buffer): Record<string, unknown> | null {
  let text = body.toString('utf8');
  // "application/x-www-form-urlencoded" deliveries (GitHub, Gitea) carry the JSON in payload=.
  if (text.startsWith('payload=')) text = new URLSearchParams(text).get('payload') ?? '';
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const ZERO_SHA = /^0+$/;

function pushResult(eventName: string, payload: Record<string, unknown>): WebhookVerification {
  const ref = typeof payload.ref === 'string' ? payload.ref : '';
  const after = typeof payload.after === 'string' ? payload.after : '';
  const deleted = payload.deleted === true || (after !== '' && ZERO_SHA.test(after));
  return {
    ok: true,
    event: 'push',
    eventName,
    deleted,
    ...(ref.startsWith('refs/heads/') ? { branch: ref.slice('refs/heads/'.length) } : {}),
    ...(after && !deleted ? { headCommit: after } : {}),
  };
}

/**
 * Verifies one delivery for a source's secret and extracts what a refresh needs. `rawBody` must be
 * the exact bytes received. An empty secret never verifies.
 */
export function verifyWebhook(
  provider: ProviderKind,
  headers: WebhookHeaders,
  rawBody: string | Uint8Array,
  secret: string,
): WebhookVerification {
  const body = bytesOf(rawBody);
  let eventName: string;
  let isPush: boolean;

  switch (provider) {
    case 'github': {
      const signature = header(headers, 'x-hub-signature-256');
      if (!signature) return { ok: false, reason: 'missing_signature' };
      if (!secret || !sameSecret(signature.trim().toLowerCase(), `sha256=${hmacHex(secret, body)}`)) {
        return { ok: false, reason: 'bad_signature' };
      }
      eventName = header(headers, 'x-github-event') ?? '';
      if (eventName === 'ping') return { ok: true, event: 'ping', eventName };
      isPush = eventName === 'push';
      break;
    }
    case 'gitlab': {
      const token = header(headers, 'x-gitlab-token');
      if (!token) return { ok: false, reason: 'missing_signature' };
      if (!secret || !sameSecret(token, secret)) return { ok: false, reason: 'bad_signature' };
      eventName = header(headers, 'x-gitlab-event') ?? '';
      isPush = eventName === 'Push Hook';
      break;
    }
    case 'gitea': {
      const signature = header(headers, 'x-forgejo-signature') ?? header(headers, 'x-gitea-signature');
      if (!signature) return { ok: false, reason: 'missing_signature' };
      if (!secret || !sameSecret(signature.trim().toLowerCase(), hmacHex(secret, body))) {
        return { ok: false, reason: 'bad_signature' };
      }
      eventName = header(headers, 'x-forgejo-event') ?? header(headers, 'x-gitea-event') ?? '';
      isPush = eventName === 'push';
      break;
    }
  }

  if (!isPush) return { ok: true, event: 'other', eventName };
  const payload = parsePayload(body);
  if (!payload) return { ok: false, reason: 'bad_payload' };
  return pushResult(eventName, payload);
}

/** Signature header a provider would send for `rawBody`, for tests and fixtures. GitLab sends the secret. */
export function signWebhook(
  provider: ProviderKind,
  rawBody: string | Uint8Array,
  secret: string,
): Record<string, string> {
  const body = bytesOf(rawBody);
  switch (provider) {
    case 'github':
      return { 'X-Hub-Signature-256': `sha256=${hmacHex(secret, body)}` };
    case 'gitlab':
      return { 'X-Gitlab-Token': secret };
    case 'gitea':
      return { 'X-Forgejo-Signature': hmacHex(secret, body), 'X-Gitea-Signature': hmacHex(secret, body) };
  }
}
