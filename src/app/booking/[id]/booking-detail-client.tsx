'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  MessageCircle,
  Phone,
  Users,
} from 'lucide-react';
import type { BookingStatus, PaymentStatus, Settings } from '@/lib/domain/types';
import { formatKwacha } from '@/lib/domain/money';
import { formatMediumDate } from '@/lib/domain/dates';
import { BOOKING_STATUS_META } from '@/lib/domain/status';
import { GuestPaymentPanel } from '@/app/account/guest-payment-panel';

interface GuestBookingData {
  id: string;
  reference: string;
  checkIn: string;
  checkOut: string;
  nights?: number;
  guests: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  apartment: string;
  sample?: boolean;
  totalAmount: number;
  verifiedPaid: number;
  pendingAmount?: number;
  hasOpenClaim?: boolean;
  balanceDue: number;
}

export function GuestBookingClient({
  id,
  property,
  checkInTime,
  checkOutTime,
}: {
  id: string;
  property: Settings['property'];
  checkInTime: string;
  checkOutTime: string;
}) {
  const [booking, setBooking] = useState<GuestBookingData | null>(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(`/api/public/booking-access?reservationId=${encodeURIComponent(id)}`, {
      cache: 'no-store',
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (active) setBooking(data.data);
      })
      .catch(() => {
        if (active)
          setError(
            'This booking link has expired or was opened on a different browser.',
          );
      });
    return () => {
      active = false;
    };
  }, [id, version]);

  const waDigits = property.whatsapp.replace(/[^0-9]/g, '');

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
        <div role="alert" className="card space-y-4 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-st-cleaning" />
            <div>
              <h1 className="font-display text-[1.45rem] font-medium text-navy-900">
                Verify access to view this booking
              </h1>
              <p className="mt-1 text-[0.88rem] leading-relaxed text-sand-700">{error}</p>
            </div>
          </div>
          <p className="text-[0.84rem] leading-relaxed text-sand-700">
            For guest privacy, visitor booking pages open only in the browser where the request was
            made or via a fresh access link.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <Link href="/booking/access" className="btn btn-primary">
              Request access link by reference
            </Link>
            <Link href="/login" className="btn btn-secondary">
              Sign in to account
            </Link>
          </div>
          {waDigits ? (
            <p className="border-t border-sand-200 pt-4 text-[0.8rem] text-sand-600">
              Need help right away?{' '}
              <a
                href={`https://wa.me/${waDigits}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-navy-900 underline"
              >
                Message reception on WhatsApp ({property.whatsapp})
              </a>
              .
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="mx-auto flex max-w-xl items-center justify-center gap-2.5 px-4 py-20 text-[0.9rem] text-sand-700">
        <Loader2 size={18} className="animate-spin text-lemma-dark" /> Loading your booking…
      </div>
    );
  }

  const statusMeta = BOOKING_STATUS_META[booking.status];
  const pendingExample = booking.sample && booking.status === 'inquiry';
  const canPay =
    booking.balanceDue > 0 &&
    !['cancelled', 'checked_out', 'inquiry'].includes(booking.status) &&
    !booking.hasOpenClaim;

  const badge = booking.hasOpenClaim
    ? { label: 'Payment under review', chip: 'bg-st-cleaningBg text-st-cleaning' }
    : booking.paymentStatus === 'fully_paid'
      ? { label: 'Confirmed & paid in full', chip: 'bg-st-availableBg text-st-available' }
      : { label: statusMeta?.label ?? booking.status, chip: statusMeta?.chip ?? 'bg-sand-100 text-navy-800' };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12 sm:px-6">
      <div>
        <p className="text-[0.78rem] font-medium text-lemma-dark">Visitor booking summary</p>
        <h1 className="mt-1 font-display text-[1.95rem] font-medium tracking-[-0.015em] text-navy-900">
          Booking {booking.reference}
        </h1>
      </div>

      <div className="card space-y-5 p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sand-200 pb-4">
          <div>
            <h2 className="font-display text-[1.3rem] font-medium text-navy-900">
              {booking.apartment}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.85rem] text-sand-700">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={14} className="text-lemma-dark" />
                {formatMediumDate(booking.checkIn)} → {formatMediumDate(booking.checkOut)}
                {booking.nights ? ` (${booking.nights} ${booking.nights === 1 ? 'night' : 'nights'})` : ''}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users size={14} className="text-lemma-dark" />
                {booking.guests} {booking.guests === 1 ? 'guest' : 'guests'}
              </span>
            </p>
          </div>
          <span className={`chip ${badge.chip}`}>{badge.label}</span>
        </div>

        {/* Financial breakdown */}
        <dl className="grid grid-cols-1 gap-3 rounded-lg border border-sand-200 bg-sand-50 p-4 text-[0.85rem] tabular-nums sm:grid-cols-3">
          <div>
            <dt className="text-[0.74rem] text-sand-600">
              {pendingExample ? 'Indicative total' : 'Stay total'}
            </dt>
            <dd className="mt-0.5 text-[1.05rem] font-bold text-navy-900">
              {formatKwacha(booking.totalAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-[0.74rem] text-sand-600">Verified paid</dt>
            <dd className="mt-0.5 text-[1.05rem] font-semibold text-st-available">
              {formatKwacha(booking.verifiedPaid)}
            </dd>
          </div>
          <div>
            <dt className="text-[0.74rem] text-sand-600">Remaining balance</dt>
            <dd className="mt-0.5 text-[1.05rem] font-bold text-navy-900">
              {formatKwacha(booking.balanceDue)}
            </dd>
          </div>
        </dl>

        {pendingExample ? (
          <div className="rounded-lg border border-sand-200 bg-white p-4 text-[0.84rem] leading-relaxed text-sand-700">
            <strong className="font-semibold text-navy-900">Awaiting reception confirmation:</strong>{' '}
            This request was made against an example listing. Reception will confirm the exact unit
            and final ZMW quote before payment instructions open.
          </div>
        ) : booking.hasOpenClaim ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-st-cleaning/30 bg-st-cleaningBg/60 p-4 text-[0.84rem] leading-relaxed text-navy-900">
            <Clock size={17} className="mt-0.5 shrink-0 text-st-cleaning" />
            <div>
              <p className="font-semibold">
                Payment reference received
                {booking.pendingAmount ? ` (${formatKwacha(booking.pendingAmount)})` : ''}
              </p>
              <p className="mt-0.5 text-[0.8rem] text-sand-700">
                Reception is checking your payment against our statement. Once verified, your
                balance updates automatically.
              </p>
            </div>
          </div>
        ) : booking.balanceDue === 0 && booking.verifiedPaid > 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-st-available/30 bg-st-availableBg/60 p-3.5 text-[0.84rem] font-medium text-st-available">
            <CheckCircle2 size={16} /> Your stay balance is settled in full.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {canPay ? (
            <button
              type="button"
              className="btn btn-primary min-h-11"
              onClick={() => setPaying(true)}
            >
              <CreditCard size={15} /> Pay deposit or submit proof
            </button>
          ) : null}
          {waDigits ? (
            <a
              href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello ${property.name}, I am following up on booking ${booking.reference}.`)}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary min-h-11"
            >
              <MessageCircle size={15} /> WhatsApp reception
            </a>
          ) : null}
          <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="btn btn-ghost min-h-11">
            <Phone size={14} /> {property.phone}
          </a>
        </div>

        <div className="border-t border-sand-200 pt-4 text-[0.8rem] leading-relaxed text-sand-600">
          <p>
            <strong className="text-navy-800">Arrival &amp; departure:</strong> Check-in from{' '}
            {checkInTime}, check-out by {checkOutTime} at {property.addressLine}, {property.city}.
          </p>
          <p className="mt-1">
            Want downloadable PDF receipts in one place?{' '}
            <Link href="/register" className="font-semibold text-navy-900 underline">
              Create a guest account
            </Link>{' '}
            with the same email address.
          </p>
        </div>
      </div>

      {paying ? (
        <GuestPaymentPanel
          reservationId={booking.id}
          reference={booking.reference}
          onClose={() => setPaying(false)}
          onSubmitted={() => setVersion((v) => v + 1)}
        />
      ) : null}
    </div>
  );
}
