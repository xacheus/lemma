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
    default: 'Lemma Apartments — Furnished Apartments at Barlaston Park, Lusaka',
    template: '%s · Lemma Apartments',
  },
  description:
    'Furnished studio, one-bedroom and family apartments at Barlaston Park, Lusaka. Live availability, nightly rates in Zambian Kwacha, and secure online booking with Airtel Money, MTN Mobile Money, bank transfer or cash.',
  keywords: [
    'Lemma Apartments',
    'Apartments Barlaston Park',
    'Furnished apartments Lusaka',
    'Accommodation Lusaka Zambia',
    'Apartment booking Zambia',
  ],
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'Lemma Apartments — Furnished Apartments in Lusaka',
    description:
      'Furnished apartments at Barlaston Park, Lusaka, with live availability, night-by-night Kwacha pricing and online booking.',
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
