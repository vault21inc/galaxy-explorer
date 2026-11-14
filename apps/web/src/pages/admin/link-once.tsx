import { ShownOnce } from '@/app/shown-once.tsx';

/**
 * An invite or reset link, shown once (M8-T13, ux.md §13): the API keeps only its hash, so this
 * is the only time anyone sees it.
 */
export function LinkOnce({ url, label }: { url: string; label: string }) {
  return (
    <ShownOnce
      value={url}
      label={label}
      note="It’s shown only now: copy it and pass it on. It works once."
      testId="link-once"
    />
  );
}
