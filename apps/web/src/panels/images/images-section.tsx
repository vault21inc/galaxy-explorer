import { lazy, Suspense } from 'react';
import { useEditor } from '@/state/editor.ts';
import type { SectionProps } from '../types.ts';
import { ImageFigure } from './image-figure.tsx';

// The editor (and its picker) only in edit mode.
const ImagesEditor = lazy(() => import('./images-editor.tsx'));

/**
 * The Images section (M3-T7): the cover across the panel, then the gallery two to a row, each
 * with its credit. When reading it sits under the name, above the text, so it needs no
 * heading. In edit mode, the editor: add, caption, credit, cover, spoiler, remove.
 */
export function ImagesSection(props: SectionProps) {
  const editing = useEditor((state) => state.editing);
  if (editing) {
    return (
      <Suspense fallback={null}>
        <ImagesEditor {...props} />
      </Suspense>
    );
  }
  const images = props.entity.images ?? [];
  // Redacted images arrive without their asset (spoilers=exclude); there's nothing to draw.
  const drawable = images.filter((image) => 'asset' in image);
  if (drawable.length === 0) return null;
  const cover = drawable.find((image) => image.role === 'cover');
  const gallery = drawable.filter((image) => image.role === 'gallery');
  return (
    <section aria-label="Images">
      <div className="flex flex-col gap-3">
        {cover && <ImageFigure entityId={props.entity.id} image={cover} large />}
        {gallery.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {gallery.map((image) => (
              <ImageFigure
                key={`${image.assetId}/${image.role}`}
                entityId={props.entity.id}
                image={image}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
