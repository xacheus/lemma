import { publicRoute, readBody } from '@/lib/api/http';
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
export const GET = publicRoute(async ({ search, session }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const reservationId = search.get('reservationId') ?? '';
    const reservation = db.reservations.find((r) => r.id === reservationId);
    if (!reservation) {
      return { quotes: [], detail: 'Choose one of your bookings.' };
    }
    const sample = db.apartments.find((a) => a.id === reservation.apartmentId);
    if (sample && isSampleListing(sample) && reservation.status === 'inquiry') {
      return { quote: null, detail: 'Reception needs to confirm this example listing before payment.' };
    }

    const mine =
      Boolean(session) &&
      (reservation.userId === session?.uid ||
        db.guests.find((g) => g.id === reservation.guestId)?.userId === session?.uid);

    /**
     * A brand-new booking belongs to someone who may not have signed in yet — they
     * booked as a visitor. They still need the payment details and the deposit for the
     * booking they just made, so an anonymous caller holding the booking id gets a
     * deliberately narrow object: the amount owed, the deposit, the channels and where
     * to send money. No guest name, no contact details, no other bookings, and no
     * claim history — the id is a random server-generated value, and everything else
     * on the page was already shown to whoever made the booking.
     */
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
          guestChoosesMethod: true,
          defaultMethod: wanted || quote.defaultMethod,
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
      const sample = db.apartments.find((a) => a.id === reservation?.apartmentId);
      if (reservation?.status === 'inquiry' && sample && isSampleListing(sample)) {
        throw new OperationError('Please wait for reception to confirm this apartment before paying.', 409, 'confirmation_required');
      }
      const claim = submitPaymentClaim(db, {
        reservationId: input.reservationId,
        // A visitor who has not signed in may file one claim against the booking they
        // just made; submitPaymentClaim refuses anything that belongs to an account.
        userId: session?.uid ?? null,
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
        snapshot: session ? buildSnapshot(db, session) : null,
      };
    });
});
