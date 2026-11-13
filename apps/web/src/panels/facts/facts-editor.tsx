import { entityKinds, type ConfigReadOf, type FieldValue } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import type { SectionProps } from '../types.ts';
import { FactInput } from './fact-input.tsx';
import { saveFact } from './save-fact.ts';

type Definition = ConfigReadOf<'field_definitions'>;

/**
 * The field definitions that apply to an entity (data-model §3.5): its kind's, narrowed by
 * base type and subtype where the definition says so (a celestial object's). Pure, so it's
 * unit-tested; the API checks the same rule on save.
 */
export function definitionsFor(
  kind: string,
  entity: { baseType?: string | null; subtypeId?: string | null },
  definitions: readonly Definition[],
): Definition[] {
  return definitions
    .filter(
      (definition) =>
        definition.appliesToKind === kind &&
        (definition.appliesToBaseType == null ||
          definition.appliesToBaseType === entity.baseType) &&
        (definition.appliesToSubtypeId == null ||
          definition.appliesToSubtypeId === entity.subtypeId),
    )
    .toSorted((a, b) => a.sortKey - b.sortKey);
}

/**
 * The Facts section in edit mode (M7-T1): a row for each field definition that applies, edited
 * with an input for its value type (fact-input.tsx), with a spoiler switch and a clear button
 * once it has a value. Each change saves at once through `/entities/{id}/facts`, one change in
 * the history each. With no definitions yet, it points to the universe settings.
 */
export function FactsEditor({ kind, entity, fieldDefinitions }: SectionProps) {
  const queryClient = useQueryClient();
  const { universeSlug = '' } = useParams();
  // A celestial object's base type and subtype narrow its definitions; other kinds have neither.
  const applying = definitionsFor(
    kind,
    {
      baseType:
        'baseType' in entity && typeof entity.baseType === 'string' ? entity.baseType : null,
      subtypeId:
        'subtypeId' in entity && typeof entity.subtypeId === 'string' ? entity.subtypeId : null,
    },
    fieldDefinitions,
  );
  const facts = new Map((entity.facts ?? []).map((fact) => [fact.fieldDefinitionId, fact]));
  const target = (definition: Definition) => ({
    entityId: entity.id,
    kind,
    fieldDefinitionId: definition.id,
  });
  const description = (definition: Definition, what: string) =>
    `${what} ${definition.label} of “${entity.namePlain}”`;

  if (applying.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No facts are defined for {entityKinds[kind].label.many.toLowerCase()} yet.{' '}
        <Link to={`/u/${universeSlug}/settings`} className="text-primary underline">
          Define them in the universe settings
        </Link>
        .
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {applying.map((definition) => {
        const fact = facts.get(definition.id);
        const save = (value: FieldValue, isSpoiler: boolean, what: string) =>
          void saveFact(
            queryClient,
            target(definition),
            { value, isSpoiler, sortKey: fact?.sortKey ?? null },
            description(definition, what),
          );
        return (
          <li key={definition.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-muted-foreground">{definition.label}</span>
              <FactInput
                definition={definition}
                value={fact?.value}
                onCommit={(value) => {
                  if (value) save(value, fact?.isSpoiler ?? false, fact ? 'Edit' : 'Set');
                  else if (fact) {
                    void saveFact(
                      queryClient,
                      target(definition),
                      null,
                      description(definition, 'Clear'),
                    );
                  }
                }}
              />
              {fact && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Clear ${definition.label}`}
                  onClick={() => {
                    void saveFact(
                      queryClient,
                      target(definition),
                      null,
                      description(definition, 'Clear'),
                    );
                  }}
                >
                  <X aria-hidden />
                </Button>
              )}
            </div>
            {fact && (
              <label className="ml-30 flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={fact.isSpoiler}
                  aria-label={`${definition.label} is a spoiler`}
                  onCheckedChange={(checked) => {
                    save(fact.value, checked, 'Edit');
                  }}
                />
                A spoiler
              </label>
            )}
          </li>
        );
      })}
    </ul>
  );
}
