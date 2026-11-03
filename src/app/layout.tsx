import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://lemmaheights.zm'),
  title: {
    default: 'Lemma Heights Apartments — Serviced apartments in Lusaka',
    template: '%s · Lemma Heights Apartments',
  },
  description:
    'Twelve serviced apartments on the Great East Road, Lusaka. Check live availability, book in minutes and pay by Airtel Money, MTN Mobile Money, bank transfer or cash.',
  openGraph: {
    title: 'Lemma Heights Apartments',
    description: 'Serviced apartments in Lusaka with live availability and instant booking requests.',
    type: 'website',
  },
  icons: { icon: '/brand/logo.jpg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f1f35',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZM">
      <body>{children}</body>
    </html>
  );
}
