import { ImageIcon } from 'lucide-react';
import type { SectionProps } from '../types.ts';
import { SectionHeading } from './section-heading.tsx';

/** Images: counted only until uploads and the gallery arrive in M3. */
export function ImagesSection({ entity }: SectionProps) {
  const images = entity.images ?? [];
  if (images.length === 0) return null;
  return (
    <section>
      <SectionHeading>Images</SectionHeading>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ImageIcon aria-hidden className="size-4" />
        {images.length === 1 ? '1 image' : `${images.length.toString()} images`}; the gallery
        arrives in M3.
      </p>
    </section>
  );
}
