import {
  isAllowedImageSource,
  isAllowedLinkUrl,
  RICH_TEXT_POLICY,
  RichText,
  toPlainText,
} from '@ge/domain';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';

/**
 * Server-side cleaning of rich text on write (architecture.md §9). HTML goes through
 * sanitize-html with RICH_TEXT_POLICY from @ge/domain, the same policy the browser's DOMPurify
 * applies again when rendering. Plain text and Markdown are stored as written: plain text is
 * rendered as text, and Markdown is rendered without raw HTML.
 */
const HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...RICH_TEXT_POLICY.allowedTags],
  allowedAttributes: Object.fromEntries(
    Object.entries(RICH_TEXT_POLICY.allowedAttributes).map(([tag, attributes]) => [
      tag,
      [...attributes],
    ]),
  ),
  allowedSchemes: [...RICH_TEXT_POLICY.allowedLinkSchemes],
  // Images take no scheme at all: only this site's /media/ paths (checked below).
  allowedSchemesByTag: { img: [] },
  allowProtocolRelative: false,
  // Removed with everything inside them, not just unwrapped.
  nonTextTags: [
    'script',
    'style',
    'textarea',
    'option',
    'noscript',
    'template',
    'iframe',
    'object',
    'embed',
    'svg',
    'math',
    'title',
  ],
  // Drop images whose source isn't one of our uploads.
  exclusiveFilter: (frame) => frame.tag === 'img' && !isAllowedImageSource(frame.attribs.src ?? ''),
  transformTags: {
    // A second, stricter look at link targets, with the same rule the browser uses.
    a: (tagName, attribs) => {
      const { href, ...rest } = attribs;
      return {
        tagName,
        attribs: href !== undefined && isAllowedLinkUrl(href) ? { ...rest, href } : rest,
      };
    },
  },
};

/** Cleans one HTML fragment with the rich-text policy. */
export function sanitizeHtmlSource(source: string): string {
  return sanitizeHtml(source, HTML_OPTIONS);
}

/** Cleans one rich-text value; only HTML changes. */
export function sanitizeRichText(text: RichText): RichText {
  return text.format === 'html' ? { ...text, source: sanitizeHtmlSource(text.source) } : text;
}

/**
 * Cleans every rich-text value in `input`, wherever it sits (a name, a caption in a list, a
 * text fact inside a union), by walking `schema` alongside the value. A value counts as rich
 * text only where the schema says so, so a look-alike object elsewhere is left alone.
 */
export function sanitizeRichTextFields<T>(schema: z.ZodType, input: T): T {
  return walk(schema, input) as T;
}

function walk(schema: z.ZodType, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (schema === RichText) return sanitizeRichText(value as RichText);
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return walk(schema.unwrap() as z.ZodType, value);
  }
  if (schema instanceof z.ZodDefault) return walk(schema.unwrap() as z.ZodType, value);
  if (schema instanceof z.ZodObject && isPlainObject(value)) {
    const shape = schema.shape as Record<string, z.ZodType>;
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => [
        key,
        shape[key] ? walk(shape[key], field) : field,
      ]),
    );
  }
  if (schema instanceof z.ZodArray && Array.isArray(value)) {
    return value.map((item) => walk(schema.element as z.ZodType, item));
  }
  if (schema instanceof z.ZodUnion) {
    // The first option the value fits, as Zod itself would choose.
    const options = schema.options as readonly z.ZodType[];
    const match = options.find((option) => option.safeParse(value).success);
    return match ? walk(match, value) : value;
  }
  if (schema instanceof z.ZodRecord && isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => [
        key,
        walk(schema.valueType as z.ZodType, field),
      ]),
    );
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The plain-text columns derived from rich-text fields on write: `name` → `namePlain`. */
export function derivedPlainText(input: { name?: RichText }): { namePlain?: string } {
  return input.name ? { namePlain: toPlainText(input.name) } : {};
}
