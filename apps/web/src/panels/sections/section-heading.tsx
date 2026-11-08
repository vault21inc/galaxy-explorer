import type { ReactNode } from 'react';

/** A section's heading: small, uppercase, muted (ux.md §11). */
export function SectionHeading({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 text-xs text-muted-foreground label-caps">{children}</h3>;
}
