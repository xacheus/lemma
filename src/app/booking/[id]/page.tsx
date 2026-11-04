'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatKwacha } from '@/lib/domain/money';
import { GuestPaymentPanel } from '@/app/account/guest-payment-panel';

interface Booking { id: string; reference: string; checkIn: string; checkOut: string; guests: number; status: string; paymentStatus: string; apartment: string; totalAmount: number; verifiedPaid: number; balanceDue: number }
export default function GuestBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => { let active = true; fetch(`/api/public/booking-access?reservationId=${encodeURIComponent(id)}`, { cache: 'no-store' }).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error); if (active) setBooking(data.data); }).catch(() => { if (active) setError('Booking not found or access has expired.'); }); return () => { active = false; }; }, [id, version]);
  return <main className="mx-auto max-w-xl space-y-4 px-4 py-12"><h1 className="text-2xl font-semibold">Your booking</h1>{error ? <div role="alert"><p>{error}</p><Link className="link" href="/booking/access">Request a secure access link</Link></div> : !booking ? <p>Loading…</p> : <div className="card space-y-3 p-5"><p className="font-semibold">{booking.reference} · {booking.apartment}</p><p>{booking.checkIn} to {booking.checkOut} · {booking.guests} guests</p><p>Booking: {booking.status.replace(/_/g, ' ')} · Payment: {booking.paymentStatus.replace(/_/g, ' ')}</p><p>Total {formatKwacha(booking.totalAmount)} · Verified paid {formatKwacha(booking.verifiedPaid)} · Balance {formatKwacha(booking.balanceDue)}</p>{booking.balanceDue > 0 && !['cancelled', 'inquiry'].includes(booking.status) ? <button type="button" className="btn-primary min-h-11" onClick={() => setPaying(true)}>View payment details</button> : null}</div>}{paying && booking ? <GuestPaymentPanel reservationId={booking.id} reference={booking.reference} onClose={() => setPaying(false)} onSubmitted={() => setVersion((v) => v + 1)} /> : null}</main>;
}
