import { bookingCookieName, hasBookingAccess, ownsBooking } from '@/lib/booking/access';
import { HttpError, publicRoute, readBody } from '@/lib/api/http';
import { guestPaymentClaimSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { paymentQuote, submitPaymentClaim, OperationError } from '@/lib/domain/operations';
import { buildSnapshot } from '@/lib/api/snapshot';
import { isSampleListing } from '@/lib/domain/sample-listings';

export const runtime = 'nodejs';

/**
 * Guest-submitted payments.
 *
 * GET  — what is outstanding on a booking and which channels they may pay through.
 *        The guest chooses the channel; the business sets which channels exist.
 * POST — record a claim ("I paid K1,800 by Airtel Money, reference MP2607…").
 *        A claim never banks money: the balance is untouched until staff verify it
 *        through POST /api/payments, which links the claim to a real receipt.
 */
export const GET = publicRoute(async ({ req, search, session }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const reservationId = search.get('reservationId') ?? '';
    const reservation = db.reservations.find((r) => r.id === reservationId);
    if (!reservation || !hasBookingAccess(db, reservation, session, req.cookies.get(bookingCookieName(reservationId))?.value)) {
      throw new HttpError('Booking not found or access has expired.', 404, 'not_found');
    }
    const sample = db.apartments.find((a) => a.id === reservation.apartmentId);
    if (sample && isSampleListing(sample) && reservation.status === 'inquiry') {
      return { quote: null, detail: 'Reception needs to confirm this example listing before payment.' };
    }

    const mine = ownsBooking(db, reservation, session);

    // A verified visitor capability gets payment information but no account history.
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
          defaultMethod: quote.methods.some((method) => method.id === wanted) ? wanted : quote.defaultMethod,
          methods: quote.methods,
          openClaim: null,
          claims: [],
          proofUploadEnabled: quote.proofUploadEnabled,
        },
        // Say plainly what is limited, so the guest knows to sign in for the rest.
        detail: 'Payment instructions for this booking. Sign in to see payments and receipts.',
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
      if (!reservation || !hasBookingAccess(db, reservation, session, req.cookies.get(bookingCookieName(input.reservationId))?.value)) {
        throw new HttpError('Booking not found or access has expired.', 404, 'not_found');
      }
      const sample = db.apartments.find((a) => a.id === reservation.apartmentId);
      if (reservation?.status === 'inquiry' && sample && isSampleListing(sample)) {
        throw new OperationError('Please wait for reception to confirm this apartment before paying.', 409, 'confirmation_required');
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
        // Only a signed-in guest gets their whole snapshot back.
        snapshot: ownsBooking(db, reservation, session) ? buildSnapshot(db, session!) : null,
      };
    });
});
