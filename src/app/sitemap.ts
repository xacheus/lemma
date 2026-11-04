import type { MetadataRoute } from 'next';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';

export const dynamic = 'force-dynamic';

function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return (explicit.startsWith('http') ? explicit : `https://${explicit}`).replace(/\/$/, '');

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '';
  if (vercelHost) return `https://${vercelHost.replace(/\/$/, '')}`;

  return 'http://localhost:3000';
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${origin}/apartments`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${origin}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${origin}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${origin}/policies`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];

  try {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const apartmentRoutes: MetadataRoute.Sitemap = db.apartments
      .filter((apt) => apt.active && !apt.outOfService && apt.publicationStatus !== 'draft')
      .map((apt) => ({
        url: `${origin}/apartments/${encodeURIComponent(apt.slug)}`,
        lastModified: apt.updatedAt ? new Date(apt.updatedAt) : now,
        changeFrequency: 'weekly',
        priority: 0.85,
      }));
    return [...staticRoutes, ...apartmentRoutes];
  } catch {
    return staticRoutes;
  }
}
