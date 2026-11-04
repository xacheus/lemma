import { bookingCookieName, hasBookingAccess, ownsBooking } from '@/lib/booking/access';
import { HttpError, publicRoute, readBody } from '@/lib/api/http';
import { guestPaymentClaimSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { paymentQuote, submitPaymentClaim } from '@/lib/domain/operations';
import { buildSnapshot } from '@/lib/api/snapshot';

export const runtime = 'nodejs';

export const GET = publicRoute(async ({ req, search, session }) => {
  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const reservationId = search.get('reservationId') ?? '';
  const reservation = db.reservations.find((r) => r.id === reservationId);
  if (
    !reservation ||
    !hasBookingAccess(db, reservation, session, req.cookies.get(bookingCookieName(reservationId))?.value)
  ) {
    throw new HttpError('Booking not found or access has expired.', 404, 'not_found');
  }

  const mine = ownsBooking(db, reservation, session);

  if (!mine) {
    const quote = paymentQuote(db, reservation);
    const wanted = (search.get('method') ?? '').trim();
    return {
      quote: {
        reservationId: quote.reservationId,
        reference: quote.reference,
        totalAmount: quote.totalAmount,
        verifiedPaid: quote.verifiedPaid,
        pendingAmount: quote.pendingAmount,
        balanceDue: quote.balanceDue,
        depositPercent: quote.depositPercent,
        suggestedAmount: quote.suggestedAmount,
        allowPartial: quote.allowPartial,
        guestChoosesMethod: quote.guestChoosesMethod,
        defaultMethod: quote.methods.some((method) => method.id === wanted)
          ? wanted
          : quote.defaultMethod,
        methods: quote.methods,
        openClaim: null,
        claims: [],
        proofUploadEnabled: quote.proofUploadEnabled,
      },
      detail: 'Payment instructions for this booking. Sign in to view full payment history and receipts.',
    };
  }

  const quote = paymentQuote(db, reservation);
  const wanted = search.get('method') ?? '';
  if (wanted && quote.methods.some((m) => m.id === wanted)) {
    return { quote: { ...quote, defaultMethod: wanted } };
  }
  return { quote };
});

export const POST = publicRoute(async ({ req, session }) => {
  const input = await readBody(req, guestPaymentClaimSchema);
  return runAtomicTransaction((db) => {
    const reservation = db.reservations.find((r) => r.id === input.reservationId);
    if (
      !reservation ||
      !hasBookingAccess(
        db,
        reservation,
        session,
        req.cookies.get(bookingCookieName(input.reservationId))?.value,
      )
    ) {
      throw new HttpError('Booking not found or access has expired.', 404, 'not_found');
    }
    const claim = submitPaymentClaim(db, {
      reservationId: input.reservationId,
      userId: ownsBooking(db, reservation, session) ? session!.uid : null,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
      paidAt: input.paidAt,
      note: input.note,
      proof: input.proof ?? null,
    });
    const confirmedReservation = db.reservations.find((r) => r.id === claim.reservationId)!;
    return {
      claim,
      quote: paymentQuote(db, confirmedReservation),
      snapshot: ownsBooking(db, reservation, session) ? buildSnapshot(db, session!) : null,
    };
  });
});
