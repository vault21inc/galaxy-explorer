import { useId, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input.tsx';

/**
 * A username field that offers names as you type (D-59): the browser's own suggestion list
 * (`<datalist>`), which filters as you type, works with the keyboard and screen readers, and
 * on phones shows above the keyboard. Any name can still be typed; the API says if it's wrong.
 * The names come from the API, which offers only those the person could already see.
 */
export function UsernameInput({
  suggestions,
  ...props
}: ComponentProps<'input'> & { suggestions: readonly string[] }) {
  const listId = useId();
  return (
    <>
      <Input
        autoComplete="off"
        maxLength={32}
        {...props}
        {...(suggestions.length > 0 ? { list: listId } : {})}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}
    </>
  );
}
