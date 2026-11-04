import { OFFICIAL_BRAND_NAME } from '@/lib/brand';
import { isBrevoEmailConfigured } from '@/lib/notifications/email-config';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  addBookingAccess,
  bookingAccessLink,
  exchangeBookingAccess,
  bookingCookie,
  bookingCookieName,
  createBookingAccessToken,
  hasBookingAccess,
} from '@/lib/booking/access';
import { getSession } from '@/lib/auth/session';
import { getDb, ensureCloudFirestoreHydrated, runAtomicTransaction } from '@/lib/db/store';
import { paymentQuote } from '@/lib/domain/operations';
import { take } from '@/lib/api/rate-limit';
import { buildBrandedEmailHtml, sendEmailNotification } from '@/lib/notifications/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const generic =
  'If those details match a booking, we have sent a one-time access link to that email address. If nothing arrives within a few minutes, please contact reception.';
const requestSchema = z.object({
  action: z.literal('request'),
  reference: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
});
const exchangeSchema = z.object({
  action: z.literal('exchange'),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local';
  if (!take(`booking-access:${ip}`).allowed) {
    return NextResponse.json(
      { ok: false, error: 'Please wait a moment before trying again.' },
      { status: 429 },
    );
  }
  const body = await req.json().catch(() => null);
  const exchange = exchangeSchema.safeParse(body);
  if (exchange.success) {
    const newToken = createBookingAccessToken();
    const reservationId = await runAtomicTransaction((db) =>
      exchangeBookingAccess(db, exchange.data.token, newToken),
    );
    if (!reservationId) {
      return NextResponse.json(
        { ok: false, error: 'This link is invalid or expired. Request a new one.' },
        { status: 400 },
      );
    }
    const response = NextResponse.json(
      { ok: true, data: { reservationId } },
      { headers: { 'cache-control': 'no-store' } },
    );
    response.cookies.set(bookingCookie(reservationId, newToken));
    return response;
  }
  const request = requestSchema.safeParse(body);
  if (!request.success) {
    return NextResponse.json(
      { ok: false, error: 'Enter a booking reference and a valid email.' },
      { status: 422 },
    );
  }
  const token = createBookingAccessToken();
  const link = bookingAccessLink(token);
  if (link && isBrevoEmailConfigured()) {
    const match = await runAtomicTransaction((db) => {
      const booking = db.reservations.find(
        (r) => r.reference.toLowerCase() === request.data.reference.toLowerCase(),
      );
      const guest = booking && db.guests.find((g) => g.id === booking.guestId);
      if (
        !booking ||
        !guest ||
        booking.userId ||
        guest.userId ||
        guest.email.toLowerCase() !== request.data.email.toLowerCase()
      ) {
        return null;
      }
      addBookingAccess(db, booking.id, token, 30 * 60);
      return { email: guest.email, reference: booking.reference };
    });
    if (match) {
      const textBody = `Use this one-time link to open booking ${match.reference}. It expires in 30 minutes.\n\n${link}\n\nIf you did not request it, ignore this email.`;
      await sendEmailNotification({
        to: match.email,
        subject: `Your ${OFFICIAL_BRAND_NAME} booking link`,
        textBody,
        htmlBody: buildBrandedEmailHtml({
          subject: `Your ${OFFICIAL_BRAND_NAME} booking link`,
          body: textBody,
          ctaLabel: 'Open booking',
          ctaUrl: link,
        }),
      });
    }
  }
  return NextResponse.json(
    { ok: true, data: { message: generic } },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function GET(req: NextRequest) {
  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const session = await getSession();
  const id = req.nextUrl.searchParams.get('reservationId') ?? '';
  const booking = db.reservations.find((r) => r.id === id);
  if (
    !booking ||
    !hasBookingAccess(db, booking, session, req.cookies.get(bookingCookieName(id))?.value)
  ) {
    return NextResponse.json(
      { ok: false, error: 'Booking not found or access has expired.' },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    );
  }
  const quote = paymentQuote(db, booking);
  return NextResponse.json(
    {
      ok: true,
      data: {
        id: booking.id,
        reference: booking.reference,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        nights: booking.nights,
        guests: booking.guestCount,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        apartment: db.apartments.find((a) => a.id === booking.apartmentId)?.name ?? 'Apartment',
        totalAmount: quote.totalAmount,
        verifiedPaid: quote.verifiedPaid,
        pendingAmount: quote.pendingAmount,
        hasOpenClaim: Boolean(quote.openClaim),
        balanceDue: quote.balanceDue,
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
