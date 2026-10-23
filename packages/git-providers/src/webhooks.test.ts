import { describe, expect, it } from 'vitest';
import { loadJson } from '../test/replay';
import { createProvider } from './create';
import type { ProviderKind, WebhookVerification } from './types';
import { signWebhook, verifyWebhook } from './webhooks';

interface Delivery {
  provider: ProviderKind;
  headers: Record<string, string>;
  body: string;
  expected: WebhookVerification;
}

const fixture = loadJson<{
  secret: string;
  githubDocsVector: { secret: string; body: string; signature: string };
  deliveries: Record<string, Delivery>;
}>('webhooks', 'deliveries');
const { secret, deliveries } = fixture;

describe('verifyWebhook', () => {
  it.each(Object.entries(deliveries))('%s verifies with the right secret', (_name, delivery) => {
    expect(verifyWebhook(delivery.provider, delivery.headers, delivery.body, secret)).toEqual(
      delivery.expected,
    );
  });

  it.each(Object.entries(deliveries))('%s fails with a wrong secret', (_name, delivery) => {
    expect(verifyWebhook(delivery.provider, delivery.headers, delivery.body, `${secret}x`)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    expect(verifyWebhook(delivery.provider, delivery.headers, delivery.body, '')).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it.each(Object.entries(deliveries).filter(([, delivery]) => delivery.provider !== 'gitlab'))(
    '%s fails when the body was changed',
    (_name, delivery) => {
      const tampered = `${delivery.body} `;
      expect(verifyWebhook(delivery.provider, delivery.headers, tampered, secret)).toMatchObject({
        ok: false,
      });
    },
  );

  it('matches the test vector from the GitHub docs', () => {
    const vector = fixture.githubDocsVector;
    expect(signWebhook('github', vector.body, vector.secret)).toEqual({
      'X-Hub-Signature-256': vector.signature,
    });
    const result = verifyWebhook(
      'github',
      { 'x-hub-signature-256': vector.signature },
      vector.body,
      vector.secret,
    );
    expect(result).toEqual({ ok: true, event: 'other', eventName: '' });
  });

  it('refuses deliveries without a signature header', () => {
    const body = deliveries['github-push']?.body ?? '';
    expect(verifyWebhook('github', { 'x-github-event': 'push' }, body, secret)).toEqual({
      ok: false,
      reason: 'missing_signature',
    });
    expect(verifyWebhook('gitlab', { 'x-gitlab-event': 'Push Hook' }, body, secret)).toEqual({
      ok: false,
      reason: 'missing_signature',
    });
    // A GitHub-style signature alone does not satisfy the Gitea check.
    expect(
      verifyWebhook(
        'gitea',
        { 'x-hub-signature-256': signWebhook('github', body, secret)['X-Hub-Signature-256'] },
        body,
        secret,
      ),
    ).toEqual({ ok: false, reason: 'missing_signature' });
  });

  it('does not accept a GitLab token that is only a prefix of the secret', () => {
    const body = deliveries['gitlab-push']?.body ?? '';
    const headers = { 'X-Gitlab-Event': 'Push Hook', 'X-Gitlab-Token': secret.slice(0, -1) };
    expect(verifyWebhook('gitlab', headers, body, secret)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('accepts a Headers object, array values and a byte body', () => {
    const delivery = deliveries['forgejo-push'] as Delivery;
    const headers = new Headers(delivery.headers);
    const bytes = new TextEncoder().encode(delivery.body);
    expect(verifyWebhook('gitea', headers, bytes, secret)).toEqual(delivery.expected);
    const arrays = Object.fromEntries(
      Object.entries(delivery.headers).map(([name, value]) => [name, [value]]),
    );
    expect(verifyWebhook('gitea', arrays, delivery.body, secret)).toEqual(delivery.expected);
  });

  it('reports a signed body that is not JSON as a bad payload', () => {
    const body = 'not json';
    const headers = { 'X-GitHub-Event': 'push', ...signWebhook('github', body, secret) };
    expect(verifyWebhook('github', headers, body, secret)).toEqual({ ok: false, reason: 'bad_payload' });
  });

  it('is exposed on the provider too', () => {
    const delivery = deliveries['gitlab-push'] as Delivery;
    const provider = createProvider({ provider: 'gitlab', host: 'gitlab.com', token: '' });
    expect(provider.verifyWebhook(delivery.headers, delivery.body, secret)).toEqual(delivery.expected);
  });
});
