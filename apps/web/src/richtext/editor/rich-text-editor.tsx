import { RICH_TEXT_FORMATS, type RichText, type RichTextFormat } from '@ge/domain';
import { Eye, EyeOff } from 'lucide-react';
import { lazy, Suspense, useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { cn } from '@/lib/utils.ts';
import { RichTextView } from '../rich-text-view.tsx';
import { markSpoiler } from './spoiler-wrap.ts';
import { nativeHandle, type TextEditorHandle } from './text-editor-handle.ts';

// CodeMirror with its Markdown and HTML modes is about 170 kB gzipped: loaded only when a
// Markdown or HTML field is edited, never by readers.
const CodeEditor = lazy(() => import('./code-editor.tsx'));

const FORMAT_LABELS: Record<RichTextFormat, string> = {
  plain: 'Plain',
  markdown: 'Markdown',
  html: 'HTML',
};

export interface RichTextEditorProps {
  label: string;
  /** The saved value; the editor starts from it (remount it for a new one). */
  value: RichText | null;
  /** Names: a one-line input, and the text can't be empty. */
  singleLine?: boolean;
  /** A one-line field in ordinary text (captions), not the large name style. */
  compact?: boolean;
  /** Clearing the text saves null (summaries and descriptions). */
  nullable?: boolean;
  /** The spoiler key the preview uses (`spoilerKeys.field`). */
  fieldKey: string;
  hint?: string;
  /** Focus the text and select it all on mount (a just-created object's name). */
  autoFocus?: boolean;
  /** Called when focus leaves the field with a changed value. */
  onCommit: (next: RichText | null) => void;
}

/**
 * One rich-text field in the editor (ux.md §8):
 *
 * - a **format menu** (Plain, Markdown, HTML). Switching keeps the text as written and warns
 *   that formatting may not carry over;
 * - the **editor**: a one-line input for names, a textarea for plain text, CodeMirror 6 for
 *   Markdown and HTML;
 * - **Mark as spoiler**, which wraps the selection (`||…||` or `<span data-spoiler>…`), and a
 *   **Spoiler** switch for the whole field;
 * - a **Preview** toggle that shows the rendered text.
 *
 * Everything is a local draft until focus leaves the whole field, which saves it once.
 */
export function RichTextEditor({
  label,
  value,
  singleLine = false,
  compact = false,
  nullable = false,
  fieldKey,
  hint,
  autoFocus = false,
  onCommit,
}: RichTextEditorProps) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<TextEditorHandle | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const skipCommit = useRef(false);
  const initial: RichText = value ?? {
    format: singleLine ? 'plain' : 'markdown',
    source: '',
    spoiler: false,
  };
  const [draft, setDraftState] = useState<RichText>(initial);
  // The latest draft, readable at once. Saving reads this, not `draft`: a click that ends
  // editing right after a change (Mark as spoiler, then Done) can arrive before React has
  // re-rendered with it, and the blur handler would otherwise save the text before the change.
  const latest = useRef<RichText>(initial);
  const setDraft = (next: RichText | ((current: RichText) => RichText)) => {
    latest.current = typeof next === 'function' ? next(latest.current) : next;
    setDraftState(latest.current);
  };
  const [preview, setPreview] = useState(false);
  const [formatChanged, setFormatChanged] = useState(false);

  useEffect(() => {
    if (!autoFocus || !input.current) return;
    input.current.focus();
    input.current.select();
  }, [autoFocus]);

  const setSource = (source: string) => {
    setDraft((current) => ({ ...current, source }));
  };

  // What was last handed to onCommit, so the same edit is never saved twice.
  const sent = useRef<RichText | null>(value);
  const commit = () => {
    const current = latest.current;
    const source = singleLine ? current.source.trim() : current.source;
    if (source.trim() === '' && !nullable) {
      // A name can't be empty: put the saved one back.
      setDraft(initial);
      return;
    }
    const next = source.trim() === '' ? null : { ...current, source };
    if (sameRichText(next, sent.current)) return;
    sent.current = next;
    onCommit(next);
  };

  // Also save when the field goes away with an edit in it: clicking the canvas can deselect
  // the object (closing the panel) without moving focus, because the camera controls keep
  // the press to themselves.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });
  useEffect(
    () => () => {
      commitRef.current();
    },
    [],
  );

  // Saves when focus moves out of the field, not between its own controls.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (container.current?.contains(event.relatedTarget)) return;
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    commit();
  };

  const canMark = draft.format !== 'plain' && !preview;
  const mark = () => {
    const current = latest.current;
    if (!handle.current || current.format === 'plain') return;
    handle.current.apply(markSpoiler(current.source, handle.current.selection(), current.format));
  };

  return (
    <div
      ref={container}
      role="group"
      // Not the label itself: that names the text input, which tests and screen readers find
      // by "Name" alone.
      aria-label={`${label} field`}
      className={cn('flex flex-col gap-1', draft.spoiler && 'spoiler-marked rounded')}
      onBlur={onBlur}
    >
      <div className="flex flex-wrap items-center gap-1">
        <label htmlFor={id} className="text-xs text-muted-foreground label-caps">
          {label}
        </label>
        <div className="ml-auto flex items-center gap-1">
          <select
            aria-label={`${label} format`}
            value={draft.format}
            className="h-6 rounded border border-input bg-transparent px-1 text-xs"
            onChange={(event) => {
              const format = event.currentTarget.value as RichTextFormat;
              setDraft((current) => ({ ...current, format }));
              setFormatChanged(draft.source.trim() !== '');
            }}
          >
            {RICH_TEXT_FORMATS.map((format) => (
              <option key={format} value={format}>
                {FORMAT_LABELS[format]}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Mark as spoiler in ${label}`}
            title={
              draft.format === 'plain'
                ? 'Plain text has only whole-field spoilers'
                : 'Mark as spoiler: hide the selected text'
            }
            disabled={!canMark}
            // Keep the focus (and the selection) in the editor while pressing.
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={mark}
          >
            <EyeOff />
          </Button>
          <Button
            type="button"
            variant={preview ? 'secondary' : 'ghost'}
            size="icon-xs"
            aria-label={`Preview ${label}`}
            aria-pressed={preview}
            title="Preview"
            onClick={() => {
              setPreview((shown) => !shown);
            }}
          >
            <Eye />
          </Button>
          <label className="flex items-center gap-1 pl-1 text-xs text-muted-foreground">
            <Switch
              aria-label={`${label} is a spoiler`}
              checked={draft.spoiler}
              onCheckedChange={(spoiler) => {
                setDraft((current) => ({ ...current, spoiler }));
              }}
            />
            Spoiler
          </label>
        </div>
      </div>

      {preview ? (
        <div className="min-h-8 rounded-md border border-input px-2 py-1.5" data-preview="">
          <RichTextView value={draft} fieldKey={fieldKey} inline={singleLine} />
        </div>
      ) : singleLine ? (
        <input
          id={id}
          ref={(element) => {
            input.current = element;
            handle.current = element ? nativeHandle(element, setSource) : null;
          }}
          value={draft.source}
          maxLength={2_000}
          className={cn(
            'w-full rounded-md border bg-transparent px-1 py-0.5 focus-visible:border-ring focus-visible:outline-none',
            compact
              ? 'h-7 border-input px-1.5 text-sm'
              : 'border-transparent text-lg font-semibold hover:border-input',
          )}
          onChange={(event) => {
            setSource(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              skipCommit.current = true;
              setDraft(initial);
              event.currentTarget.blur();
            }
          }}
        />
      ) : draft.format === 'plain' ? (
        <textarea
          id={id}
          ref={(element) => {
            handle.current = element ? nativeHandle(element, setSource) : null;
          }}
          value={draft.source}
          rows={3}
          className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus-visible:border-ring focus-visible:outline-none"
          onChange={(event) => {
            setSource(event.currentTarget.value);
          }}
        />
      ) : (
        <Suspense
          fallback={<div className="h-[4.5rem] rounded-md border border-input" aria-busy />}
        >
          <CodeEditor
            // A new language is a new editor.
            key={draft.format}
            initial={draft.source}
            language={draft.format}
            label={label}
            onChange={setSource}
            handleRef={handle}
          />
        </Suspense>
      )}

      {formatChanged && (
        <p className="text-xs text-muted-foreground">
          The text is kept as written; its formatting may not carry over to{' '}
          {FORMAT_LABELS[draft.format]}.
        </p>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function sameRichText(a: RichText | null, b: RichText | null): boolean {
  if (a === null || b === null) return a === b;
  return a.format === b.format && a.source === b.source && a.spoiler === b.spoiler;
}
