import { useEditor } from '@/state/editor.ts';
import type { ReadOptions } from './requests.ts';

const VIEWING: ReadOptions = {};
const EDITING: ReadOptions = { includeDrafts: true };

/**
 * What reads ask for in the current mode: drafts only in edit mode (ux.md §2). The objects are
 * constants, so query keys stay stable, and edit mode gets its own cache entries: drafts never
 * linger in view mode after leaving it.
 */
export function useReadOptions(): ReadOptions {
  return useEditor((state) => (state.editing ? EDITING : VIEWING));
}
