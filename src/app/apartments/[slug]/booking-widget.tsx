'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  ImagePlus,
  Landmark,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type { Apartment, PaymentMethodSetting } from '@/lib/domain/types';
import { PaymentDetails, CopyDetail } from '@/components/payments/payment-details';
import { publicPaymentMethod, type PublicPaymentMethod } from '@/lib/domain/payment-details';
import type { PaymentMethod } from '@/lib/domain/types';
import { calculateStayPricing, type PricingSettings } from '@/lib/domain/pricing';
import { formatKwacha } from '@/lib/domain/money';
import { addISO, formatMediumDate } from '@/lib/domain/dates';
import { isSampleListing } from '@/lib/domain/sample-listings';

type MethodView = PublicPaymentMethod;
interface PaymentInstruction extends Omit<PublicPaymentMethod, 'id'> {
  method: PaymentMethod;
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
  settings: PricingSettings & {
    payments: {
      methods: PaymentMethodSetting[];
      lockMethodToAdmin?: boolean;
      defaultMethod?: PaymentMethod;
    };
  };
  initialCheckIn: string;
  initialCheckOut: string;
  initialGuests: number;
  today: string;
  prefillUser: { fullName: string; email: string; phone: string } | null;
}) {
  const methods = useMemo<MethodView[]>(
    () => settings.payments.methods.filter((m) => m.enabled).map(publicPaymentMethod),
    [settings.payments.methods],
  );

  const sample = isSampleListing(apartment);
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guestCount, setGuestCount] = useState(initialGuests);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [method, setMethod] = useState<PaymentMethod | null>(
    methods.find((item) => item.id === settings.payments.defaultMethod)?.id ??
      methods[0]?.id ??
      null,
  );

  const [fullName, setFullName] = useState(prefillUser?.fullName || '');
  const [phone, setPhone] = useState(prefillUser?.phone || '+260 ');
  const [email, setEmail] = useState(prefillUser?.email || '');
  const [notes, setNotes] = useState('');

  // Optional pre-arrival check-in details (never required just to request dates)
  const [countryOfResidence, setCountryOfResidence] = useState('');
  const [nationality, setNationality] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');
  const [city, setCity] = useState('');
  const [idType, setIdType] = useState<'nrc' | 'passport'>('nrc');
  const [nationalId, setNationalId] = useState('');
  const [purposeOfVisit, setPurposeOfVisit] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [agreedPolicy, setAgreedPolicy] = useState(true);

  const [availState, setAvailState] = useState<'checking' | 'available' | 'unavailable'>(
    'checking',
  );
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
        const hits = (json?.data?.hits ?? []) as {
          apartment: { id: string };
          available: boolean;
        }[];
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
          ...(countryOfResidence.trim() ? { countryOfResidence: countryOfResidence.trim() } : {}),
          ...(nationality.trim() ? { nationality: nationality.trim() } : {}),
          ...(residentialAddress.trim() ? { residentialAddress: residentialAddress.trim() } : {}),
          ...(city.trim() ? { city: city.trim() } : {}),
          ...(nationalId.trim() ? { idType, nationalId: nationalId.trim() } : {}),
          ...(purposeOfVisit ? { purposeOfVisit } : {}),
          ...(arrivalTime ? { arrivalTime } : {}),
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
      setError(
        'The connection was interrupted. Your request may have been received; check with reception before submitting again.',
      );
    } finally {
      setBusy(false);
    }
  }

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
      <div className="flex items-baseline justify-between gap-2 border-b border-sand-200 pb-4">
        <div>
          <span className="text-[1.45rem] font-bold tabular-nums text-navy-900">
            {formatKwacha(pricing.effectiveAverageRate)}
          </span>
          <span className="text-[0.82rem] text-sand-600"> / night</span>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${
            availState === 'available'
              ? 'bg-st-availableBg text-st-available'
              : availState === 'checking'
                ? 'bg-sand-100 text-sand-700'
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

      {/* Dates & Guests */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label mb-1 block" htmlFor="bw-in">
            Arrival
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
            Departure
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
          Guests (up to {apartment.maxGuests})
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
          <p className="label">Optional extras</p>
          {apartment.optionalServices
            .filter((s) => s.active)
            .map((svc) => (
              <label
                key={svc.id}
                className="flex cursor-pointer items-center justify-between rounded-md border border-sand-200 px-3 py-2 text-[0.8rem] hover:bg-sand-50"
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
                  {formatKwacha(svc.price)} {svc.priceType === 'per_night' ? '/ night' : ''}
                </span>
              </label>
            ))}
        </div>
      ) : null}

      {/* Stay Pricing Summary */}
      {pricing.nights > 0 ? (
        <div className="space-y-1.5 rounded-lg border border-sand-200 bg-sand-50 p-3.5 text-[0.82rem] tabular-nums">
          <div className="flex justify-between text-sand-700">
            <span>
              Accommodation ({pricing.nights} {pricing.nights === 1 ? 'night' : 'nights'})
            </span>
            <span>{formatKwacha(pricing.roomSubtotal)}</span>
          </div>
          {pricing.extraGuestTotal > 0 ? (
            <div className="flex justify-between text-sand-700">
              <span>Extra guest supplement</span>
              <span>{formatKwacha(pricing.extraGuestTotal)}</span>
            </div>
          ) : null}
          {pricing.servicesTotal > 0 ? (
            <div className="flex justify-between text-sand-700">
              <span>Selected extras</span>
              <span>{formatKwacha(pricing.servicesTotal)}</span>
            </div>
          ) : null}
          {pricing.totalDiscount > 0 ? (
            <div className="flex justify-between text-st-available">
              <span>Stay discount</span>
              <span>− {formatKwacha(pricing.totalDiscount)}</span>
            </div>
          ) : null}
          {pricing.taxRatePercent > 0 ? (
            <div className="flex justify-between text-sand-700">
              <span>
                {pricing.taxName} ({pricing.taxRatePercent}% {pricing.taxInclusive ? 'incl.' : 'excl.'})
              </span>
              <span>{formatKwacha(pricing.taxAmount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-sand-200 pt-2 text-[0.94rem] font-bold text-navy-900">
            <span>Stay total (ZMW)</span>
            <span>{formatKwacha(pricing.totalAmount)}</span>
          </div>
          {!sample ? (
            <div className="flex justify-between text-[0.77rem] text-sand-600">
              <span>Deposit to hold dates ({pricing.depositPercent}%)</span>
              <span className="font-medium text-navy-800">{formatKwacha(pricing.depositRequired)}</span>
            </div>
          ) : (
            <p className="pt-0.5 text-[0.76rem] leading-relaxed text-sand-600">
              Indicative rate. Reception confirms the actual unit and final ZMW total before payment.
            </p>
          )}
        </div>
      ) : null}

      {/* Guest Contact Fields — clean and non-invasive */}
      <div className="space-y-3 border-t border-sand-200 pt-3.5">
        <p className="text-[0.84rem] font-semibold text-navy-900">Your contact details</p>
        <div>
          <label className="label mb-1 block" htmlFor="bw-name">
            Full name <span className="text-st-cancelled">*</span>
          </label>
          <input
            id="bw-name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="field"
            placeholder="e.g. Chanda Mwale"
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label mb-1 block" htmlFor="bw-phone">
              Phone / WhatsApp <span className="text-st-cancelled">*</span>
            </label>
            <input
              id="bw-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="field"
              placeholder="+260 97…"
              required
            />
          </div>
          <div>
            <label className="label mb-1 block" htmlFor="bw-email">
              Email address <span className="text-st-cancelled">*</span>
            </label>
            <input
              id="bw-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
              placeholder="name@example.com"
              required
            />
          </div>
        </div>

        <div>
          <label className="label mb-1 block" htmlFor="bw-notes">
            Notes or requests (optional)
          </label>
          <textarea
            id="bw-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="field"
            placeholder="Late arrival, invoice company name, cot request…"
          />
        </div>

        {/* Optional fast-track arrival details — kept out of the guest's way until wanted */}
        <details className="group rounded-lg border border-sand-200 bg-sand-50/60 px-3.5 py-2.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[0.8rem] font-medium text-navy-800">
            <span>Add arrival time or check-in ID now (optional)</span>
            <ChevronDown
              size={15}
              className="shrink-0 text-sand-600 transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="mt-1.5 text-[0.74rem] leading-relaxed text-sand-600">
            You can skip this now and present your NRC or passport at reception on arrival.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label mb-1 block" htmlFor="bw-arrival">
                Estimated arrival
              </label>
              <input
                id="bw-arrival"
                type="time"
                className="field"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
              />
            </div>
            <div>
              <label className="label mb-1 block" htmlFor="bw-purpose">
                Purpose of stay
              </label>
              <select
                id="bw-purpose"
                className="field"
                value={purposeOfVisit}
                onChange={(e) => setPurposeOfVisit(e.target.value)}
              >
                <option value="">Not specified</option>
                <option value="business">Business</option>
                <option value="work">Project / Work</option>
                <option value="holiday">Holiday</option>
                <option value="family_visit">Family visit</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="label mb-1 block" htmlFor="bw-nationality">
                Nationality
              </label>
              <input
                id="bw-nationality"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                maxLength={100}
                className="field"
                placeholder="e.g. Zambian"
              />
            </div>
            <div>
              <label className="label mb-1 block" htmlFor="bw-residence">
                Country of residence
              </label>
              <input
                id="bw-residence"
                value={countryOfResidence}
                onChange={(e) => setCountryOfResidence(e.target.value)}
                maxLength={100}
                className="field"
                placeholder="e.g. Zambia"
              />
            </div>
            <div>
              <label className="label mb-1 block" htmlFor="bw-id-type">
                ID type
              </label>
              <select
                id="bw-id-type"
                className="field"
                value={idType}
                onChange={(e) => setIdType(e.target.value as 'nrc' | 'passport')}
              >
                <option value="nrc">Zambian NRC</option>
                <option value="passport">Passport</option>
              </select>
            </div>
            <div>
              <label className="label mb-1 block" htmlFor="bw-id">
                NRC / passport no.
              </label>
              <input
                id="bw-id"
                className="field"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                maxLength={32}
              />
            </div>
            <div>
              <label className="label mb-1 block" htmlFor="bw-city">
                Home city
              </label>
              <input
                id="bw-city"
                className="field"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <label className="label mb-1 block" htmlFor="bw-address">
                Residential address
              </label>
              <input
                id="bw-address"
                className="field"
                value={residentialAddress}
                onChange={(e) => setResidentialAddress(e.target.value)}
                maxLength={250}
              />
            </div>
          </div>
        </details>
      </div>

      {/* Payment Channel Selection (for verified apartments) */}
      {!sample ? (
        methods.length > 0 ? (
          <fieldset className="border-t border-sand-200 pt-3.5">
            <legend className="label mb-1.5 block">
              {locked ? 'Payment channel' : 'Preferred deposit channel'}
            </legend>
            <div className="grid grid-cols-2 gap-2">
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
                        ? 'border-navy-900 bg-sand-100 font-semibold text-navy-900 ring-1 ring-navy-900'
                        : 'border-sand-300 bg-white text-navy-700 hover:border-brand-400'
                    } ${locked && !active ? 'opacity-50' : ''}`}
                  >
                    <Icon size={14} className="shrink-0 text-lemma-dark" aria-hidden="true" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>

            {chosen ? (
              <div className="mt-2.5 rounded-lg border border-sand-200 bg-sand-50/70 p-3 text-[0.79rem] leading-relaxed text-navy-800">
                <PaymentDetails method={chosen} />
              </div>
            ) : null}
          </fieldset>
        ) : (
          <p className="rounded-lg border border-st-cleaning/40 bg-st-cleaningBg/40 p-3 text-[0.79rem] text-navy-800">
            Online deposit instructions are being updated. Call or WhatsApp reception to book directly.
          </p>
        )
      ) : null}

      <label className="flex items-start gap-2 border-t border-sand-200 pt-3 text-[0.78rem] leading-relaxed text-sand-700">
        <input
          type="checkbox"
          checked={agreedPolicy}
          onChange={(e) => setAgreedPolicy(e.target.checked)}
          className="mt-0.5"
          required
        />
        <span>
          I agree to the{' '}
          <Link href="/policies" target="_blank" className="font-medium text-navy-900 underline">
            check-in, deposit and cancellation terms
          </Link>
          .
        </span>
      </label>

      {error ? (
        <p className="flex items-start gap-2 rounded-md border border-st-cancelled/30 bg-st-cancelledBg px-3 py-2 text-[0.8rem] text-st-cancelled">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || availState !== 'available' || (!sample && !method)}
        className="btn btn-primary w-full justify-center py-2.5 text-[0.88rem]"
      >
        {busy
          ? 'Sending request…'
          : sample
            ? 'Send enquiry to reception'
            : `Request to book${pricing.totalAmount > 0 ? ` · ${formatKwacha(pricing.totalAmount)}` : ''}`}
      </button>

      <p className="text-center text-[0.73rem] leading-relaxed text-sand-600">
        {sample
          ? 'No payment is asked for now. Reception confirms the apartment and ZMW quote first.'
          : 'No money is charged on this form. Next, you get your reference and deposit upload box.'}
      </p>
    </form>
  );
}

/* --------------------------------------------------------------------------- */

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
  const [amount, setAmount] = useState(
    String(booking.payment?.suggestedAmount ?? booking.depositDue ?? ''),
  );
  const [txnRef, setTxnRef] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [proof, setProof] = useState<{
    fileName: string;
    mimeType: string;
    dataUrl: string;
    sizeBytes: number;
  } | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ amount: number; reference: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const waDigits = booking.contactWhatsapp.replace(/[^0-9]/g, '');

  useEffect(() => {
    if (booking.sample && booking.status === 'inquiry') return;
    if (booking.payment?.method === method) {
      setInstructions(booking.payment);
      return;
    }
    let cancelled = false;
    setLoadingInstructions(true);
    fetch(
      `/api/payments/claims?reservationId=${encodeURIComponent(booking.id)}&method=${method}`,
      {
        credentials: 'same-origin',
      },
    )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const q = json?.data?.quote;
        const m = (q?.methods ?? []).find((x: MethodView) => x.id === method);
        if (m && q) {
          setInstructions({
            ...m,
            method: m.id,
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
      setProofError(
        'That file is over 500 KB. Choose a smaller screenshot, or submit the transaction reference without an attachment.',
      );
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      setProofError('Use a JPEG, PNG, WebP image or a PDF.');
      return;
    }
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
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
      setError('Enter the transaction reference, SMS code or bank slip number.');
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
            ? {
                fileName: proof.fileName,
                mimeType: proof.mimeType,
                dataUrl: proof.dataUrl,
                sizeBytes: proof.sizeBytes,
              }
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
      setError(
        'Network error — we could not confirm whether the proof was submitted. Check your booking or contact reception before trying again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const shown = instructions ?? booking.payment;

  if (booking.sample && booking.status === 'inquiry') {
    return (
      <div className="card sticky top-24 space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-st-available" />
          <div>
            <h2 className="font-display text-[1.25rem] font-medium text-navy-900">
              Enquiry received
            </h2>
            <p className="mt-0.5 text-[0.82rem] text-sand-700">
              Reference <strong className="font-mono text-navy-900">{booking.reference}</strong> ·{' '}
              {formatMediumDate(booking.checkIn)} to {formatMediumDate(booking.checkOut)}
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-sand-200 bg-sand-50 p-3.5 text-[0.84rem] leading-relaxed text-navy-800">
          Because this listing is an example unit, reception will confirm the actual apartment,
          dates and final ZMW rate first. <strong>Please do not send a deposit yet.</strong>
        </div>
        <div className="flex flex-col gap-2">
          {prefillUser ? (
            <Link href="/account" className="btn btn-primary justify-center">
              View in my account
            </Link>
          ) : (
            <Link
              href={`/booking/${encodeURIComponent(booking.id)}`}
              className="btn btn-primary justify-center"
            >
              View enquiry status
            </Link>
          )}
          {waDigits ? (
            <a
              href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello, please confirm my enquiry ${booking.reference} (${booking.checkIn} to ${booking.checkOut}).`)}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary justify-center"
            >
              <MessageCircle size={15} /> Message reception on WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="card sticky top-24 space-y-4 p-5 sm:p-6">
      <div className="flex items-start gap-2.5">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-st-available" />
        <div>
          <h2 className="font-display text-[1.22rem] font-medium text-navy-900">
            {submitted ? 'Payment sent for review' : 'Booking request recorded'}
          </h2>
          <p className="mt-0.5 text-[0.82rem] text-sand-700">
            Ref <strong className="font-mono text-navy-900">{booking.reference}</strong> · Apt{' '}
            {booking.apartmentNumber} · {booking.nights} night{booking.nights === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Clear 3-step visual progress so the guest knows where they stand */}
      <ol className="grid grid-cols-3 gap-1.5 rounded-lg border border-sand-200 bg-sand-50 p-2 text-center text-[0.7rem]">
        <li className="rounded bg-white px-1.5 py-1.5 font-semibold text-st-available ring-1 ring-sand-200">
          1. Requested ✓
        </li>
        <li
          className={`rounded px-1.5 py-1.5 font-semibold ${
            submitted
              ? 'bg-white text-st-available ring-1 ring-sand-200'
              : 'bg-navy-900 text-white'
          }`}
        >
          2. {submitted ? 'Proof sent ✓' : 'Send deposit'}
        </li>
        <li
          className={`rounded px-1.5 py-1.5 font-medium ${
            submitted ? 'bg-st-cleaningBg text-st-cleaning' : 'text-sand-600'
          }`}
        >
          3. Staff verify
        </li>
      </ol>

      {!prefillUser ? (
        <p className="text-[0.8rem] text-sand-700">
          <Link className="link font-medium" href={`/booking/${encodeURIComponent(booking.id)}`}>
            Open booking page
          </Link>{' '}
          ·{' '}
          <Link className="link" href="/booking/access">
            Find later by reference
          </Link>
        </p>
      ) : null}

      {submitted ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-st-available/35 bg-st-availableBg/60 p-3.5 text-[0.84rem] leading-relaxed text-navy-800">
            <p className="font-semibold text-navy-900">
              {formatKwacha(submitted.amount)} reference recorded ({submitted.reference}).
            </p>
            <p className="mt-1 text-[0.8rem] text-sand-700">
              Reception will match this against our mobile-money or bank statement, confirm your
              reservation, and issue your official PDF receipt.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {prefillUser ? (
              <Link href="/account" className="btn btn-primary justify-center">
                Track status in my account
              </Link>
            ) : (
              <>
                <Link href="/register" className="btn btn-primary justify-center">
                  Create a guest account to track receipts
                </Link>
                <p className="text-center text-[0.74rem] text-sand-600">
                  Save reference <strong className="font-mono">{booking.reference}</strong>. Verify
                  your email after registering to link this stay to your account.
                </p>
              </>
            )}
            {waDigits ? (
              <a
                href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello Lemma Apartments, I have paid for booking ${booking.reference} (ref: ${submitted.reference}).`)}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary justify-center"
              >
                <MessageCircle size={15} /> Notify reception on WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2 rounded-lg border border-sand-200 bg-sand-50 p-3.5 text-[0.83rem]">
            <div className="flex justify-between">
              <span className="text-sand-600">Stay total</span>
              <span className="font-semibold tabular-nums text-navy-900">
                {formatKwacha(shown?.totalAmount ?? booking.totalAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sand-600">
                Deposit to hold dates ({shown?.depositPercent ?? booking.depositPercent}%)
              </span>
              <span className="font-bold tabular-nums text-navy-900">
                {formatKwacha(booking.depositDue)}
              </span>
            </div>
            <div className="border-t border-sand-200 pt-2">
              <CopyDetail label="Quote reference" value={booking.reference} />
            </div>
            {shown ? (
              <div className="border-t border-sand-200 pt-2">
                <p className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-sand-600">
                  {shown.label} details
                </p>
                <PaymentDetails method={shown} />
              </div>
            ) : null}
          </div>

          {booking.methods.length > 1 ? (
            <div>
              <p className="label mb-1.5 block">Switch payment channel</p>
              <div className="flex flex-wrap gap-1.5">
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
                          ? 'border-navy-900 bg-sand-100 font-semibold text-navy-900'
                          : 'border-sand-300 bg-white text-navy-700'
                      }`}
                    >
                      <Icon size={13} /> {m.label}
                    </button>
                  );
                })}
              </div>
              {loadingInstructions ? (
                <p className="mt-1 flex items-center gap-1.5 text-[0.74rem] text-sand-600">
                  <Loader2 size={12} className="animate-spin" /> Loading channel details…
                </p>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={submitProof} className="space-y-3 border-t border-sand-200 pt-3.5">
            <p className="text-[0.85rem] font-semibold text-navy-900">
              Already sent the payment? Submit your reference below
            </p>

            {error ? (
              <p className="flex items-start gap-2 rounded-md border border-st-cancelled/30 bg-st-cancelledBg px-3 py-2 text-[0.8rem] text-st-cancelled">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                Transaction ID / SMS or bank reference
              </label>
              <input
                id="bp-ref"
                className="field"
                value={txnRef}
                onChange={(e) => setTxnRef(e.target.value)}
                placeholder={
                  method === 'bank_transfer'
                    ? 'Bank transfer or slip reference'
                    : 'e.g. MP260718.1234.C56789'
                }
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
                  <span className="truncate text-navy-800">{proof.fileName}</span>
                  <button
                    type="button"
                    className="text-[0.76rem] font-medium text-sand-700 hover:underline"
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
                  <ImagePlus size={14} /> Attach screenshot or slip (optional, max 500 KB)
                </button>
              )}
              {proofError ? (
                <p className="mt-1 text-[0.76rem] text-st-cancelled">{proofError}</p>
              ) : null}
            </div>

            <p className="flex items-start gap-1.5 rounded-md bg-sand-50 p-2.5 text-[0.75rem] leading-relaxed text-sand-700">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-lemma-dark" />
              Reception verifies every transfer before updating your balance and issuing a receipt.
            </p>

            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary w-full justify-center py-2.5"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {busy ? 'Submitting…' : 'Submit payment reference'}
            </button>
          </form>

          <div className="border-t border-sand-200 pt-3 text-[0.78rem] leading-relaxed text-sand-600">
            <p className="flex items-start gap-1.5">
              <Clock size={13} className="mt-0.5 shrink-0" />
              Paying later or in cash at the desk? Keep{' '}
              <strong className="font-mono text-navy-900">{booking.reference}</strong> handy.
            </p>
            {waDigits ? (
              <a
                href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello Lemma Apartments, I have submitted booking request ${booking.reference} for ${booking.checkIn} to ${booking.checkOut}.`)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 font-medium text-navy-900 hover:text-lemma-dark"
              >
                <MessageCircle size={13} /> Send reference to reception on WhatsApp
              </a>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
