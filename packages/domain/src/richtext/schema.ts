import { z } from 'zod';

/** The formats a text field can be written in (U4). */
export const RICH_TEXT_FORMATS = ['plain', 'markdown', 'html'] as const;
export type RichTextFormat = (typeof RICH_TEXT_FORMATS)[number];

/** The longest source text a field may hold, in characters. */
export const RICH_TEXT_MAX_LENGTH = 100_000;

/**
 * Every text field: names, summaries, descriptions, captions and roles (data-model §4).
 * `spoiler` marks the whole field as a potential spoiler; parts of a text are marked inline
 * (`||…||` in Markdown, `<span data-spoiler>…</span>` in HTML).
 */
export const RichText = z.object({
  format: z.enum(RICH_TEXT_FORMATS),
  source: z.string().max(RICH_TEXT_MAX_LENGTH),
  spoiler: z.boolean().default(false),
});
export type RichText = z.infer<typeof RichText>;

/** Builds RichText values: `rt.plain('Gudrun')`, `rt.md('A **hive** world', { spoiler: true })`. */
export const rt = {
  plain: (source: string, options?: { spoiler?: boolean }): RichText =>
    make('plain', source, options),
  md: (source: string, options?: { spoiler?: boolean }): RichText =>
    make('markdown', source, options),
  html: (source: string, options?: { spoiler?: boolean }): RichText =>
    make('html', source, options),
};

function make(
  format: RichTextFormat,
  source: string,
  options: { spoiler?: boolean } | undefined,
): RichText {
  return { format, source, spoiler: options?.spoiler ?? false };
}
