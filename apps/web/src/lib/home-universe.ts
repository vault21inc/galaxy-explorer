/**
 * Where `/` takes a signed-out visitor (D-51): the site's home universe, when the server names
 * one (`GE_HOME_UNIVERSE`) and the visitor can read it, which for a signed-out visitor means it's
 * public and so in their list. The server may name a path into it (a view, a selection, a
 * camera); otherwise it's the universe's address. Anyone signed in, or a site without accounts,
 * gets the list. Null: show the list.
 */
export function homeUniverseFor(input: {
  /** From `/api/health`: the universe's slug, and the path to open. */
  homeUniverse: string | null | undefined;
  homePath: string | null | undefined;
  /** Whether the site has accounts at all. */
  accounts: boolean;
  /** Whether the visitor is known to be signed out (not still loading). */
  signedOut: boolean;
  /** The universes this visitor can open. */
  universes: readonly { slug: string }[];
}): string | null {
  const { homeUniverse, homePath, accounts, signedOut, universes } = input;
  if (!homeUniverse || !accounts || !signedOut) return null;
  if (!universes.some((universe) => universe.slug === homeUniverse)) return null;
  // Only a path into that same universe: anything else is the universe's own address.
  return homePath?.startsWith(`/u/${homeUniverse}`) ? homePath : `/u/${homeUniverse}`;
}
