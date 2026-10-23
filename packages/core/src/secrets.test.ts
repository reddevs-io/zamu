import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Conflict } from './errors';
import {
  decryptSecret,
  EncryptionKeyMissing,
  encryptSecret,
  isEncryptionReady,
  loadEncryptionKey,
  SecretUnreadable,
} from './secrets';

const KEY_TEXT = randomBytes(32).toString('base64');
const ctx = { encryptionKey: loadEncryptionKey(KEY_TEXT) };
const SECRET = 'glpat-SuperSecretToken-3kd';

describe('loadEncryptionKey', () => {
  it('returns undefined when the key is unset or blank', () => {
    expect(loadEncryptionKey(undefined)).toBeUndefined();
    expect(loadEncryptionKey('')).toBeUndefined();
    expect(loadEncryptionKey('   ')).toBeUndefined();
  });

  it('decodes 32 bytes of base64 or base64url', () => {
    const bytes = randomBytes(32);
    expect(Buffer.from(loadEncryptionKey(bytes.toString('base64')) as Uint8Array)).toEqual(bytes);
    expect(Buffer.from(loadEncryptionKey(` ${bytes.toString('base64url')}\n`) as Uint8Array)).toEqual(bytes);
  });

  it('refuses a key of the wrong length without echoing it', () => {
    const short = randomBytes(16).toString('base64');
    expect(() => loadEncryptionKey(short)).toThrow(/32 bytes, not 16/);
    try {
      loadEncryptionKey(short);
    } catch (error) {
      expect((error as Error).message).not.toContain(short);
    }
    expect(() => loadEncryptionKey(randomBytes(48).toString('base64'))).toThrow(/32 bytes, not 48/);
  });

  it('refuses text that is not base64', () => {
    expect(() => loadEncryptionKey('not a key!')).toThrow(/not base64/);
    expect(() => loadEncryptionKey('abc=def')).toThrow(/not base64/);
  });
});

describe('encryptSecret and decryptSecret', () => {
  it('round-trips, including non-ASCII text', () => {
    expect(decryptSecret(ctx, encryptSecret(ctx, SECRET))).toBe(SECRET);
    expect(decryptSecret(ctx, encryptSecret(ctx, 'clé · 秘密 · 🔑'))).toBe('clé · 秘密 · 🔑');
    expect(decryptSecret(ctx, encryptSecret(ctx, ''))).toBe('');
  });

  it('writes v1: + base64(iv ‖ ciphertext ‖ tag) with a fresh IV each time', () => {
    const first = encryptSecret(ctx, SECRET);
    const second = encryptSecret(ctx, SECRET);
    expect(first).toMatch(/^v1:[A-Za-z0-9+/]+=*$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain(SECRET);
    const bytes = Buffer.from(first.slice(3), 'base64');
    expect(bytes.length).toBe(12 + Buffer.byteLength(SECRET) + 16);
    expect(bytes.subarray(0, 12)).not.toEqual(Buffer.from(second.slice(3), 'base64').subarray(0, 12));
  });

  it('fails cleanly with the wrong key', () => {
    const stored = encryptSecret(ctx, SECRET);
    const other = { encryptionKey: loadEncryptionKey(randomBytes(32).toString('base64')) };
    expect(() => decryptSecret(other, stored)).toThrow(SecretUnreadable);
    try {
      decryptSecret(other, stored);
    } catch (error) {
      expect(error).toBeInstanceOf(Conflict);
      expect((error as Error).message).not.toContain(SECRET);
      expect((error as Error).message).not.toContain(KEY_TEXT);
      expect((error as Error).cause).toBeUndefined();
    }
  });

  it('refuses damaged values and unknown formats', () => {
    const stored = encryptSecret(ctx, SECRET);
    const bytes = Buffer.from(stored.slice(3), 'base64');
    bytes[14] = (bytes[14] as number) ^ 0xff;
    expect(() => decryptSecret(ctx, `v1:${bytes.toString('base64')}`)).toThrow(SecretUnreadable);
    expect(() => decryptSecret(ctx, stored.replace('v1:', 'v2:'))).toThrow(SecretUnreadable);
    expect(() => decryptSecret(ctx, 'v1:%%%')).toThrow(SecretUnreadable);
    expect(() => decryptSecret(ctx, 'v1:AAAA')).toThrow(SecretUnreadable);
    expect(() => decryptSecret(ctx, SECRET)).toThrow(SecretUnreadable);
  });

  it('throws EncryptionKeyMissing (a Conflict) without a key', () => {
    expect(isEncryptionReady({})).toBe(false);
    expect(isEncryptionReady(ctx)).toBe(true);
    expect(() => encryptSecret({}, SECRET)).toThrow(EncryptionKeyMissing);
    expect(() => decryptSecret({}, encryptSecret(ctx, SECRET))).toThrow(EncryptionKeyMissing);
    const error = new EncryptionKeyMissing();
    expect(error).toBeInstanceOf(Conflict);
    expect(error.code).toBe('CONFLICT');
    expect(error.message).toMatch(/APP_ENCRYPTION_KEY/);
  });

  it('refuses a context key that is not 32 bytes', () => {
    expect(() => encryptSecret({ encryptionKey: new Uint8Array(16) }, SECRET)).toThrow(/32 bytes/);
  });
});
