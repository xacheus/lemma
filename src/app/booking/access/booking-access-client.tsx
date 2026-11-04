'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, Loader2, MessageCircle, Phone } from 'lucide-react';
import type { Settings } from '@/lib/domain/types';

export function BookingAccessClient({ property }: { property: Settings['property'] }) {
  const router = useRouter();
  const started = useRef(false);
  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (!token) return;
    window.history.replaceState(null, '', window.location.pathname);
    setBusy(true);
    fetch('/api/public/booking-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'exchange', token }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        router.replace(`/booking/${encodeURIComponent(data.data.reservationId)}`);
      })
      .catch((error) => {
        setIsError(true);
        setMessage(error instanceof Error ? error.message : 'The link could not be verified.');
      })
      .finally(() => setBusy(false));
  }, [router]);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    setIsError(false);
    try {
      const response = await fetch('/api/public/booking-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'request', reference, email }),
      });
      const data = await response.json();
      setIsError(!response.ok);
      setMessage(response.ok ? data.data.message : data.error);
    } catch {
      setIsError(true);
      setMessage('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const waDigits = property.whatsapp.replace(/[^0-9]/g, '');

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-12 sm:px-6">
      <div>
        <p className="text-[0.78rem] font-medium text-lemma-dark">Visitor booking lookup</p>
        <h1 className="mt-1 font-display text-[1.9rem] font-medium tracking-[-0.015em] text-navy-900">
          Find a booking by reference
        </h1>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed text-sand-700">
          Booked without creating an account? Enter your booking reference and email to request a
          one-time access link, or reach reception directly on WhatsApp.
        </p>
      </div>

      <form onSubmit={requestLink} className="card space-y-4 p-6">
        <div>
          <label className="label mb-1 block" htmlFor="reference">
            Booking reference
          </label>
          <input
            id="reference"
            className="field font-mono"
            placeholder="e.g. LHA-2026-0001"
            required
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="email">
            Email address used on booking
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="field"
            placeholder="name@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button className="btn btn-primary min-h-11 w-full justify-center" disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
          {busy ? 'Sending…' : 'Send secure access link'}
        </button>

        {message ? (
          <p
            role="status"
            className={`rounded-md border px-3.5 py-2.5 text-[0.82rem] leading-relaxed ${
              isError
                ? 'border-st-cancelled/30 bg-st-cancelledBg text-st-cancelled'
                : 'border-sand-200 bg-sand-50 text-navy-800'
            }`}
          >
            {message}
          </p>
        ) : null}
      </form>

      <div className="rounded-xl border border-sand-200 bg-white p-5 text-[0.84rem] text-sand-700">
        <p className="font-semibold text-navy-900">Booked with an account or need quick help?</p>
        <p className="mt-1 leading-relaxed">
          Registered guests can{' '}
          <Link className="font-semibold text-navy-900 underline" href="/login">
            sign in to their account
          </Link>{' '}
          to view stays and PDF receipts immediately. You can also contact reception with your
          reference:
        </p>
        <div className="mt-3.5 flex flex-wrap gap-2">
          {waDigits ? (
            <a
              href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello ${property.name}, please help me check my booking${reference ? ` (${reference})` : ''}.`)}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
            >
              <MessageCircle size={14} /> WhatsApp reception
            </a>
          ) : null}
          <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="btn btn-ghost btn-sm">
            <Phone size={13} /> {property.phone}
          </a>
        </div>
      </div>
    </div>
  );
}
