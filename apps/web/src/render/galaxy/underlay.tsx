import type { Underlay } from '@ge/domain';
import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { DoubleSide, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { useAsset } from '@/api/assets.ts';

/** What the underlay draws, for the test hooks; null while it isn't drawn. */
let drawn: (Underlay & { assetId: string }) | null = null;
export function underlayState() {
  return drawn;
}

/**
 * The reference underlay (G1, M3-T8): an uploaded image lying in the galactic plane, under
 * everything else, for tracing positions in edit mode. It's drawn first (render order -10),
 * without depth testing or writing, so whatever is drawn after it (the disc, the stars, the
 * objects) lands on top, and it never hides anything.
 *
 * `widthLy` is the image's width in the galaxy; its height follows the image's proportions.
 * The plane is rotated about the vertical axis by `rotationDeg` and moved by the offsets.
 */
export function UnderlayImage({ underlay, assetId }: { underlay: Underlay; assetId: string }) {
  const invalidate = useThree((state) => state.invalidate);
  const asset = useAsset(assetId);
  const url = asset.data?.urls.display;
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    if (!url) return;
    let current = true;
    let loaded: Texture | null = null;
    new TextureLoader().load(url, (result) => {
      // Uploads are ordinary sRGB images; three.js converts them to linear light to draw.
      result.colorSpace = SRGBColorSpace;
      loaded = result;
      if (current) {
        setTexture(result);
        invalidate();
      } else {
        result.dispose();
      }
    });
    return () => {
      current = false;
      loaded?.dispose();
      setTexture(null);
    };
  }, [url, invalidate]);

  useEffect(() => {
    drawn = texture ? { ...underlay, assetId } : null;
    invalidate();
  }, [texture, underlay, assetId, invalidate]);
  useEffect(
    () => () => {
      drawn = null;
    },
    [],
  );

  if (!texture || !asset.data) return null;
  const heightLy = (underlay.widthLy * asset.data.height) / asset.data.width;
  return (
    // The group turns about the vertical (Y) axis; inside it, the plane (made upright in X/Y)
    // is laid flat by -90° about X, like the disc.
    <group
      position={[underlay.offsetX, 0, underlay.offsetZ]}
      rotation-y={(underlay.rotationDeg * Math.PI) / 180}
    >
      <mesh rotation-x={-Math.PI / 2} renderOrder={-10}>
        <planeGeometry args={[underlay.widthLy, heightLy]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={underlay.opacity}
          depthTest={false}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
