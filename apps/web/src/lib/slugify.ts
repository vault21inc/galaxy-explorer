/**
 * Turns a name into a slug that matches SLUG_PATTERN (data-model §2): "Warhammer 40,000"
 * becomes "warhammer-40000". Accents are dropped ("Été" → "ete"); anything else that isn't a
 * letter or digit separates words. Returns '' when nothing usable is left.
 */
export function slugify(name: string, maxLength = 100): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[,.'’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, '');
}
