'use client';

import Link from 'next/link';
import { MessageCircle, Phone, RotateCcw } from 'lucide-react';
import { BrandMark } from './brand-mark';

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
    <div className="flex min-h-screen flex-col bg-sand-50 text-navy-900">
      <meta name="robots" content="noindex, nofollow" />
      <header className="border-b border-sand-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <BrandMark tone="light" size="md" />
            <span className="font-display text-[1.05rem] font-semibold text-navy-900">
              Lemma Apartments
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-16 sm:px-8">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lemma-dark">
            Lemma Apartments · Lusaka
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Something went wrong loading this page.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-navy-600">
            Please try again, return to the home page, or contact reception directly to ask about
            your stay.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={handleRetry} className="btn btn-primary">
              <RotateCcw size={16} aria-hidden="true" /> Try again
            </button>
            <a href="tel:+260574556207" className="btn btn-secondary">
              <Phone size={16} aria-hidden="true" /> Call reception
            </a>
            <a
              href="https://wa.me/260574556207"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
            >
              <MessageCircle size={16} aria-hidden="true" /> WhatsApp
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
