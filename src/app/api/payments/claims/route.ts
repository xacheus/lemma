import { apiRoute, readBody } from '@/lib/api/http';
import { guestPaymentClaimSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { paymentQuote, submitPaymentClaim } from '@/lib/domain/operations';
import { buildSnapshot } from '@/lib/api/snapshot';

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
export const GET = apiRoute({
  handler: async ({ search, session }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const reservationId = search.get('reservationId') ?? '';
    const reservation = db.reservations.find((r) => r.id === reservationId);
    if (!reservation) {
      return { quotes: [], detail: 'Choose one of your bookings.' };
    }
    const mine =
      reservation.userId === session.uid ||
      db.guests.find((g) => g.id === reservation.guestId)?.userId === session.uid;
    if (!mine) {
      return { quotes: [], detail: 'That booking does not belong to your account.' };
    }
    return { quote: paymentQuote(db, reservation) };
  },
});

export const POST = apiRoute({
  handler: async ({ req, session }) => {
    const input = await readBody(req, guestPaymentClaimSchema);
    return runAtomicTransaction((db) => {
      const claim = submitPaymentClaim(db, {
        reservationId: input.reservationId,
        userId: session.uid,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
        paidAt: input.paidAt,
        note: input.note,
        proof: input.proof ?? null,
      });
      const reservation = db.reservations.find((r) => r.id === claim.reservationId)!;
      return {
        claim,
        quote: paymentQuote(db, reservation),
        snapshot: buildSnapshot(db, session),
      };
    });
  },
});
