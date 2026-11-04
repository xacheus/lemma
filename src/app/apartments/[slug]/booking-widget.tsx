'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  ImagePlus,
  Landmark,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type { Apartment, Settings } from '@/lib/domain/types';
import type { PaymentMethod } from '@/lib/domain/types';
import { calculateStayPricing } from '@/lib/domain/pricing';
import { formatKwacha } from '@/lib/domain/money';
import { addISO } from '@/lib/domain/dates';
import { isSampleListing } from '@/lib/domain/sample-listings';

interface MethodView {
  id: PaymentMethod;
  label: string;
  instructions: string;
  accountLabel: string;
  accountNumber: string;
}

interface PaymentInstruction {
  method: PaymentMethod;
  label: string;
  instructions: string;
  accountLabel: string;
  accountNumber: string;
  totalAmount: number;
  depositPercent: number;
  suggestedAmount: number;
  reference: string;
  proofUploadEnabled: boolean;
}

interface BookingResult {
  id: string;
  reference: string;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number;
  depositDue: number;
  sample: boolean;
  depositPercent: number;
  apartmentName: string;
  apartmentNumber: number;
  contactWhatsapp: string;
  payment: PaymentInstruction | null;
  methods: { id: PaymentMethod; label: string }[];
}

const METHOD_ICONS: Record<PaymentMethod, typeof Smartphone> = {
  airtel_money: Smartphone,
  mtn_money: Smartphone,
  bank_transfer: Landmark,
  cash: Banknote,
};

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
  const methods = useMemo<MethodView[]>(
    () =>
      settings.payments.methods
        .filter((m) => m.enabled)
        .map((m) => ({
          id: m.id as PaymentMethod,
          label: m.label,
          instructions: m.instructions,
          accountLabel: m.accountLabel,
          accountNumber: m.accountNumber,
        })),
    [settings.payments.methods],
  );

  const sample = isSampleListing(apartment);
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guestCount, setGuestCount] = useState(initialGuests);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [method, setMethod] = useState<PaymentMethod | null>(
    settings.payments.lockMethodToAdmin
      ? (settings.payments.defaultMethod ?? methods[0]?.id ?? null)
      : (settings.payments.defaultMethod ?? methods[0]?.id ?? null),
  );

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
        setAvailState(Boolean(json?.ok && hit?.available) ? 'available' : 'unavailable');
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
          paymentMethod: method ?? undefined,
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

  /* ------------------------------------------------------------- after booking */
  if (created) {
    return (
      <BookingConfirmation
        booking={created}
        prefillUser={prefillUser}
        fallbackMethods={methods}
        initialMethod={method}
      />
    );
  }

  const chosen = methods.find((m) => m.id === method) ?? null;
  const locked = Boolean(settings.payments.lockMethodToAdmin);

  return (
    <form onSubmit={submitBooking} className="card sticky top-24 space-y-4 p-5 sm:p-6">
      <div className="flex items-baseline justify-between border-b border-sand-200 pb-4">
        <div>
          <span className="text-[1.45rem] font-bold tabular-nums text-navy-900">
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
            ? 'Dates available'
            : availState === 'checking'
              ? 'Checking…'
              : 'Dates unavailable'}
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
            onChange={(e) => {
              const next = e.target.value;
              setCheckIn(next);
              if (checkOut <= next) setCheckOut(addISO(next, 1));
            }}
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
            min={addISO(checkIn, 1)}
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className="field"
            required
          />
        </div>
      </div>

      <div>
        <label className="label mb-1 block" htmlFor="bw-guests">
          Guests (max {apartment.maxGuests})
        </label>
        <select
          id="bw-guests"
          value={guestCount}
          onChange={(e) => setGuestCount(Number(e.target.value))}
          className="field"
        >
          {Array.from({ length: apartment.maxGuests }, (_, idx) => idx + 1).map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'guest' : 'guests'}
            </option>
          ))}
        </select>
      </div>

      {apartment.optionalServices && apartment.optionalServices.filter((s) => s.active).length > 0 ? (
        <div className="space-y-1.5 border-t border-sand-200 pt-3">
          <p className="label">Optional services</p>
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
                <span className="font-semibold tabular-nums text-navy-900">
                  K{svc.price.toLocaleString('en-US')} {svc.priceType === 'per_night' ? '/ night' : ''}
                </span>
              </label>
            ))}
        </div>
      ) : null}

      {pricing.nights > 0 ? (
        <div className="space-y-1.5 rounded-md bg-sand-50 p-3.5 text-[0.82rem] tabular-nums">
          <div className="flex justify-between text-navy-600">
            <span>
              Accommodation ({pricing.nights} {pricing.nights === 1 ? 'night' : 'nights'})
            </span>
            <span>{formatKwacha(pricing.roomSubtotal)}</span>
          </div>
          {pricing.extraGuestTotal > 0 ? (
            <div className="flex justify-between text-navy-600">
              <span>Extra guest supplement</span>
              <span>{formatKwacha(pricing.extraGuestTotal)}</span>
            </div>
          ) : null}
          {pricing.servicesTotal > 0 ? (
            <div className="flex justify-between text-navy-600">
              <span>Selected add-on services</span>
              <span>{formatKwacha(pricing.servicesTotal)}</span>
            </div>
          ) : null}
          {pricing.totalDiscount > 0 ? (
            <div className="flex justify-between text-st-available">
              <span>Stay offer / discount</span>
              <span>− {formatKwacha(pricing.totalDiscount)}</span>
            </div>
          ) : null}
          {pricing.taxRatePercent > 0 ? (
            <div className="flex justify-between text-navy-600">
              <span>
                {pricing.taxName} ({pricing.taxRatePercent}% {pricing.taxInclusive ? 'incl.' : 'excl.'})
              </span>
              <span>{formatKwacha(pricing.taxAmount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-sand-200 pt-2 text-[0.92rem] font-bold text-navy-900">
            <span>Total ZMW</span>
            <span>{formatKwacha(pricing.totalAmount)}</span>
          </div>
          {!sample ? (
            <div className="flex justify-between text-[0.76rem] text-navy-500">
              <span>Deposit to confirm ({pricing.depositPercent}%)</span>
              <span>{formatKwacha(pricing.depositRequired)}</span>
            </div>
          ) : (
            <p className="text-[0.77rem] text-navy-600">Indicative quote only. Reception will confirm the actual unit and rate before payment.</p>
          )}
        </div>
      ) : null}

      {/* ---- payment method: the instructions change as soon as one is chosen ---- */}
      {sample ? (
        <p className="border-t border-sand-200 pt-3 text-[0.79rem] text-navy-600">
          Send an enquiry now. Reception will confirm the unit and payment details before you pay.
        </p>
      ) : methods.length > 0 ? (
        <fieldset className="border-t border-sand-200 pt-3">
          <legend className="label mb-1.5 block">
            {locked ? 'Payment method' : 'How will you pay?'}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {methods.map((m) => {
              const Icon = METHOD_ICONS[m.id] ?? CreditCard;
              const active = method === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={active}
                  disabled={locked}
                  onClick={() => setMethod(m.id)}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[0.8rem] transition-colors ${
                    active
                      ? 'border-navy-900 bg-sand-50 font-semibold text-navy-900 ring-1 ring-navy-900'
                      : 'border-sand-300 text-navy-700 hover:border-brand-400'
                  } ${locked && !active ? 'opacity-50' : ''}`}
                >
                  <Icon size={14} className="shrink-0 text-lemma-dark" aria-hidden="true" />
                  {m.label}
                </button>
              );
            })}
          </div>

          {chosen ? (
            <div className="mt-2 rounded-md border border-sand-200 bg-white p-3 text-[0.79rem] leading-relaxed text-navy-700">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-navy-400">
                {chosen.label} details
              </p>
              {chosen.accountNumber ? (
                <p className="mt-1">
                  <span className="text-navy-500">{chosen.accountLabel}:</span>{' '}
                  <strong className="tabular-nums text-navy-900">{chosen.accountNumber}</strong>
                </p>
              ) : (
                <p className="mt-1 text-navy-500">
                  {chosen.accountLabel} — the desk confirms the number on your confirmation.
                </p>
              )}
              {chosen.instructions ? (
                <p className="mt-1.5 whitespace-pre-line text-[0.78rem] text-navy-600">
                  {chosen.instructions}
                </p>
              ) : null}
              <p className="mt-1.5 text-[0.74rem] text-navy-500">
                Quote your booking number as the reference. Payment is confirmed by reception after
                you submit proof — nothing is charged on this page.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[0.78rem] text-navy-500">Choose how you will pay to see the details.</p>
          )}
        </fieldset>
      ) : (
        <p className="rounded-md border border-st-cleaning/40 bg-st-cleaningBg/40 p-2.5 text-[0.78rem] text-navy-700">
          Online booking is paused while payment details are being confirmed. Call or WhatsApp reception.
        </p>
      )}

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
              placeholder="+260 97…"
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
            placeholder="Estimated arrival time, airport transfer, or corporate billing note…"
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
          <span>I accept the check-in, deposit and cancellation policies.</span>
        </label>
      </div>

      {error ? (
        <p className="flex items-start gap-2 rounded-md border border-st-cancelled/30 bg-st-cancelledBg px-3 py-2 text-[0.8rem] text-st-cancelled">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || availState !== 'available' || (!sample && !method)}
        className="btn btn-primary w-full justify-center py-2.5"
      >
        {busy ? 'Sending request…' : sample ? 'Send enquiry' : `Book now${pricing.totalAmount > 0 ? ` · ${formatKwacha(pricing.totalAmount)}` : ''}`}
      </button>
      <p className="text-center text-[0.72rem] leading-relaxed text-navy-400">
        {sample
          ? 'No payment is needed until reception confirms the actual unit and final price.'
          : 'You will get payment details and an upload box for your receipt straight away.'}
      </p>
    </form>
  );
}

/* --------------------------------------------------------------------------- */

/**
 * Steps 2–5 of the payment flow, immediately after the booking is accepted:
 * the instructions for the chosen channel, the amount and reference to quote, and the
 * proof upload. The upload creates a *claim* — reception still has to verify it, and
 * the panel says so rather than pretending the booking is paid.
 */
function BookingConfirmation({
  booking,
  prefillUser,
  fallbackMethods,
  initialMethod,
}: {
  booking: BookingResult;
  prefillUser: { fullName: string; email: string; phone: string } | null;
  fallbackMethods: MethodView[];
  initialMethod: PaymentMethod | null;
}) {
  const [method, setMethod] = useState<PaymentMethod>(
    booking.payment?.method ?? initialMethod ?? fallbackMethods[0]?.id ?? 'airtel_money',
  );
  const [instructions, setInstructions] = useState<PaymentInstruction | null>(booking.payment);
  const [loadingInstructions, setLoadingInstructions] = useState(false);
  const [amount, setAmount] = useState(String(booking.payment?.suggestedAmount ?? booking.depositDue ?? ''));
  const [txnRef, setTxnRef] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [proof, setProof] = useState<{ fileName: string; mimeType: string; dataUrl: string; sizeBytes: number } | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ amount: number; reference: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const waDigits = booking.contactWhatsapp.replace(/[^0-9]/g, '');

  // A guest without an account can still submit proof here; the claim is tied to the
  // booking. Choosing a different channel asks the server for that channel's details.
  useEffect(() => {
    if (booking.sample && booking.status === 'inquiry') return;
    if (booking.payment?.method === method) {
      setInstructions(booking.payment);
      return;
    }
    let cancelled = false;
    setLoadingInstructions(true);
    fetch(`/api/payments/claims?reservationId=${encodeURIComponent(booking.id)}&method=${method}`, {
      credentials: 'same-origin',
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const q = json?.data?.quote;
        const m = (q?.methods ?? []).find((x: MethodView) => x.id === method);
        if (m && q) {
          setInstructions({
            method: m.id,
            label: m.label,
            instructions: m.instructions,
            accountLabel: m.accountLabel,
            accountNumber: m.accountNumber,
            totalAmount: q.totalAmount,
            depositPercent: q.depositPercent,
            suggestedAmount: q.suggestedAmount,
            reference: q.reference,
            proofUploadEnabled: q.proofUploadEnabled,
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingInstructions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [method, booking.id, booking.payment, booking.sample, booking.status]);

  async function pickProof(file: File | null) {
    setProofError(null);
    if (!file) return;
    if (file.size > 500 * 1024) {
      setProofError('That file is over 500 KB. Use a smaller screenshot, or submit the transaction reference without an attachment.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      setProofError('Use a JPEG, PNG, WebP image or a PDF.');
      return;
    }
    const dataUrl = await new Promise<string>((resolve) =>
      {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      },
    );
    if (!dataUrl) {
      setProofError('That file could not be read. Try another one.');
      return;
    }
    setProof({ fileName: file.name, mimeType: file.type, dataUrl, sizeBytes: file.size });
  }

  async function submitProof(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!(value > 0)) {
      setError('Enter the amount you paid.');
      return;
    }
    if (txnRef.trim().length < 3) {
      setError('Enter the transaction reference, SMS code or slip number.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/payments/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reservationId: booking.id,
          amount: value,
          method,
          reference: txnRef.trim(),
          paidAt,
          proof: proof
            ? { fileName: proof.fileName, mimeType: proof.mimeType, dataUrl: proof.dataUrl, sizeBytes: proof.sizeBytes }
            : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'That proof could not be submitted.');
        setBusy(false);
        return;
      }
      setSubmitted({ amount: value, reference: txnRef.trim() });
    } catch {
      setError('Network error — the proof was not submitted. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const shown = instructions ?? booking.payment;

  if (booking.sample && booking.status === 'inquiry') {
    return (
      <div className="card sticky top-24 space-y-4 p-5 sm:p-6">
        <CheckCircle2 size={22} className="text-st-available" />
        <h2 className="text-[1.15rem] font-semibold text-navy-900">Enquiry received</h2>
        <p className="text-[0.86rem] leading-relaxed text-navy-700">
          Your reference is <strong>{booking.reference}</strong>. The apartment shown is an example:
          reception will confirm the actual unit, dates and final rate before you pay.
          Please do not send a deposit yet.
        </p>
        {prefillUser ? (
          <Link href="/account" className="btn btn-primary justify-center">View my account</Link>
        ) : (
          <Link href="/contact" className="btn btn-primary justify-center">Contact reception</Link>
        )}
        {waDigits ? (
          <a href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello, please confirm my enquiry ${booking.reference}.`)}`}
            target="_blank" rel="noreferrer" className="btn btn-secondary justify-center">
            <MessageCircle size={15} /> Ask on WhatsApp
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="card sticky top-24 space-y-4 p-5 sm:p-6">
      <div className="flex items-start gap-2">
        <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-st-available" />
        <div>
          <h2 className="text-[1.1rem] font-semibold text-navy-900">
            {submitted ? 'Payment proof submitted' : 'Booking received'}
          </h2>
          <p className="mt-0.5 text-[0.82rem] text-navy-600">
            Booking <strong className="font-mono">{booking.reference}</strong> · Apt{' '}
            {booking.apartmentNumber} · {booking.nights} night{booking.nights === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {submitted ? (
        <div className="space-y-3">
          <div className="rounded-md border border-st-available/40 bg-st-availableBg/50 p-3.5 text-[0.84rem] leading-relaxed text-navy-800">
            <p className="font-semibold">Payment proof submitted successfully.</p>
            <p className="mt-1">
              Your {formatKwacha(submitted.amount)} payment is awaiting verification by Lemma
              Apartments. Reference <strong>{submitted.reference}</strong>.
            </p>
            <p className="mt-1.5 text-[0.78rem] text-navy-600">
              Reception checks it against the mobile-money or bank record, then your receipt is
              issued and the balance updates. You will see the change in your account.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {prefillUser ? (
              <Link href="/account" className="btn btn-primary justify-center">
                View status in my account
              </Link>
            ) : (
              <>
                <Link href="/register" className="btn btn-primary justify-center">
                  Create an account to track it
                </Link>
                <p className="text-center text-[0.74rem] text-navy-500">
                  Keep <strong>{booking.reference}</strong> handy. Verify your email to connect
                  earlier visitor bookings to your new account.
                </p>
              </>
            )}
            {waDigits ? (
              <a
                href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello Lemma Apartments, I have paid for booking ${booking.reference} and submitted the reference ${submitted.reference}.`)}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary justify-center"
              >
                <MessageCircle size={15} /> Message reception
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {/* Step 2 — total, deposit, destination, reference */}
          <div className="space-y-2 rounded-md border border-sand-200 bg-sand-50 p-3.5 text-[0.83rem]">
            <div className="flex justify-between">
              <span className="text-navy-500">Total booking amount</span>
              <span className="font-semibold tabular-nums text-navy-900">
                {formatKwacha(shown?.totalAmount ?? booking.totalAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-navy-500">Deposit required ({shown?.depositPercent ?? booking.depositPercent}%)</span>
              <span className="font-semibold tabular-nums text-navy-900">
                {formatKwacha(booking.depositDue)}
              </span>
            </div>
            <div className="flex justify-between border-t border-sand-200 pt-2">
              <span className="text-navy-500">Payment reference</span>
              <span className="font-mono font-semibold text-navy-900">{booking.reference}</span>
            </div>
            {shown ? (
              <div className="border-t border-sand-200 pt-2">
                <p className="text-[0.72rem] uppercase tracking-[0.1em] text-navy-400">
                  {shown.label} · pay to
                </p>
                <p className="mt-0.5 font-semibold text-navy-900">
                  {shown.accountNumber
                    ? `${shown.accountLabel}: ${shown.accountNumber}`
                    : `${shown.accountLabel} — call reception to confirm the number`}
                </p>
                {shown.instructions ? (
                  <p className="mt-1 whitespace-pre-line text-[0.78rem] leading-relaxed text-navy-600">
                    {shown.instructions}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {booking.methods.length > 1 ? (
            <div>
              <p className="label mb-1.5 block">Paying a different way?</p>
              <div className="grid grid-flow-col auto-cols-max gap-2 overflow-x-auto pb-1">
                {booking.methods.map((m) => {
                  const Icon = METHOD_ICONS[m.id] ?? CreditCard;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      aria-pressed={m.id === method}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[0.78rem] transition-colors ${
                        m.id === method
                          ? 'border-navy-900 bg-sand-50 font-semibold text-navy-900'
                          : 'border-sand-300 text-navy-700'
                      }`}
                    >
                      <Icon size={13} /> {m.label}
                    </button>
                  );
                })}
              </div>
              {loadingInstructions ? (
                <p className="mt-1 flex items-center gap-1.5 text-[0.74rem] text-navy-500">
                  <Loader2 size={12} className="animate-spin" /> Updating the details…
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Steps 4 — proof */}
          <form onSubmit={submitProof} className="space-y-3 border-t border-sand-200 pt-3">
            <p className="text-[0.86rem] font-medium leading-relaxed text-navy-900">
              Have you completed your payment? Upload your receipt or screenshot for verification.
            </p>

            {error ? (
              <p className="flex items-start gap-2 rounded-md border border-st-cancelled/30 bg-st-cancelledBg px-3 py-2 text-[0.8rem] text-st-cancelled">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label mb-1 block" htmlFor="bp-amount">
                  Amount paid (ZMW)
                </label>
                <input
                  id="bp-amount"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="0.01"
                  className="field tabular-nums"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="bp-date">
                  Date paid
                </label>
                <input
                  id="bp-date"
                  type="date"
                  className="field"
                  max={new Date().toISOString().slice(0, 10)}
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="label mb-1 block" htmlFor="bp-ref">
                Transaction reference
              </label>
              <input
                id="bp-ref"
                className="field"
                value={txnRef}
                onChange={(e) => setTxnRef(e.target.value)}
                placeholder={method === 'bank_transfer' ? 'Bank slip or transfer reference' : 'e.g. MP260718.1234.C56789'}
                required
              />
            </div>

            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                onChange={(e) => void pickProof(e.target.files?.[0] ?? null)}
              />
              {proof ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-sand-200 bg-sand-50 px-3 py-2 text-[0.8rem]">
                  <span className="truncate text-navy-700">{proof.fileName}</span>
                  <button
                    type="button"
                    className="text-[0.76rem] font-medium text-navy-500 hover:underline"
                    onClick={() => setProof(null)}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary w-full justify-center py-2 text-[0.8rem]"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus size={14} /> Upload receipt or screenshot
                </button>
              )}
              {proofError ? <p className="mt-1 text-[0.76rem] text-st-cancelled">{proofError}</p> : null}
            </div>

            <p className="flex items-start gap-1.5 rounded-md bg-sand-50 p-2.5 text-[0.75rem] leading-relaxed text-navy-600">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-lemma-dark" />
              Proof is checked by a person before it counts. Your booking stays unpaid until
              reception verifies it, and only then is a receipt issued.
            </p>

            <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center py-2.5">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {busy ? 'Submitting…' : 'Submit proof for verification'}
            </button>
          </form>

          <div className="border-t border-sand-200 pt-3 text-[0.78rem] leading-relaxed text-navy-500">
            <p className="flex items-start gap-1.5">
              <Clock size={13} className="mt-0.5 shrink-0" />
              Paying at reception or on arrival? You can skip the upload — just keep{' '}
              <strong className="font-mono">{booking.reference}</strong> to quote at the desk.
            </p>
            {waDigits ? (
              <a
                href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello Lemma Apartments, I have just booked ${booking.reference} for ${booking.checkIn} to ${booking.checkOut}.`)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 font-medium text-navy-800 hover:text-lemma-dark"
              >
                <MessageCircle size={13} /> Send the reference to reception on WhatsApp
              </a>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
