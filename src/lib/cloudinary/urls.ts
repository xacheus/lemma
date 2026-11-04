/** Delivery helpers for Cloudinary uploads and the representative stock gallery. */
export const DEFAULT_CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'hpxm6znp';

export type ImageVariant = 'thumbnail' | 'card' | 'detail' | 'hero' | 'avatar' | 'original';

const VARIANT_TRANSFORMS: Record<Exclude<ImageVariant, 'original'>, string> = {
  thumbnail: 'f_auto,q_auto,c_fill,g_auto,w_360,h_240',
  card: 'f_auto,q_auto,c_fill,g_auto,w_720,h_460',
  detail: 'f_auto,q_auto,c_limit,w_1600',
  hero: 'f_auto,q_auto,c_limit,w_2000',
  avatar: 'f_auto,q_auto,c_fill,g_face,w_160,h_160',
};

export function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes('res.cloudinary.com/');
}

export function cloudinaryUrlFromPublicId(
  publicId: string,
  variant: ImageVariant = 'detail',
  cloudName = DEFAULT_CLOUDINARY_CLOUD_NAME,
): string {
  const cleanId = publicId.replace(/^\/+/, '');
  if (variant === 'original') {
    return `https://res.cloudinary.com/${cloudName}/image/upload/${cleanId}`;
  }
  return `https://res.cloudinary.com/${cloudName}/image/upload/${VARIANT_TRANSFORMS[variant]}/${cleanId}`;
}

export function optimizeImageUrl(
  src: string | null | undefined,
  variant: ImageVariant = 'card',
): string {
  if (!src) return '';
  if (variant === 'original' || !isCloudinaryUrl(src)) return src;
  const marker = '/image/upload/';
  const idx = src.indexOf(marker);
  if (idx === -1) return src;
  const after = src.slice(idx + marker.length);
  if (/^(f_|q_|c_|w_|h_)/.test(after)) return src;
  return `${src.slice(0, idx + marker.length)}${VARIANT_TRANSFORMS[variant]}/${after}`;
}

/** Photo paths are the local fallbacks; the CDN provides a sharper copy when online.
 * Sources and reuse terms are documented in docs/PHOTOGRAPHY.md. */
const REPRESENTATIVE_PHOTOS: Record<string, string> = {
  '/images/apartments/apt-01/01.jpg': '26571206/pexels-photo-26571206/free-photo-of-interior-design-of-living-room-and-kitchen.jpeg',
  '/images/apartments/apt-01/02.jpg': '7166561/pexels-photo-7166561.jpeg',
  '/images/apartments/apt-01/03.jpg': '6447393/pexels-photo-6447393.jpeg',
  '/images/apartments/apt-01/04.jpg': '7512042/pexels-photo-7512042.jpeg',
  '/images/apartments/apt-01/05.jpg': '6207941/pexels-photo-6207941.jpeg',
  '/images/apartments/apt-01/06.jpg': '23985794/pexels-photo-23985794/free-photo-of-interior-design-of-bathroom.jpeg',
  '/images/apartments/apt-02/01.jpg': '6489119/pexels-photo-6489119.jpeg',
  '/images/apartments/apt-02/02.jpg': '29252557/pexels-photo-29252557/free-photo-of-cozy-bedroom-interior-with-natural-light.jpeg',
  '/images/apartments/apt-02/03.jpg': '7533919/pexels-photo-7533919.jpeg',
  '/images/apartments/apt-02/04.jpg': '7147294/pexels-photo-7147294.jpeg',
  '/images/apartments/apt-02/05.jpg': '7587806/pexels-photo-7587806.jpeg',
  '/images/apartments/apt-02/06.jpg': '7534295/pexels-photo-7534295.jpeg',
  '/images/apartments/apt-03/01.jpg': '6585598/pexels-photo-6585598.jpeg',
  '/images/apartments/apt-03/02.jpg': '7195856/pexels-photo-7195856.jpeg',
  '/images/apartments/apt-03/03.jpg': '10099254/pexels-photo-10099254.jpeg',
  '/images/apartments/apt-03/04.jpg': '29252560/pexels-photo-29252560/free-photo-of-cozy-minimalist-bedroom-with-natural-light.jpeg',
  '/images/apartments/apt-03/05.jpg': '6265836/pexels-photo-6265836.jpeg',
  '/images/apartments/apt-03/06.jpg': '20534251/pexels-photo-20534251/free-photo-of-interior-of-bathroom-in-house.jpeg',
};

export function isRepresentativeImage(url: string | null | undefined): boolean {
  return Boolean(url && REPRESENTATIVE_PHOTOS[url]);
}

export function representativePhotoUrl(url: string | null | undefined, variant: ImageVariant): string | null {
  const file = url && REPRESENTATIVE_PHOTOS[url];
  if (!file) return null;
  const width = variant === 'hero' ? 2000 : variant === 'detail' ? 1600 : variant === 'thumbnail' ? 360 : 800;
  return `https://images.pexels.com/photos/${file}?auto=compress&cs=tinysrgb&w=${width}`;
}
