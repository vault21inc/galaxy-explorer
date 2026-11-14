/**
 * Account commands for whoever runs the server (M8-T1), from the repository root:
 *
 *   pnpm admin:create-user [--admin]   make an account here: username, password, two-factor setup
 *   pnpm admin:invite [--admin]        print an invite link (7 days, single use)
 *   pnpm admin:reset-link <username>   print a reset link (24 hours, single use)
 *
 * The first admin is made with `create-user --admin`, on the server, where nobody else can watch.
 * Links need GE_PUBLIC_URL, the site's address; `create-user` needs GE_SESSION_SECRET too, to
 * seal the two-factor secret. They talk to the database in DATABASE_URL directly.
 */
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createDatabase, schema, type Database } from '@ge/db';
import { Password, Username } from '@ge/domain';
import { eq } from 'drizzle-orm';
import { ConfigError, loadConfig, type Config } from '../config.ts';
import { recordCliEvent } from '../services/access-events.ts';
import { sealerFor } from './crypto.ts';
import { createAccountLink, linkUrl } from './links.ts';
import { hashPassword } from './passwords.ts';
import { normalUsername } from './sign-in.ts';
import { acceptedStep, newTotpSecret, otpauthUri, qrCodeForTerminal } from './totp.ts';

const USAGE = `Usage:
  pnpm admin:create-user [--admin]   make an account: username, password, two-factor setup
  pnpm admin:invite [--admin]        print an invite link (7 days, single use)
  pnpm admin:reset-link <username>   print a reset link (24 hours, single use)`;

class UsageError extends Error {}

function need(value: string | undefined, variable: string, why: string): string {
  if (value === undefined) throw new UsageError(`Set ${variable} ${why}.`);
  return value;
}

/**
 * Questions on the terminal. Typed passwords aren't echoed: readline writes what's typed through
 * `output`, which drops it while `muted`. Piped input (no terminal) is read line by line, so
 * the commands can be scripted.
 */
function prompter() {
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) stdout.write(chunk);
      callback();
    },
  });
  const lines = createInterface({ input: stdin, output, terminal: stdin.isTTY });
  return {
    async ask(question: string, options: { hidden?: boolean } = {}): Promise<string> {
      stdout.write(question);
      muted = options.hidden === true && stdin.isTTY;
      try {
        return (await lines.question('')).trim();
      } finally {
        if (muted) stdout.write('\n');
        muted = false;
      }
    },
    close: () => {
      lines.close();
    },
  };
}

async function createUser(db: Database, config: Config, admin: boolean): Promise<void> {
  const publicUrl = need(config.publicUrl, 'GE_PUBLIC_URL', 'to the site’s address');
  const sealer = sealerFor(
    need(config.sessionSecret, 'GE_SESSION_SECRET', 'to seal the two-factor secret'),
    'totp-secret',
  );
  const prompt = prompter();
  try {
    let username = '';
    for (;;) {
      const typed = Username.safeParse(normalUsername(await prompt.ask('Username: ')));
      if (!typed.success) {
        console.log(typed.error.issues[0]?.message);
        continue;
      }
      const [taken] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.username, typed.data));
      if (!taken) {
        username = typed.data;
        break;
      }
      console.log('That username is taken.');
    }

    let password = '';
    for (;;) {
      const typed = Password.safeParse(
        await prompt.ask('Password (at least 12 characters): ', { hidden: true }),
      );
      if (!typed.success) {
        console.log(typed.error.issues[0]?.message);
        continue;
      }
      if ((await prompt.ask('The same password again: ', { hidden: true })) === typed.data) {
        password = typed.data;
        break;
      }
      console.log('Those didn’t match. Try again.');
    }

    const secret = newTotpSecret();
    const uri = otpauthUri(secret, username, publicUrl);
    console.log('\nScan this with an authenticator app, or type in the secret below it:\n');
    console.log(await qrCodeForTerminal(uri));
    console.log(`Secret: ${secret}\n${uri}\n`);
    let step: number | null = null;
    for (let tries = 0; step === null; tries += 1) {
      if (tries === 3) throw new UsageError('No account made: the codes didn’t match.');
      step = await acceptedStep(secret, await prompt.ask('A code from the app: '), null);
      if (step === null)
        console.log('That code didn’t work. Check the device’s clock, then try the next one.');
    }

    await db.insert(schema.users).values({
      username,
      role: admin ? 'admin' : 'member',
      passwordHash: await hashPassword(password),
      totpSecretEnc: sealer.seal(Buffer.from(secret)),
      totpLastStep: step,
    });
    console.log(
      `\nMade ${admin ? 'the admin' : 'the account'} ${username}. Sign in at ${publicUrl}/login.`,
    );
  } finally {
    prompt.close();
  }
}

async function printLink(db: Database, config: Config, args: string[]): Promise<void> {
  const publicUrl = need(config.publicUrl, 'GE_PUBLIC_URL', 'to the site’s address, for the link');
  const [command, ...rest] = args;
  if (command === 'invite') {
    const role = rest.includes('--admin') ? 'admin' : 'member';
    const { token, expiresAt } = await createAccountLink(db, { purpose: 'invite', role });
    await recordCliEvent(db, {
      action: 'invite.create',
      detail: { role, expiresAt: expiresAt.toISOString() },
    });
    console.log(
      `An invite for ${role === 'admin' ? 'an admin' : 'an account'}, single use, until ${expiresAt.toISOString()}:`,
    );
    console.log(linkUrl(publicUrl, token));
    return;
  }
  const username = normalUsername(rest[0] ?? '');
  if (!username) throw new UsageError(USAGE);
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, username));
  if (!user) throw new UsageError(`There is no account named ${username}.`);
  const { token, expiresAt } = await createAccountLink(db, { purpose: 'reset', userId: user.id });
  await recordCliEvent(db, {
    action: 'user.reset',
    userId: user.id,
    detail: { username, expiresAt: expiresAt.toISOString() },
  });
  console.log(`A reset link for ${username}, single use, until ${expiresAt.toISOString()}:`);
  console.log(linkUrl(publicUrl, token));
}

async function main(args: string[]): Promise<void> {
  const config = loadConfig();
  const db = createDatabase(config.databaseUrl, {
    onIdleClientError: (error) => {
      console.error('The database connection failed:', error.message);
    },
  });
  try {
    const [command] = args;
    if (command === 'create-user') await createUser(db, config, args.includes('--admin'));
    else if (command === 'invite' || command === 'reset-link') await printLink(db, config, args);
    else throw new UsageError(USAGE);
  } finally {
    await db.$client.end();
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError || error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
