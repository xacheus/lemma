import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * The canonical origin, used for absolute URLs in metadata and OG tags.
 *
 * Order matters: an explicit domain wins, then whatever host Vercel is actually
 * serving. `VERCEL_PROJECT_PRODUCTION_URL` is the stable production domain and is
 * preferred over `VERCEL_URL`, which is the per-deployment host and changes on every
 * push. Reading these means the site is correct on a `*.vercel.app` URL without
 * anyone having to hardcode one; setting `NEXT_PUBLIC_SITE_URL` later overrides it
 * without a code change.
 */
function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.startsWith('http') ? explicit : `https://${explicit}`;

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '';
  if (vercelHost) return `https://${vercelHost}`;

  return 'http://localhost:3000';
}

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  applicationName: 'Lemma Apartments',
  title: {
    default: 'Lemma Apartments — Apartments in Lusaka, Zambia',
    template: '%s · Lemma Apartments',
  },
  description:
    'Browse apartment options in Lusaka, ask about your dates, and confirm rates and payment details with reception.',
  keywords: [
    'Lemma Apartments',
    'Furnished apartments Lusaka',
    'Accommodation Lusaka Zambia',
    'Apartment booking Zambia',
  ],
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'Lemma Apartments — Furnished Apartments in Lusaka',
    description:
      'Explore apartment options in Lusaka and contact reception to confirm availability and rates.',
    type: 'website',
    locale: 'en_ZM',
    siteName: 'Lemma Apartments',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '64x64' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1E2530',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZM">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
