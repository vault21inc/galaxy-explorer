/**
 * Errors about accounts and signing in (M8-T1). The API's error handler turns each into a
 * problem+json response (http/problems.ts). Messages about credentials stay generic: they never
 * say which of the username, password or code was wrong, or whether an account exists.
 */

/** The request needs a signed-in account: 401. */
export class NotSignedIn extends Error {
  override readonly name = 'NotSignedIn';

  constructor(message = 'Sign in to do this.') {
    super(message);
  }
}

/** A sign-in that didn't work, for whatever reason: 401, always with this message. */
export class SignInFailed extends Error {
  override readonly name = 'SignInFailed';

  constructor() {
    super('That didn’t work. Check your username, password and code, and try again.');
  }
}

/** "1 minute", "40 seconds": a wait in words. */
function waitText(seconds: number): string {
  const [count, unit] =
    seconds < 60 ? [Math.max(1, seconds), 'second'] : [Math.ceil(seconds / 60), 'minute'];
  return `${String(count)} ${unit}${count === 1 ? '' : 's'}`;
}

/**
 * Too many failures for this address, account or link, or too many requests (the rate limits,
 * M8-T3): 429, with when to try again.
 */
export class TooManyAttempts extends Error {
  override readonly name = 'TooManyAttempts';
  readonly retryAfterS: number;

  constructor(retryAfterS: number, what: 'tries' | 'requests' = 'tries') {
    // Failures are counted over 15 minutes, so their wait is said in whole minutes.
    const wait = what === 'tries' ? waitText(Math.max(60, retryAfterS)) : waitText(retryAfterS);
    super(`Too many ${what}. Wait ${wait} and try again.`);
    this.retryAfterS = retryAfterS;
  }
}

/** A link that doesn't exist: 404, saying only that it doesn't work. */
export class LinkNotFound extends Error {
  override readonly name = 'LinkNotFound';

  constructor() {
    super('This link doesn’t work. Ask an admin for a new one.');
  }
}

/** A link that was used, has expired, or is for a disabled account: 410. */
export class LinkGone extends Error {
  override readonly name = 'LinkGone';

  constructor(reason: 'used' | 'expired' | 'disabled') {
    super(
      {
        used: 'This link has already been used. Ask an admin for a new one if you need it.',
        expired: 'This link has expired. Ask an admin for a new one.',
        disabled: 'This account is disabled. Ask an admin about it.',
      }[reason],
    );
  }
}

/** An invite's chosen username belongs to someone else: 409. */
export class UsernameTaken extends Error {
  override readonly name = 'UsernameTaken';

  constructor() {
    super('That username is taken. Choose another.');
  }
}

/** Signed in, but refused: a write from another site, or a missing or wrong fresh code: 403. */
export class Refused extends Error {
  override readonly name = 'Refused';
}
