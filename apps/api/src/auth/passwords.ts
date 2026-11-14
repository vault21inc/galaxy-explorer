import { hash, verify } from '@node-rs/argon2';

/**
 * Passwords (M8-T1, D-15) are hashed with argon2id, which is slow and memory-hungry on purpose,
 * so a stolen database can't be tried against billions of guesses a second. The library's
 * defaults are argon2id with 19 MiB and 2 passes, OWASP's recommended minimum; the hash string
 * records its own parameters, so raising them later still verifies old hashes.
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/** A hash of nothing anyone knows, checked when the username doesn't exist (below). */
let decoy: Promise<string> | undefined;

/**
 * Makes the decoy hash ahead of time, when the API starts, so the first sign-in with an unknown
 * username doesn't take longer than the rest (and give that away).
 */
export function prepareDecoy(): Promise<string> {
  decoy ??= hash('decoy: no account has this password');
  return decoy;
}

/**
 * Whether `password` matches `passwordHash`. With no hash (no such account), it still spends the
 * same time hashing, against a decoy, so how long a failed sign-in takes doesn't reveal whether
 * the username exists.
 */
export async function checkPassword(
  passwordHash: string | undefined,
  password: string,
): Promise<boolean> {
  if (passwordHash === undefined) {
    await verify(await prepareDecoy(), password);
    return false;
  }
  try {
    return await verify(passwordHash, password);
  } catch {
    // A hash the library can't read: treat it as a mismatch, never as a match.
    return false;
  }
}
