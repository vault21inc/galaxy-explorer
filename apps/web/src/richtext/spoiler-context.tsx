import { HIDE_SPOILERS, type SpoilerPolicy } from '@ge/domain';
import { createContext, useContext, type ReactNode } from 'react';
import { useEditor } from '@/state/editor.ts';
import { useSpoilerPolicy, useSpoilers } from '@/state/spoilers.ts';

interface SpoilerContextValue {
  policy: SpoilerPolicy;
  reveal: (key: string) => void;
  /** Edit mode: spoiler content is shown on a striped background instead (ux.md §6). */
  marked?: boolean;
}

/**
 * The spoiler policy for page text (`<Redactable>`, `RichTextView`). Pages get it from the
 * store through `<SpoilerProvider>`; component tests pass a policy directly.
 */
const SpoilerContext = createContext<SpoilerContextValue>({
  policy: HIDE_SPOILERS,
  reveal: () => undefined,
});

export const SpoilerContextProvider = SpoilerContext.Provider;

export function SpoilerProvider({ children }: { children: ReactNode }) {
  const policy = useSpoilerPolicy();
  const reveal = useSpoilers((state) => state.reveal);
  const marked = useEditor((state) => state.editing);
  return (
    <SpoilerContext.Provider value={{ policy, reveal, marked }}>{children}</SpoilerContext.Provider>
  );
}

export function useSpoilerContext(): SpoilerContextValue {
  return useContext(SpoilerContext);
}
