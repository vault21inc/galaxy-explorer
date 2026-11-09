import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderText } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { TextEditorHandle } from './text-editor-handle.ts';

export interface CodeEditorProps {
  initial: string;
  language: 'markdown' | 'html';
  /** The accessible name of the editing area. */
  label: string;
  placeholder?: string;
  onChange: (source: string) => void;
  handleRef: Ref<TextEditorHandle>;
}

/**
 * CodeMirror 6 for Markdown and HTML fields (ux.md §8), with syntax highlighting. CodeMirror
 * owns its text: the field starts it with `initial` and hears every change through
 * `onChange`. A new saved value from the server remounts the editor (the form keys fields by
 * value), so there is no syncing in both directions. Loaded lazily: readers never download it.
 */
export default function CodeEditor({
  initial,
  language,
  label,
  placeholder,
  onChange,
  handleRef,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // CodeMirror's listener is set up once, so it reads the latest callback from here.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          language === 'markdown' ? markdown({ base: markdownLanguage }) : html(),
          syntaxHighlighting(HIGHLIGHT),
          EditorView.lineWrapping,
          EDITOR_THEME,
          EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true' }),
          ...(placeholder ? [placeholderText(placeholder)] : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The editor is built once per mount; the form remounts it for a new saved value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    handleRef,
    () => ({
      selection: () => {
        const main = view.current?.state.selection.main;
        return { from: main?.from ?? 0, to: main?.to ?? 0 };
      },
      apply: (edit) => {
        const editor = view.current;
        if (!editor) return;
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: edit.source },
          selection: EditorSelection.range(edit.selection.from, edit.selection.to),
        });
        editor.focus();
      },
      focus: () => {
        view.current?.focus();
      },
    }),
    [],
  );

  return <div ref={host} data-code-editor={language} />;
}

/** Colors from the app's theme variables, so the editor matches light and dark (ux.md §11). */
const HIGHLIGHT = HighlightStyle.define([
  { tag: [tags.heading, tags.strong], fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--primary)' },
  { tag: [tags.tagName, tags.angleBracket], color: 'var(--primary)' },
  { tag: [tags.attributeName, tags.quote], color: 'var(--muted-foreground)' },
  { tag: [tags.processingInstruction, tags.meta, tags.comment], color: 'var(--muted-foreground)' },
]);

const EDITOR_THEME = EditorView.theme({
  '&': {
    fontSize: '0.875rem',
    border: '1px solid var(--input)',
    borderRadius: 'calc(var(--radius) - 2px)',
    backgroundColor: 'transparent',
  },
  '&.cm-focused': { outline: 'none', borderColor: 'var(--ring)' },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    minHeight: '4.5rem',
    padding: '0.375rem 0',
    caretColor: 'var(--foreground)',
  },
  '.cm-line': { padding: '0 0.5rem' },
  '.cm-scroller': { maxHeight: '18rem', overflow: 'auto' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 30%, transparent)',
  },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
});
