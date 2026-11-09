import { isHidden, spoilerKeys } from '@ge/domain';
import { EyeOff } from 'lucide-react';
import type { ImageRead } from '@/api/assets.ts';
import { cn } from '@/lib/utils.ts';
import { RichTextView } from '@/richtext/rich-text-view.tsx';
import { useSpoilerContext } from '@/richtext/spoiler-context.tsx';

/**
 * One displayed image (ux.md §6, A5): the picture, its caption, and its credit, which is shown
 * wherever an image appears. A hidden spoiler image is blurred heavily under a "Spoiler" chip,
 * without caption or credit (the server's redaction drops them too); clicking it reveals that
 * image only.
 */
export function ImageFigure({
  entityId,
  image,
  large = false,
}: {
  entityId: string;
  image: ImageRead;
  /** The cover: the display size across the panel. Gallery images use the thumbnail. */
  large?: boolean;
}) {
  const { policy, reveal, marked } = useSpoilerContext();
  const key = spoilerKeys.image(entityId, image.assetId, image.role);
  const hidden = isHidden(image.isSpoiler, key, policy);
  const { asset } = image;
  return (
    <figure
      className={cn(
        'flex flex-col gap-1',
        image.isSpoiler && marked && 'spoiler-marked rounded p-1',
      )}
      data-spoiler-marked={image.isSpoiler && marked ? '' : undefined}
    >
      <div className="relative overflow-hidden rounded-md bg-muted">
        <img
          src={large ? asset.urls.display : asset.urls.thumb}
          alt={hidden ? '' : (asset.altText ?? '')}
          width={asset.width}
          height={asset.height}
          loading="lazy"
          className={cn('h-auto w-full object-cover', hidden && 'scale-110 blur-2xl')}
          data-spoiler-hidden={hidden ? '' : undefined}
        />
        {hidden && (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center"
            title="Potential spoiler: click to reveal"
            aria-label="Potential spoiler image, hidden. Reveal it"
            onClick={() => {
              reveal(key);
            }}
          >
            <span className="flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-xs">
              <EyeOff aria-hidden className="size-3" />
              Spoiler
            </span>
          </button>
        )}
      </div>
      {!hidden && image.caption && image.caption.source.trim() !== '' && (
        <figcaption className="text-xs">
          <RichTextView value={image.caption} fieldKey={`${key}/caption`} inline />
        </figcaption>
      )}
      {!hidden && asset.credit && (
        <Credit credit={asset.credit} sourceUrl={asset.sourceUrl} license={asset.license} />
      )}
    </figure>
  );
}

/** "© Ana · CC BY 4.0", linking to the source when there is one. */
export function Credit({
  credit,
  sourceUrl,
  license,
}: {
  credit: string;
  sourceUrl: string | null;
  license: string | null;
}) {
  const text = license ? `${credit} · ${license}` : credit;
  return (
    <p className="text-[11px] leading-tight text-muted-foreground" data-image-credit="">
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="underline-offset-2 hover:underline"
        >
          {text}
        </a>
      ) : (
        text
      )}
    </p>
  );
}
