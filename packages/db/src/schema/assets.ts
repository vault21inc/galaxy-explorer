import { HTTP_URL_PATTERN, type AssetVariants } from '@ge/domain';
import { check, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { idColumn, matches } from './helpers.ts';

/** An uploaded image (data-model §3.6). Uploads arrive in M3; the table exists from M1. */
export const assets = pgTable(
  'assets',
  {
    id: idColumn(),
    universeId: uuid().notNull(),
    /** Of the original upload, to spot duplicates. */
    sha256: text().notNull(),
    /** Of the stored variants, such as image/webp. */
    mimeType: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    byteSize: integer().notNull(),
    variants: jsonb().$type<AssetVariants>().notNull(),
    originalFilename: text(),
    altText: text(),
    /** Who made it (A5). */
    credit: text(),
    sourceUrl: text(),
    license: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('assets_universe_sha256_uq').on(t.universeId, t.sha256),
    check('assets_source_url_format', matches(t.sourceUrl, HTTP_URL_PATTERN)),
  ],
);
