import { BookOpen } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import type { SectionProps } from '../types.ts';
import { useWikiSources } from './use-wiki.ts';
import { WikiFillDialog } from './wiki-fill-dialog.tsx';

/**
 * "Fill from wiki…" (M7-T3), in edit mode under the form: opens the dialog that fills the
 * description and facts from a configured wiki's page. Hidden when no wiki is configured.
 */
export function WikiFillSection({ kind, entity, fieldDefinitions }: SectionProps) {
  const sources = useWikiSources().data ?? [];
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;
  return (
    <section>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          setOpen(true);
        }}
      >
        <BookOpen aria-hidden />
        Fill from wiki…
      </Button>
      {open && (
        <WikiFillDialog
          open={open}
          onOpenChange={setOpen}
          kind={kind}
          entity={entity}
          fieldDefinitions={fieldDefinitions}
        />
      )}
    </section>
  );
}
