import { FieldValue, rt, type ConfigReadOf } from '@ge/domain';
import { useState } from 'react';
import { cn } from '@/lib/utils.ts';
import { INPUT_CLASS } from '../entity-form/fields/field-row.tsx';

type Definition = ConfigReadOf<'field_definitions'>;

/**
 * The input for one fact, chosen by its definition's value type (M7-T1):
 * - **number:** a number, with the definition's unit beside it;
 * - **text:** one line of text (its format, plain or Markdown, is kept);
 * - **date_text:** the date as the universe writes it, and an optional sort key;
 * - **url:** the address and an optional link text.
 * A change is checked against the `FieldValue` schema and handed up on blur or Enter; emptying
 * the main input hands up null, which removes the fact.
 */
export function FactInput({
  definition,
  value,
  onCommit,
}: {
  definition: Definition;
  value: FieldValue | undefined;
  onCommit: (value: FieldValue | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const label = definition.label;
  // Remounts the inputs for a new saved value, which replaces what's typed.
  const revision = JSON.stringify(value ?? null);

  const commit = (next: FieldValue | null) => {
    if (JSON.stringify(next) === JSON.stringify(value ?? null)) return;
    if (next !== null) {
      const result = FieldValue.safeParse(next);
      if (!result.success) {
        setError(result.error.issues[0]?.message ?? 'Not a valid value.');
        return;
      }
    }
    setError(null);
    onCommit(next);
  };
  const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };
  const input = cn(INPUT_CLASS, 'min-w-0 flex-1');

  let inputs: React.ReactNode;
  switch (definition.valueType) {
    case 'number': {
      const shown = value?.type === 'number' ? String(value.number) : '';
      inputs = (
        <>
          <input
            key={revision}
            type="number"
            step="any"
            aria-label={label}
            defaultValue={shown}
            className={input}
            onBlur={(event) => {
              const raw = event.currentTarget.value.trim();
              commit(raw === '' ? null : { type: 'number', number: Number(raw) });
            }}
            onKeyDown={blurOnEnter}
          />
          {definition.unit && (
            <span className="shrink-0 text-muted-foreground">{definition.unit}</span>
          )}
        </>
      );
      break;
    }
    case 'text': {
      const text = value?.type === 'text' ? value.text : undefined;
      inputs = (
        <input
          key={revision}
          type="text"
          aria-label={label}
          defaultValue={text?.source ?? ''}
          className={input}
          onBlur={(event) => {
            const source = event.currentTarget.value.trim();
            commit(
              source === ''
                ? null
                : { type: 'text', text: text ? { ...text, source } : rt.plain(source) },
            );
          }}
          onKeyDown={blurOnEnter}
        />
      );
      break;
    }
    case 'date_text': {
      const date = value?.type === 'date_text' ? value : undefined;
      const read = (form: HTMLElement) => {
        const [textInput, sortInput] = form.querySelectorAll('input');
        const text = textInput?.value.trim() ?? '';
        const sort = sortInput?.value.trim() ?? '';
        if (text === '') return null;
        return {
          type: 'date_text' as const,
          text,
          ...(sort === '' ? {} : { sort: Number(sort) }),
        };
      };
      inputs = (
        <span
          className="flex min-w-0 flex-1 gap-2"
          onBlur={(event) => {
            // Saved once focus leaves both inputs, not when it moves between them.
            if (event.currentTarget.contains(event.relatedTarget)) return;
            commit(read(event.currentTarget));
          }}
        >
          <input
            key={`${revision}-text`}
            type="text"
            aria-label={label}
            placeholder="As the universe writes it"
            defaultValue={date?.text ?? ''}
            className={input}
            onKeyDown={blurOnEnter}
          />
          <input
            key={`${revision}-sort`}
            type="number"
            step="any"
            aria-label={`${label} sort key`}
            placeholder="Sort"
            defaultValue={date?.sort === undefined ? '' : String(date.sort)}
            className={cn(INPUT_CLASS, 'w-20 shrink-0')}
            onKeyDown={blurOnEnter}
          />
        </span>
      );
      break;
    }
    case 'url': {
      const link = value?.type === 'url' ? value : undefined;
      const read = (form: HTMLElement) => {
        const [urlInput, labelInput] = form.querySelectorAll('input');
        const url = urlInput?.value.trim() ?? '';
        const text = labelInput?.value.trim() ?? '';
        if (url === '') return null;
        return { type: 'url' as const, url, ...(text === '' ? {} : { label: text }) };
      };
      inputs = (
        <span
          className="flex min-w-0 flex-1 gap-2"
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            commit(read(event.currentTarget));
          }}
        >
          <input
            key={`${revision}-url`}
            type="url"
            aria-label={label}
            placeholder="https://…"
            defaultValue={link?.url ?? ''}
            className={input}
            onKeyDown={blurOnEnter}
          />
          <input
            key={`${revision}-label`}
            type="text"
            aria-label={`${label} link text`}
            placeholder="Link text"
            defaultValue={link?.label ?? ''}
            className={cn(INPUT_CLASS, 'w-28 shrink-0')}
            onKeyDown={blurOnEnter}
          />
        </span>
      );
      break;
    }
  }
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-2" aria-invalid={error ? true : undefined}>
        {inputs}
      </span>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
