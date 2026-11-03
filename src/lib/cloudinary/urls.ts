/**
 * Cloudinary Transformation & Delivery URL Helpers
 * Product environment cloud name: `hpxm6znp`
 *
 * Uses optimized `f_auto,q_auto` transformations:
 * - Thumbnails in listing cards & media tables (`w_600,h_400,c_fill`)
 * - High-resolution on apartment detail pages (`w_1600,c_limit`)
 * - Hero banners (`w_2000,c_limit`)
 * - Profile avatars (`w_160,h_160,c_fill,g_face`)
 */

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
  // Inject transformation right after `/image/upload/` if not already transformed
  const marker = '/image/upload/';
  const idx = src.indexOf(marker);
  if (idx === -1) return src;
  const after = src.slice(idx + marker.length);
  if (/^(f_|q_|c_|w_|h_)/.test(after)) return src;
  return `${src.slice(0, idx + marker.length)}${VARIANT_TRANSFORMS[variant]}/${after}`;
}
