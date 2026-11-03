'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, MessageCircle } from 'lucide-react';
import type { Apartment, Settings } from '@/lib/domain/types';
import { calculateStayPricing } from '@/lib/domain/pricing';

interface BookingResult {
  id: string;
  reference: string;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number;
  depositDue: number;
  apartmentName: string;
  apartmentNumber: number;
  contactWhatsapp: string;
}

export function ApartmentBookingWidget({
  apartment,
  settings,
  initialCheckIn,
  initialCheckOut,
  initialGuests,
  today,
  prefillUser,
}: {
  apartment: Apartment;
  settings: Settings;
  initialCheckIn: string;
  initialCheckOut: string;
  initialGuests: number;
  today: string;
  prefillUser: { fullName: string; email: string; phone: string } | null;
}) {
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guestCount, setGuestCount] = useState(initialGuests);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const [fullName, setFullName] = useState(prefillUser?.fullName || '');
  const [phone, setPhone] = useState(prefillUser?.phone || '+260 ');
  const [email, setEmail] = useState(prefillUser?.email || '');
  const [notes, setNotes] = useState('');
  const [agreedPolicy, setAgreedPolicy] = useState(true);

  const [availState, setAvailState] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<BookingResult | null>(null);

  const pricing = useMemo(
    () =>
      calculateStayPricing({
        apartment,
        settings,
        checkIn,
        checkOut,
        guestCount,
        selectedServiceIds,
      }),
    [apartment, settings, checkIn, checkOut, guestCount, selectedServiceIds],
  );

  useEffect(() => {
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setAvailState('unavailable');
      return;
    }
    let cancelled = false;
    setAvailState('checking');
    fetch(
      `/api/public/availability?apartmentId=${encodeURIComponent(apartment.id)}&checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}&guests=${guestCount}`,
    )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const hits = (json?.data?.hits ?? []) as { apartment: { id: string }; available: boolean }[];
        const hit = hits.find((h) => h.apartment.id === apartment.id);
        const ok = Boolean(json?.ok && hit?.available);
        setAvailState(ok ? 'available' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setAvailState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [apartment.id, checkIn, checkOut, guestCount]);

  function toggleService(id: string) {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/public/reservations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phone,
          email,
          apartmentId: apartment.id,
          checkIn,
          checkOut,
          guestCount,
          selectedServiceIds,
          notes,
          agreedPolicy,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Could not complete booking submission.');
        setBusy(false);
        return;
      }
      setCreated(json.data);
    } catch {
      setError('Network error while submitting your reservation.');
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const waDigits = created.contactWhatsapp.replace(/[^0-9]/g, '');
    return (
      <div className="card sticky top-24 space-y-4 p-6">
        <div className="flex items-center gap-2 text-st-available">
          <CheckCircle2 size={20} />
          <h2 className="text-[1.15rem] font-bold text-navy-900">Booking Recorded</h2>
        </div>
        <div className="rounded-md border border-sand-200 bg-sand-50 p-4 text-[0.84rem] space-y-1.5">
          <p>
            <strong>Reference:</strong> {created.reference}
          </p>
          <p>
            <strong>Apartment:</strong> Apt {created.apartmentNumber} · {created.apartmentName}
          </p>
          <p>
            <strong>Dates:</strong> {created.checkIn} to {created.checkOut} ({created.nights}{' '}
            {created.nights === 1 ? 'night' : 'nights'})
          </p>
          <p>
            <strong>Total Stay Amount:</strong> K{created.totalAmount.toLocaleString('en-US')}
          </p>
          <p>
            <strong>Deposit Due ({settings.booking.depositPercent}%):</strong> K
            {created.depositDue.toLocaleString('en-US')}
          </p>
          <p>
            <strong>Current Status:</strong>{' '}
            <span className="uppercase">{created.status.replace(/_/g, ' ')}</span>
          </p>
        </div>

        <p className="text-[0.82rem] leading-relaxed text-navy-600">
          Our reception team has received your booking in the live property ledger. Settle your
          deposit via Airtel Money, MTN Mobile Money, or Bank Transfer quoting{' '}
          <strong>{created.reference}</strong>.
        </p>

        <div className="flex flex-col gap-2.5 pt-1">
          {prefillUser ? (
            <Link href="/account" className="btn btn-primary justify-center">
              <FileText size={15} /> View in My Guest Account
            </Link>
          ) : (
            <Link href="/register" className="btn btn-primary justify-center">
              Create Account to Track &amp; Download Receipt
            </Link>
          )}
          {waDigits ? (
            <a
              href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello Lemma Heights Reception, I just submitted booking ${created.reference} for ${created.apartmentName} (${created.checkIn} to ${created.checkOut}).`)}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary justify-center"
            >
              <MessageCircle size={15} /> Message Reception on WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submitBooking} className="card sticky top-24 space-y-4 p-6">
      <div className="flex items-baseline justify-between border-b border-sand-200 pb-4">
        <div>
          <span className="text-[1.45rem] font-bold text-navy-900 tabular-nums">
            K{pricing.effectiveAverageRate.toLocaleString('en-US')}
          </span>
          <span className="text-[0.82rem] text-navy-500"> / night</span>
        </div>
        <span
          className={`rounded-md px-2.5 py-1 text-[0.72rem] font-semibold ${
            availState === 'available'
              ? 'bg-st-availableBg text-st-available'
              : availState === 'checking'
                ? 'bg-sand-100 text-navy-600'
                : 'bg-st-cancelledBg text-st-cancelled'
          }`}
        >
          {availState === 'available'
            ? 'Dates Available'
            : availState === 'checking'
              ? 'Checking...'
              : 'Dates Unavailable'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label mb-1 block" htmlFor="bw-in">
            Check-in
          </label>
          <input
            id="bw-in"
            type="date"
            min={today}
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className="field"
            required
          />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="bw-out">
            Check-out
          </label>
          <input
            id="bw-out"
            type="date"
            min={checkIn}
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className="field"
            required
          />
        </div>
      </div>

      <div>
        <label className="label mb-1 block" htmlFor="bw-guests">
          Guests (Max {apartment.maxGuests})
        </label>
        <select
          id="bw-guests"
          value={guestCount}
          onChange={(e) => setGuestCount(Number(e.target.value))}
          className="field"
        >
          {Array.from({ length: apartment.maxGuests }, (_, idx) => idx + 1).map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'Guest' : 'Guests'}
            </option>
          ))}
        </select>
      </div>

      {/* Optional Add-on Services */}
      {apartment.optionalServices && apartment.optionalServices.filter((s) => s.active).length > 0 ? (
        <div className="space-y-1.5 border-t border-sand-200 pt-3">
          <p className="label">Optional Services</p>
          {apartment.optionalServices
            .filter((s) => s.active)
            .map((svc) => (
              <label
                key={svc.id}
                className="flex cursor-pointer items-center justify-between rounded border border-sand-200 px-3 py-2 text-[0.8rem] hover:bg-sand-50"
              >
                <span className="flex items-center gap-2 text-navy-800">
                  <input
                    type="checkbox"
                    checked={selectedServiceIds.includes(svc.id)}
                    onChange={() => toggleService(svc.id)}
                  />
                  {svc.name}
                </span>
                <span className="font-semibold text-navy-900 tabular-nums">
                  K{svc.price.toLocaleString('en-US')}{' '}
                  {svc.priceType === 'per_night' ? '/ night' : ''}
                </span>
              </label>
            ))}
        </div>
      ) : null}

      {/* Live Price Breakdown */}
      {pricing.nights > 0 ? (
        <div className="space-y-1.5 rounded-md bg-sand-50 p-3.5 text-[0.82rem] tabular-nums">
          <div className="flex justify-between text-navy-600">
            <span>
              Accommodation ({pricing.nights} {pricing.nights === 1 ? 'night' : 'nights'})
            </span>
            <span>K{pricing.roomSubtotal.toLocaleString('en-US')}</span>
          </div>
          {pricing.extraGuestTotal > 0 ? (
            <div className="flex justify-between text-navy-600">
              <span>Extra guest supplement</span>
              <span>K{pricing.extraGuestTotal.toLocaleString('en-US')}</span>
            </div>
          ) : null}
          {pricing.servicesTotal > 0 ? (
            <div className="flex justify-between text-navy-600">
              <span>Selected add-on services</span>
              <span>K{pricing.servicesTotal.toLocaleString('en-US')}</span>
            </div>
          ) : null}
          {pricing.totalDiscount > 0 ? (
            <div className="flex justify-between text-st-available">
              <span>Stay offer / discount</span>
              <span>- K{pricing.totalDiscount.toLocaleString('en-US')}</span>
            </div>
          ) : null}
          {pricing.taxRatePercent > 0 ? (
            <div className="flex justify-between text-navy-600">
              <span>
                {pricing.taxName} ({pricing.taxRatePercent}%{' '}
                {pricing.taxInclusive ? 'incl.' : 'excl.'})
              </span>
              <span>K{pricing.taxAmount.toLocaleString('en-US')}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-sand-200 pt-2 text-[0.92rem] font-bold text-navy-900">
            <span>Total ZMW</span>
            <span>K{pricing.totalAmount.toLocaleString('en-US')}</span>
          </div>
          <div className="flex justify-between text-[0.76rem] text-navy-500">
            <span>Deposit to confirm ({pricing.depositPercent}%)</span>
            <span>K{pricing.depositRequired.toLocaleString('en-US')}</span>
          </div>
        </div>
      ) : null}

      {/* Guest Details */}
      <div className="space-y-3 border-t border-sand-200 pt-3">
        <div>
          <label className="label mb-1 block" htmlFor="bw-name">
            Full name
          </label>
          <input
            id="bw-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="field"
            placeholder="Your full name"
            required
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label mb-1 block" htmlFor="bw-phone">
              Phone / WhatsApp
            </label>
            <input
              id="bw-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="field"
              placeholder="+260 97..."
              required
            />
          </div>
          <div>
            <label className="label mb-1 block" htmlFor="bw-email">
              Email address
            </label>
            <input
              id="bw-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
              placeholder="name@company.co.zm"
            />
          </div>
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="bw-notes">
            Arrival time or special requests (optional)
          </label>
          <textarea
            id="bw-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="field"
            placeholder="Estimated arrival time, airport transfer details, or corporate billing note..."
          />
        </div>
        <label className="flex items-start gap-2 text-[0.78rem] text-navy-600">
          <input
            type="checkbox"
            checked={agreedPolicy}
            onChange={(e) => setAgreedPolicy(e.target.checked)}
            className="mt-0.5"
            required
          />
          <span>I accept the check-in, deposit, and cancellation policies.</span>
        </label>
      </div>

      {error ? (
        <p className="flex items-start gap-2 rounded-md border border-st-cancelled/30 bg-st-cancelledBg px-3 py-2 text-[0.8rem] text-st-cancelled">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || availState !== 'available'}
        className="btn btn-primary w-full justify-center py-2.5"
      >
        {busy ? 'Submitting reservation...' : 'Request Reservation'}
      </button>
    </form>
  );
}
