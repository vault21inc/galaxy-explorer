import { isHidden, redactionBar } from '@ge/domain';
import { EyeOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.ts';
import { useSpoilerContext } from './spoiler-context.tsx';

interface RedactableProps {
  /** Whether the item is flagged as a potential spoiler. */
  flagged: boolean;
  /** Its `spoilerKeys` key: what a click reveals. */
  revealKey: string;
  /** The hidden text, only to size the bar (ux.md §6: "about the length of the hidden text"). */
  hiddenText: string;
  /** Block content (a whole paragraph or field) rather than words inside a sentence. */
  block?: boolean;
  children: ReactNode;
}

/**
 * Hidden spoiler content (ux.md §6): a black bar about as long as the text it hides. Clicking
 * it, or pressing Enter or Space on it, reveals that item only, until the page reloads. Shown
 * spoiler content carries a small eye-slash marker, so readers know it was flagged.
 */
export function Redactable({ flagged, revealKey, hiddenText, block, children }: RedactableProps) {
  const { policy, reveal } = useSpoilerContext();
  if (!flagged) return <>{children}</>;
  if (isHidden(true, revealKey, policy)) {
    const Wrapper = block ? 'div' : 'span';
    return (
      <Wrapper>
        <button
          type="button"
          className={cn(
            'cursor-pointer rounded-[2px] bg-foreground/80 align-baseline leading-none text-transparent',
            'hover:bg-foreground focus-visible:outline-2 focus-visible:outline-ring',
            '[font-family:inherit] select-none',
            // A row of ▇ is one unbreakable word; let a long bar wrap inside the panel.
            'max-w-full text-left break-all whitespace-normal',
          )}
          title="Potential spoiler: click to reveal"
          aria-label="Potential spoiler, hidden. Reveal it"
          data-spoiler-key={revealKey}
          onClick={() => {
            reveal(revealKey);
          }}
        >
          {redactionBar(hiddenText)}
        </button>
      </Wrapper>
    );
  }
  const marker = (
    <EyeOff
      aria-label="Flagged as a potential spoiler"
      role="img"
      className="mx-0.5 inline size-3 align-baseline text-muted-foreground"
    />
  );
  return block ? (
    <div className="relative">
      {children}
      <span className="absolute -top-0.5 -right-1">{marker}</span>
    </div>
  ) : (
    <>
      {children}
      {marker}
    </>
  );
}
