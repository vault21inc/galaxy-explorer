/** Reads an environment variable that integration tests can't run without. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and run \`pnpm db:up\`.`);
  }
  return value;
}
