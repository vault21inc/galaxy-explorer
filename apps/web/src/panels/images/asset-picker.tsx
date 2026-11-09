import { Upload } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { uploadAsset, useAssetLibrary, type Asset } from '@/api/assets.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { cn } from '@/lib/utils.ts';

/** What the file input offers; the server checks the real type anyway. */
const ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/gif';

/**
 * Choosing an image to add (M3-T7): the universe's library, newest first, or new files dropped
 * on the dialog or chosen with Upload. Uploaded files are added straight away; the same file
 * twice is the same asset, so nothing is stored twice.
 */
export function AssetPicker({
  open,
  universeId,
  attached,
  onClose,
  onChoose,
}: {
  open: boolean;
  universeId: string;
  /** Assets the entity shows already; they can't be added twice. */
  attached: ReadonlySet<string>;
  onClose: () => void;
  onChoose: (assets: readonly Asset[]) => void;
}) {
  // Once something is chosen, focus mustn't jump back to "Add image" when the dialog finishes
  // closing: by then the new image's fields may be in use.
  const chose = useRef(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {open && (
        <DialogContent
          className="sm:max-w-2xl"
          onCloseAutoFocus={(event) => {
            if (chose.current) event.preventDefault();
            chose.current = false;
          }}
        >
          <DialogHeader>
            <DialogTitle>Add an image</DialogTitle>
            <DialogDescription>
              Pick one of this universe’s images, or drop image files here to upload them.
            </DialogDescription>
          </DialogHeader>
          <PickerBody
            universeId={universeId}
            attached={attached}
            onChoose={(assets) => {
              chose.current = true;
              onChoose(assets);
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function PickerBody({
  universeId,
  attached,
  onChoose,
}: {
  universeId: string;
  attached: ReadonlySet<string>;
  onChoose: (assets: readonly Asset[]) => void;
}) {
  const library = useAssetLibrary(universeId);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: readonly File[]) => {
    if (files.length === 0) return;
    setError(null);
    setUploading(files.length);
    try {
      // One at a time: each is its own change, in the order chosen.
      const uploaded: Asset[] = [];
      for (const file of files) uploaded.push(await uploadAsset(universeId, file));
      onChoose(uploaded);
    } catch (failure) {
      setError(failure instanceof Error ? errorMessage(failure) : 'The upload failed.');
    } finally {
      setUploading(0);
    }
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void upload([...event.dataTransfer.files]);
  };

  const assets = library.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-md border border-dashed p-3',
        dragging ? 'border-primary bg-primary/5' : 'border-transparent',
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={onDrop}
      data-testid="asset-drop-zone"
    >
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm" disabled={uploading > 0}>
          <label className="cursor-pointer">
            <Upload aria-hidden />
            Upload images
            <input
              type="file"
              accept={ACCEPT}
              multiple
              aria-label="Upload images"
              className="sr-only"
              onChange={(event) => {
                void upload([...(event.currentTarget.files ?? [])]);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </Button>
        <p role="status" className="text-xs text-muted-foreground">
          {uploading > 0
            ? `Uploading ${uploading === 1 ? 'an image' : `${uploading.toString()} images`}…`
            : 'PNG, JPEG, WebP, AVIF or GIF, up to 25 MB.'}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {library.error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(library.error)}
        </p>
      ) : !library.data ? (
        <p className="text-sm text-muted-foreground">Loading the library…</p>
      ) : assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No images in this universe yet.</p>
      ) : (
        <ul aria-label="Image library" className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto">
          {assets.map((asset) => {
            const name = asset.originalFilename ?? 'image';
            const used = attached.has(asset.id);
            return (
              <li key={asset.id}>
                <button
                  type="button"
                  disabled={used}
                  title={used ? `${name} (already added)` : name}
                  aria-label={used ? `${name}, already added` : `Add ${name}`}
                  className="block w-full overflow-hidden rounded-md border hover:border-ring disabled:opacity-40"
                  onClick={() => {
                    onChoose([asset]);
                  }}
                >
                  <img
                    src={asset.urls.thumb}
                    alt={asset.altText ?? ''}
                    className="aspect-square w-full object-cover"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {library.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          disabled={library.isFetchingNextPage}
          onClick={() => {
            void library.fetchNextPage();
          }}
        >
          Show more
        </Button>
      )}
    </div>
  );
}
