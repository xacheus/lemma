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
    'Self-catering furnished apartments at Barlaston Park, Lusaka. Check dates in Zambian Kwacha (ZMW) and book directly with reception.',
  keywords: [
    'Lemma Apartments',
    'Barlaston Park Lusaka',
    'Furnished apartments Lusaka',
    'Serviced apartments Lusaka Zambia',
  ],
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'Lemma Apartments — Furnished Apartments in Lusaka',
    description:
      'Self-catering apartments at Barlaston Park, Lusaka, priced per night in Zambian Kwacha.',
    type: 'website',
    locale: 'en_ZM',
    siteName: 'Lemma Apartments',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lemma Apartments — Furnished Apartments in Lusaka',
    description:
      'Self-catering apartments at Barlaston Park, Lusaka, priced per night in Zambian Kwacha.',
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
  themeColor: '#151B23',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZM">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/*
          Public guest pages (`.public-shell`) use the reference brand voice:
          Montserrat for headings, brand locks and eyebrows; Public Sans for body
          copy — the closest web-font match to the reference's
          'Segoe UI' / 'Helvetica Neue' / Arial stack.
        */}
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
