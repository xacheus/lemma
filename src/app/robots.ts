import type { MetadataRoute } from 'next';

function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return (explicit.startsWith('http') ? explicit : `https://${explicit}`).replace(/\/$/, '');

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '';
  if (vercelHost) return `https://${vercelHost.replace(/\/$/, '')}`;

  return 'http://localhost:3000';
}

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/apartments', '/about', '/contact', '/policies'],
        disallow: ['/admin/', '/account/', '/booking/', '/api/'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
