// Secrets at rest: git connection tokens and Backlog.md webhook secrets. AES-256-GCM under
// APP_ENCRYPTION_KEY (32 random bytes, base64). Stored format: `v1:` + base64(iv ‖ ciphertext ‖ tag)
// with a 12-byte IV and a 16-byte tag. Adapters decode the key once at startup with
// loadEncryptionKey and put it in the core context; services never read process.env.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { GitContext } from './context';
import { Conflict } from './errors';

const VERSION = 'v1:';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** APP_ENCRYPTION_KEY is not set, so tokens and webhook secrets can be neither stored nor read. */
export class EncryptionKeyMissing extends Conflict {
  constructor(
    message = 'Set APP_ENCRYPTION_KEY on the web server and the worker to use git connections and Backlog.md mirrors.',
  ) {
    super(message);
  }
}

/**
 * A stored secret that does not decrypt: the key changed, or the value was damaged. The message
 * never carries the value or the key.
 */
export class SecretUnreadable extends Conflict {
  constructor(
    message = 'A stored secret cannot be read with the current APP_ENCRYPTION_KEY. If the key changed, restore it or enter the token again.',
  ) {
    super(message);
  }
}

/**
 * Decodes APP_ENCRYPTION_KEY. Unset or blank: undefined (the app runs, git connections are off).
 * Set but not 32 bytes of base64 (or base64url): throws, so the startup config check fails. The
 * error says what is wrong without echoing the value.
 */
export function loadEncryptionKey(value: string | undefined): Uint8Array | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  const isBase64 = BASE64.test(text);
  if (!isBase64 && !BASE64URL.test(text)) {
    throw new Error('APP_ENCRYPTION_KEY is not base64. Generate one with: openssl rand -base64 32');
  }
  const bytes = Buffer.from(text, isBase64 ? 'base64' : 'base64url');
  if (bytes.length !== KEY_BYTES) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, not ${bytes.length}. Generate one with: openssl rand -base64 32`,
    );
  }
  return new Uint8Array(bytes);
}

/** Whether secrets can be stored and read: APP_ENCRYPTION_KEY is set. */
export function isEncryptionReady(ctx: Pick<GitContext, 'encryptionKey'>): boolean {
  return ctx.encryptionKey !== undefined;
}

function keyOf(ctx: Pick<GitContext, 'encryptionKey'>): Uint8Array {
  const key = ctx.encryptionKey;
  if (!key) throw new EncryptionKeyMissing();
  if (key.length !== KEY_BYTES) {
    // Adapters build the key with loadEncryptionKey; anything else is a programming error.
    throw new Error(`The encryption key in the core context must be ${KEY_BYTES} bytes`);
  }
  return key;
}

/** Encrypts `plaintext` under the context's key. A fresh IV per call: equal inputs differ. */
export function encryptSecret(ctx: Pick<GitContext, 'encryptionKey'>, plaintext: string): string {
  const key = keyOf(ctx);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return VERSION + Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64');
}

/**
 * Decrypts a value from encryptSecret. Throws EncryptionKeyMissing without a key and
 * SecretUnreadable for a wrong key, an unknown format or a damaged value.
 */
export function decryptSecret(ctx: Pick<GitContext, 'encryptionKey'>, ciphertext: string): string {
  const key = keyOf(ctx);
  if (!ciphertext.startsWith(VERSION)) throw new SecretUnreadable();
  const encoded = ciphertext.slice(VERSION.length);
  if (!BASE64.test(encoded)) throw new SecretUnreadable();
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < IV_BYTES + TAG_BYTES) throw new SecretUnreadable();
  const iv = bytes.subarray(0, IV_BYTES);
  const tag = bytes.subarray(bytes.length - TAG_BYTES);
  const body = bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretUnreadable();
  }
}
