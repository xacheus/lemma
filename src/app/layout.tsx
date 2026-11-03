import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://lemmaheights.zm'),
  applicationName: 'Lemma Heights Apartments',
  title: {
    default: 'Lemma Heights Apartments — Serviced Apartments in Lusaka, Zambia',
    template: '%s · Lemma Heights Apartments',
  },
  description:
    'Upscale serviced apartments on Great East Road, Chainama Lands, Lusaka. Live availability, instant ZMW pricing, corporate quotations, and Airtel Money, MTN MoMo & bank transfer payments.',
  keywords: [
    'Lemma Heights Apartments',
    'Serviced apartments Lusaka',
    'Apartments Great East Road Lusaka',
    'Executive suites Zambia',
    'Corporate accommodation Lusaka',
  ],
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'Lemma Heights Apartments — Serviced Apartments in Lusaka',
    description:
      'Modern serviced apartments in Lusaka with solar backup, high-speed fibre, live availability and online booking.',
    type: 'website',
    locale: 'en_ZM',
    siteName: 'Lemma Heights Apartments',
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
