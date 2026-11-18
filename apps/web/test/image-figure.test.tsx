import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ImageRead } from '../src/api/assets.ts';
import { ImageFigure } from '../src/panels/images/image-figure.tsx';
import { SpoilerContextProvider } from '../src/richtext/spoiler-context.tsx';

/**
 * Animated images in the panel (D-54): the cover plays, the gallery stays still, and either
 * has a button to play or pause. Rendered to static markup, where the reader hasn't asked for
 * reduced motion; the e2e test (images.spec.ts) covers that and pressing the button.
 */

const ID = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b';
const ASSET = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7c';
const media = (name: string) => `/media/u/${ID}/${ASSET}/${name}.webp`;

function image(overrides: { animated?: boolean; isSpoiler?: boolean; role?: 'cover' } = {}) {
  return {
    entityId: ID,
    assetId: ASSET,
    role: overrides.role ?? 'gallery',
    caption: null,
    isSpoiler: overrides.isSpoiler ?? false,
    sortKey: 1,
    asset: {
      width: 480,
      height: 270,
      altText: 'Rocky at work',
      credit: null,
      sourceUrl: null,
      license: null,
      urls: {
        thumb: media('thumb'),
        display: media('display'),
        ...(overrides.animated === false ? {} : { animated: media('animated') }),
      },
    },
  } as ImageRead;
}

function render(read: ImageRead, large = false) {
  return renderToStaticMarkup(
    <SpoilerContextProvider
      value={{
        policy: { showAll: false, revealed: new Set() },
        reveal: () => undefined,
        marked: false,
      }}
    >
      <ImageFigure entityId={ID} image={read} large={large} />
    </SpoilerContextProvider>,
  );
}

describe('ImageFigure, for an animation', () => {
  it('plays as the cover, with a pause button', () => {
    const html = render(image({ role: 'cover' }), true);
    expect(html).toContain(`src="${media('animated')}"`);
    expect(html).toContain('data-animation="playing"');
    expect(html).toContain('aria-label="Pause the animation"');
  });

  it('stays still in the gallery, with a play button', () => {
    const html = render(image());
    expect(html).toContain(`src="${media('thumb')}"`);
    expect(html).toContain('data-animation="paused"');
    expect(html).toContain('aria-label="Play the animation"');
  });

  it('has no button for a still image, or a hidden spoiler', () => {
    for (const html of [
      render(image({ animated: false, role: 'cover' }), true),
      render(image({ isSpoiler: true, role: 'cover' }), true),
    ]) {
      expect(html).not.toContain('the animation');
      expect(html).not.toContain(media('animated'));
    }
  });
});
