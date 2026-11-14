import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

/**
 * The cryptography behind accounts (M8-T1), all from Node's own `crypto`:
 *
 * - **Tokens** for session cookies and account links are 32 random bytes, which no one can
 *   guess. The database keeps only their SHA-256, so a copy of it can't be used to sign in or to
 *   open a link. A fast hash is enough here because the token is random, unlike a password.
 * - **Sealing** keeps two-factor secrets (and the setup between a link's two steps) readable
 *   only by this server: AES-256-GCM, which also detects any change to the sealed bytes, with a
 *   key derived from `GE_SESSION_SECRET` by HKDF. Each purpose gets its own key, so something
 *   sealed for one purpose can't be passed off as another.
 */

/** A new random token, as URL-safe text: 32 bytes, 256 bits. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the database stores for a token: its SHA-256. */
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export interface Sealer {
  seal(plain: Buffer): Buffer;
  /** The sealed bytes opened, or null if they were changed or sealed with another key. */
  open(sealed: Buffer): Buffer | null;
}

/** AES-GCM's recommended nonce length, and its authentication tag's. */
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** A sealer for one purpose ('totp-secret', 'link-setup'), keyed from the session secret. */
export function sealerFor(sessionSecret: string, purpose: string): Sealer {
  const key = Buffer.from(hkdfSync('sha256', sessionSecret, 'galaxy-explorer', purpose, 32));
  return {
    seal(plain) {
      // A fresh random nonce every time: GCM must never reuse one with the same key.
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(plain), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    open(sealed) {
      if (sealed.length < IV_BYTES + TAG_BYTES) return null;
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, IV_BYTES));
        decipher.setAuthTag(sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
        return Buffer.concat([
          decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)),
          decipher.final(),
        ]);
      } catch {
        // The tag didn't match: changed bytes, or another key.
        return null;
      }
    },
  };
}
