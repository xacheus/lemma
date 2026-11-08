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
        <div role="alert" className="swdl-card space-y-4 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-st-cleaning" />
            <div>
              <h1 className="font-heading text-[1.45rem] font-medium text-swdl-navy">
                Verify access to view this booking
              </h1>
              <p className="mt-1 text-[0.88rem] leading-relaxed text-swdl-muted">{error}</p>
            </div>
          </div>
          <p className="text-[0.84rem] leading-relaxed text-swdl-muted">
            For guest privacy, visitor booking pages open only in the browser where the request was
            made or via a fresh access link.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <Link href="/booking/access" className="btn btn-gold">
              Request access link by reference
            </Link>
            <Link href="/login" className="btn btn-navy-outline">
              Sign in to account
            </Link>
          </div>
          {waDigits ? (
            <p className="border-t border-[#DFE3E8] pt-4 text-[0.8rem] text-swdl-muted">
              Need help right away?{' '}
              <a
                href={`https://wa.me/${waDigits}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-swdl-navy underline"
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
      <div className="mx-auto flex max-w-xl items-center justify-center gap-2.5 px-4 py-20 text-[0.9rem] text-swdl-muted">
        <Loader2 size={18} className="animate-spin text-swdl-goldDark" /> Loading your booking…
      </div>
    );
  }

  const statusMeta = BOOKING_STATUS_META[booking.status];
  const canPay =
    booking.balanceDue > 0 &&
    !['cancelled', 'checked_out', 'inquiry'].includes(booking.status) &&
    !booking.hasOpenClaim;

  const badge = booking.hasOpenClaim
    ? { label: 'Payment under review', chip: 'bg-st-cleaningBg text-st-cleaning' }
    : booking.paymentStatus === 'fully_paid'
      ? { label: 'Confirmed & paid in full', chip: 'bg-st-availableBg text-st-available' }
      : { label: statusMeta?.label ?? booking.status, chip: statusMeta?.chip ?? 'bg-swdl-light text-swdl-ink' };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12 sm:px-6">
      <div>
        <p className="text-[0.78rem] font-medium text-swdl-goldDark">Visitor booking summary</p>
        <h1 className="mt-1 font-heading text-[1.95rem] font-medium tracking-[-0.015em] text-swdl-navy">
          Booking {booking.reference}
        </h1>
      </div>

      <div className="swdl-card space-y-5 p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DFE3E8] pb-4">
          <div>
            <h2 className="font-heading text-[1.3rem] font-medium text-swdl-navy">
              {booking.apartment}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.85rem] text-swdl-muted">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={14} className="text-swdl-goldDark" />
                {formatMediumDate(booking.checkIn)} → {formatMediumDate(booking.checkOut)}
                {booking.nights ? ` (${booking.nights} ${booking.nights === 1 ? 'night' : 'nights'})` : ''}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users size={14} className="text-swdl-goldDark" />
                {booking.guests} {booking.guests === 1 ? 'guest' : 'guests'}
              </span>
            </p>
          </div>
          <span className={`chip ${badge.chip}`}>{badge.label}</span>
        </div>

        {/* Financial breakdown */}
        <dl className="grid grid-cols-1 gap-3 rounded-lg border border-[#DFE3E8] bg-swdl-light p-4 text-[0.85rem] tabular-nums sm:grid-cols-3">
          <div>
            <dt className="text-[0.74rem] text-swdl-muted">Stay total</dt>
            <dd className="mt-0.5 text-[1.05rem] font-bold text-swdl-navy">
              {formatKwacha(booking.totalAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-[0.74rem] text-swdl-muted">Verified paid</dt>
            <dd className="mt-0.5 text-[1.05rem] font-semibold text-st-available">
              {formatKwacha(booking.verifiedPaid)}
            </dd>
          </div>
          <div>
            <dt className="text-[0.74rem] text-swdl-muted">Remaining balance</dt>
            <dd className="mt-0.5 text-[1.05rem] font-bold text-swdl-navy">
              {formatKwacha(booking.balanceDue)}
            </dd>
          </div>
        </dl>

        {booking.hasOpenClaim ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-st-cleaning/30 bg-st-cleaningBg/60 p-4 text-[0.84rem] leading-relaxed text-swdl-navy">
            <Clock size={17} className="mt-0.5 shrink-0 text-st-cleaning" />
            <div>
              <p className="font-semibold">
                Payment reference received
                {booking.pendingAmount ? ` (${formatKwacha(booking.pendingAmount)})` : ''}
              </p>
              <p className="mt-0.5 text-[0.8rem] text-swdl-muted">
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
              className="btn btn-gold min-h-11"
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
              className="btn btn-navy-outline min-h-11"
            >
              <MessageCircle size={15} /> WhatsApp reception
            </a>
          ) : null}
          <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="btn btn-ghost min-h-11">
            <Phone size={14} /> {property.phone}
          </a>
        </div>

        <div className="border-t border-[#DFE3E8] pt-4 text-[0.8rem] leading-relaxed text-swdl-muted">
          <p>
            <strong className="text-swdl-ink">Arrival &amp; departure:</strong> Check-in from{' '}
            {checkInTime}, check-out by {checkOutTime} at {property.addressLine}, {property.city}.
          </p>
          <p className="mt-1">
            Want downloadable PDF receipts in one place?{' '}
            <Link href="/register" className="font-semibold text-swdl-navy underline">
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
