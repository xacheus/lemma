'use client';

import Link from 'next/link';
import { MessageCircle, Phone, RotateCcw } from 'lucide-react';
import { BrandLogo } from './brand-logo';

/** Error-boundary fallback with direct reception contact details and retry action. */
export function SiteUnavailable({ onRetry }: { onRetry?: () => void }) {
  function handleRetry() {
    if (onRetry) {
      onRetry();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  return (
    <div className="public-shell flex min-h-screen flex-col">
      <meta name="robots" content="noindex, nofollow" />
      <header className="border-b border-white/10 bg-swdl-navy">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo size="md" />
            <span className="font-heading text-[1rem] font-extrabold uppercase tracking-[0.14em] text-white">
              Lemma Heights Apartments
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-16 sm:px-8">
        <div className="max-w-xl">
          <p className="font-heading text-[0.72rem] font-extrabold uppercase tracking-[0.19em] text-swdl-goldDark">
            Lemma Heights Apartments · Lusaka
          </p>
          <h1 className="mt-3 font-heading text-[2rem] font-extrabold tracking-[-0.01em] sm:text-[2.5rem]">
            Something went wrong loading this page.
          </h1>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-swdl-muted">
            Please try again, return to the home page, or contact reception directly to ask about
            your stay.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={handleRetry} className="btn btn-gold px-6 py-2.5">
              <RotateCcw size={16} aria-hidden="true" /> Try again
            </button>
            <a href="tel:+260574556207" className="btn btn-navy px-6 py-2.5">
              <Phone size={16} aria-hidden="true" /> Call reception
            </a>
            <a
              href="https://wa.me/260574556207"
              target="_blank"
              rel="noreferrer"
              className="btn btn-navy px-6 py-2.5"
            >
              <MessageCircle size={16} aria-hidden="true" /> WhatsApp
            </a>
            <Link href="/" className="btn btn-navy px-6 py-2.5">
              Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
