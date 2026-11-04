'use client';

import { MessageCircle, Phone, RotateCcw } from 'lucide-react';

/** Public contact details that remain usable when the booking records are offline. */
export function SiteUnavailable({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex min-h-screen flex-col bg-sand-50 text-navy-900">
      <meta name="robots" content="noindex, nofollow" />
      <header className="border-b border-sand-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4 sm:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.jpg" alt="" className="h-10 w-10 rounded-md object-cover" />
          <span className="text-sm font-bold tracking-[0.12em]">LEMMA APARTMENTS</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-16 sm:px-8">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lemma-dark">
            Lemma Apartments · Lusaka
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            We can’t load the site right now.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-navy-600">
            Live availability and online enquiries are temporarily unavailable. Please try again in a
            moment, or contact reception to ask about your stay. If you recently sent an enquiry,
            check with reception before sending it again.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {onRetry ? (
              <button type="button" onClick={onRetry} className="btn btn-primary">
                <RotateCcw size={16} aria-hidden="true" /> Try again
              </button>
            ) : (
              <a href="" className="btn btn-primary">
                <RotateCcw size={16} aria-hidden="true" /> Try again
              </a>
            )}
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
