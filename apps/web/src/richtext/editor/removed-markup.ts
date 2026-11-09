/**
 * What the server's HTML sanitizer removed (ux.md §8: "the editor shows what was removed"):
 * the tags and attributes in what was sent that are missing from what was saved. A rough
 * tally over start tags, not a parse; it only names things for the notice under the field.
 */

const START_TAG = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
const ATTRIBUTE = /([^\s=/"'>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/g;

function tally(html: string): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (item: string) => counts.set(item, (counts.get(item) ?? 0) + 1);
  for (const [, rawTag = '', attributes = ''] of html.matchAll(START_TAG)) {
    const tag = rawTag.toLowerCase();
    add(`<${tag}>`);
    for (const [, name = ''] of attributes.matchAll(ATTRIBUTE)) {
      add(`${name.toLowerCase()} on <${tag}>`);
    }
  }
  return counts;
}

/** The removed tags (`<script>`) and attributes (`onclick on <p>`), each named once. */
export function removedMarkup(sent: string, saved: string): string[] {
  const after = tally(saved);
  const removed: string[] = [];
  for (const [item, count] of tally(sent)) {
    if (count > (after.get(item) ?? 0)) removed.push(item);
  }
  // A tag removed outright takes its attributes with it; naming them too is noise.
  return removed.filter((item) => {
    const tag = /on (<[\w-]+>)$/.exec(item)?.[1];
    return !tag || after.has(tag);
  });
}
