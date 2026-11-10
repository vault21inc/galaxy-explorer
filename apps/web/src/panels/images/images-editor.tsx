import { spoilerKeys } from '@ge/domain';
import { ImagePlus, Star, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useImageWrites, type Asset, type ImageRead } from '@/api/assets.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { RichTextEditor } from '@/richtext/editor/rich-text-editor.tsx';
import { useToasts } from '@/state/toasts.ts';
import { valueKey } from '../entity-form/field-path.ts';
import { SectionHeading } from '../sections/section-heading.tsx';
import type { SectionProps } from '../types.ts';
import { AssetPicker } from './asset-picker.tsx';

/** Shows a failed write as a toast; each write is otherwise silent. */
function attempt(work: Promise<unknown>, what: string) {
  work.catch((error: unknown) => {
    const reason = error instanceof Error ? errorMessage(error) : 'unknown error';
    useToasts.getState().show(`Couldn't ${what}: ${reason}`, 'error');
  });
}

/**
 * The Images section in edit mode (M3-T7): add images from the library or by uploading, and for
 * each one its caption, the asset's credit and alt text (shared by every entity using the
 * image), the cover role, the spoiler flag, and Remove. The first image added is the cover.
 */
export default function ImagesEditor({ kind, entity }: SectionProps) {
  // The gallery and its cover; images in other roles, such as a storm's picture, have their own
  // field in the form (M4-T6).
  const images = (entity.images ?? []).filter(
    (image) => image.role === 'gallery' || image.role === 'cover',
  );
  const writes = useImageWrites(kind, entity.id);
  const [picking, setPicking] = useState(false);
  const cover = images.find((image) => image.role === 'cover');

  const add = (assets: readonly Asset[]) => {
    setPicking(false);
    attempt(
      (async () => {
        let hasCover = cover !== undefined;
        for (const asset of assets) {
          await writes.attach(asset.id, hasCover ? 'gallery' : 'cover');
          hasCover = true;
        }
      })(),
      'add the image',
    );
  };
  const makeCover = (image: ImageRead) => {
    attempt(
      (async () => {
        // One cover per entity: the old one goes back to the gallery first.
        if (cover) await writes.update(cover, { role: 'gallery' });
        await writes.update(image, { role: 'cover' });
      })(),
      'change the cover',
    );
  };

  return (
    <section aria-label="Images">
      <div className="flex items-center justify-between">
        <SectionHeading>Images</SectionHeading>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setPicking(true);
          }}
        >
          <ImagePlus aria-hidden />
          Add image
        </Button>
      </div>
      {images.length > 0 && (
        <ul className="flex flex-col gap-3">
          {images.map((image) => (
            <ImageRow
              key={`${image.assetId}/${image.role}`}
              entityId={entity.id}
              image={image}
              writes={writes}
              onMakeCover={() => {
                makeCover(image);
              }}
            />
          ))}
        </ul>
      )}
      <AssetPicker
        open={picking}
        universeId={entity.universeId}
        attached={new Set(images.map((image) => image.assetId))}
        onClose={() => {
          setPicking(false);
        }}
        onChoose={add}
      />
    </section>
  );
}

function ImageRow({
  entityId,
  image,
  writes,
  onMakeCover,
}: {
  entityId: string;
  image: ImageRead;
  writes: ReturnType<typeof useImageWrites>;
  onMakeCover: () => void;
}) {
  const id = useId();
  const { asset } = image;
  const isCover = image.role === 'cover';
  const describe = (field: 'credit' | 'altText', raw: string) => {
    const value = raw.trim() === '' ? null : raw.trim();
    if (value === asset[field]) return;
    attempt(writes.describe(image.assetId, { [field]: value }), 'save the image details');
  };
  const label = isCover ? 'Cover image' : 'Image';
  return (
    <li aria-label={label} className="flex gap-2 rounded-md border p-2">
      <img
        src={asset.urls.thumb}
        alt={asset.altText ?? ''}
        className="size-20 shrink-0 rounded object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <MetadataInput
          id={`${id}-credit`}
          label="Credit"
          value={asset.credit}
          placeholder="Who made it"
          onCommit={(raw) => {
            describe('credit', raw);
          }}
        />
        <MetadataInput
          id={`${id}-alt`}
          label="Alt text"
          value={asset.altText}
          placeholder="What it shows"
          onCommit={(raw) => {
            describe('altText', raw);
          }}
        />
        <RichTextEditor
          key={valueKey(image.caption, 0)}
          label="Caption"
          value={image.caption}
          singleLine
          compact
          nullable
          fieldKey={`${spoilerKeys.image(entityId, image.assetId, image.role)}/caption`}
          onCommit={(caption) => {
            attempt(writes.update(image, { caption }), 'save the caption');
          }}
        />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              aria-label="Image is a spoiler"
              checked={image.isSpoiler}
              onCheckedChange={(isSpoiler) => {
                attempt(writes.update(image, { isSpoiler }), 'change the spoiler flag');
              }}
            />
            Spoiler
          </label>
          <Button
            variant={isCover ? 'secondary' : 'ghost'}
            size="xs"
            aria-pressed={isCover}
            title={
              isCover
                ? 'The cover: shown first, across the panel'
                : 'Show it first, across the panel'
            }
            onClick={() => {
              if (isCover) attempt(writes.update(image, { role: 'gallery' }), 'change the cover');
              else onMakeCover();
            }}
          >
            <Star aria-hidden />
            Cover
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label="Remove image"
            title="Remove from this entry (the image stays in the library)"
            onClick={() => {
              attempt(writes.detach(image), 'remove the image');
            }}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
    </li>
  );
}

/** A credit or alt-text field: saved when focus leaves it (or on Enter), if it changed. */
function MetadataInput({
  id,
  label,
  value,
  placeholder,
  onCommit,
}: {
  id: string;
  label: string;
  value: string | null;
  placeholder: string;
  onCommit: (raw: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-16 shrink-0 text-xs text-muted-foreground">
        {label}
      </label>
      <input
        // A newly saved value replaces what's typed.
        key={valueKey(value, 0)}
        id={id}
        defaultValue={value ?? ''}
        placeholder={placeholder}
        maxLength={label === 'Credit' ? 500 : 1_000}
        className="h-7 w-full min-w-0 rounded-md border border-input bg-transparent px-1.5 text-sm focus-visible:border-ring focus-visible:outline-none"
        onBlur={(event) => {
          onCommit(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </div>
  );
}
