import {
  mapWikiParams,
  rt,
  toPlainText,
  type ConfigReadOf,
  type EntityKind,
  type FieldValue,
  type WikiPreview,
} from '@ge/domain';
import type { PanelEntity } from '../types.ts';

type Definition = ConfigReadOf<'field_definitions'>;

/** One thing the dialog offers to fill: the description, or one fact. */
export interface FillRow {
  /** The citation target: `description`, or `field:<key>`. */
  target: string;
  label: string;
  /** What it says now, as shown; null when empty. */
  current: string | null;
  /** What the wiki would make it, as shown. */
  wiki: string;
  /** Ticked at first: an empty description, or a fact the wiki changes. */
  checked: boolean;
  /** For a fact: its field and the value it would get. */
  fact?: { definition: Definition; value: FieldValue };
  /** The info-box parameter it comes from, for a fact. */
  param?: string;
}

export interface FillPlan {
  rows: FillRow[];
  /** Parameters that fill no field: offered as new wiki aliases. */
  unmapped: { name: string; text: string }[];
  /** Parameters that map to a field but say nothing ("Unknown"). */
  empty: { param: string; label: string }[];
}

/** A fact's value as the panel shows it, with its unit. */
export function shownValue(value: FieldValue, unit?: string | null): string {
  switch (value.type) {
    case 'number':
      return `${value.number.toLocaleString()}${unit ? ` ${unit}` : ''}`;
    case 'text':
      return toPlainText(value.text);
    case 'date_text':
      return value.text;
    case 'url':
      return value.label ?? value.url;
  }
}

/**
 * What a wiki page would fill on an entity (M7-T3): the description from its lead, and each
 * fact from the chosen template's parameters, through the fields' wiki aliases
 * (`mapWikiParams`). Pure, so it's unit-tested; the dialog recomputes it when an alias is added.
 */
export function fillPlan(
  preview: WikiPreview,
  templateIndex: number,
  entity: PanelEntity,
  definitions: readonly Definition[],
): FillPlan {
  const rows: FillRow[] = [];
  const description = entity.description ? toPlainText(entity.description).trim() : '';
  if (preview.lead.trim() !== '') {
    rows.push({
      target: 'description',
      label: 'Description',
      current: description === '' ? null : description,
      wiki: toPlainText(rt.md(preview.lead)),
      checked: description === '',
    });
  }
  const params = preview.templates[templateIndex]?.params ?? [];
  const { mapped, unmapped } = mapWikiParams(params, definitions);
  const empty: FillPlan['empty'] = [];
  const facts = new Map((entity.facts ?? []).map((fact) => [fact.fieldDefinitionId, fact]));
  for (const item of mapped) {
    if (!item.value) {
      empty.push({ param: item.param, label: item.field.label });
      continue;
    }
    const existing = facts.get(item.field.id);
    const same = existing && JSON.stringify(existing.value) === JSON.stringify(item.value);
    rows.push({
      target: `field:${item.field.key}`,
      label: item.field.label,
      current: existing ? shownValue(existing.value, item.field.unit) : null,
      wiki: shownValue(item.value, item.field.unit),
      checked: !same,
      fact: { definition: item.field, value: item.value },
      param: item.param,
    });
  }
  return { rows, unmapped: unmapped.filter((param) => param.text.trim() !== ''), empty };
}

/** The batch's operations, for the operation list of POST /batch. */
type Operation = Record<string, unknown>;

/**
 * The one batch that applies the ticked rows: the description (with the entity's version), the
 * facts (keeping each one's spoiler flag), and a citation per filled target naming the page,
 * its licence and when it was read. Undo takes it all back together.
 */
export function fillOperations(
  kind: EntityKind,
  entity: PanelEntity,
  preview: WikiPreview,
  rows: readonly FillRow[],
): Operation[] {
  const operations: Operation[] = [];
  if (rows.some((row) => row.target === 'description')) {
    operations.push({
      op: 'update',
      kind,
      id: entity.id,
      version: entity.version,
      data: { description: rt.md(preview.lead) },
    });
  }
  const facts = rows.flatMap((row) => (row.fact ? [row.fact] : []));
  if (facts.length > 0) {
    const spoilers = new Map(
      (entity.facts ?? []).map((fact) => [fact.fieldDefinitionId, fact.isSpoiler]),
    );
    operations.push({
      op: 'setFacts',
      id: entity.id,
      data: facts.map(({ definition, value }) => ({
        fieldDefinitionId: definition.id,
        value,
        isSpoiler: spoilers.get(definition.id) ?? false,
      })),
    });
  }
  for (const row of rows) {
    operations.push({
      op: 'addCitation',
      id: entity.id,
      data: {
        target: row.target,
        sourceUrl: preview.url,
        sourceTitle: preview.title,
        license: preview.license,
        retrievedAt: preview.retrievedAt,
      },
    });
  }
  return operations;
}

/** "Filled Gudrun from warhammer40k.fandom.com". */
export function fillDescription(entity: PanelEntity, preview: WikiPreview): string {
  return `Filled ${entity.namePlain} from ${new URL(preview.url).host}`;
}
