import type { FormFieldDef, ImageRole } from '@ge/domain';
import { ImagePlus, X } from 'lucide-react';
import { useState } from 'react';
import { useImageWrites, type Asset, type ImageRead } from '@/api/assets.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { useToasts } from '@/state/toasts.ts';
import { AssetPicker } from '../../images/asset-picker.tsx';
import { changesFor, valueAt } from '../field-path.ts';
import { editDescription, type FieldProps } from '../field-props.ts';
import { FieldRow } from './field-row.tsx';

type ImageRoleDef = Extract<FormFieldDef, { widget: 'imageRole' }>;

/**
 * The one image an entity has in a role (M4-T6), such as a storm's top-down picture
 * (`region_texture`). Choosing an image replaces the one before and sets the setting it goes
 * with (`texture: 'upload'`); Remove takes the image off. The image comes from the library or
 * a new upload, like any other (M3-T7).
 */
export function ImageRoleField({
  field,
  kind,
  record,
  universeId,
  title,
  save,
}: FieldProps<ImageRoleDef>) {
  const writes = useImageWrites(kind ?? 'celestial_object', record.id);
  const [picking, setPicking] = useState(false);
  const role = field.role as ImageRole;
  const images = (record.images ?? []) as ImageRead[];
  const current = images.find((image) => image.role === role);

  const fail = (error: unknown) => {
    const reason = error instanceof Error ? errorMessage(error) : 'unknown error';
    useToasts.getState().show(`Couldn't change the image: ${reason}`, 'error');
  };
  const choose = (assets: readonly Asset[]) => {
    setPicking(false);
    const [asset] = assets;
    if (!asset) return;
    void (async () => {
      try {
        if (current) await writes.detach(current);
        await writes.attach(asset.id, role);
        if (valueAt(record, field.path) !== field.value) {
          await save(
            changesFor(record, field.path, field.value),
            editDescription(title, field.label),
          );
        }
      } catch (error) {
        fail(error);
      }
    })();
  };

  return (
    <FieldRow label={field.label} hint={field.hint}>
      {current?.asset ? (
        <img
          src={current.asset.urls.thumb}
          alt={current.asset.altText ?? ''}
          className="size-10 rounded border object-cover"
        />
      ) : (
        <span className="text-sm text-muted-foreground">None yet</span>
      )}
      <Button
        variant="outline"
        size="xs"
        onClick={() => {
          setPicking(true);
        }}
      >
        <ImagePlus aria-hidden />
        {current ? 'Replace' : 'Choose'}
      </Button>
      {current && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove the ${field.label.toLowerCase()}`}
          onClick={() => {
            writes.detach(current).catch(fail);
          }}
        >
          <X aria-hidden />
        </Button>
      )}
      <AssetPicker
        open={picking}
        universeId={universeId}
        attached={new Set(current ? [current.assetId] : [])}
        onClose={() => {
          setPicking(false);
        }}
        onChoose={choose}
      />
    </FieldRow>
  );
}
