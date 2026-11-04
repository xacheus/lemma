import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { guestPaymentClaimReviewSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { rejectPaymentClaim } from '@/lib/domain/operations';
import { buildSnapshot } from '@/lib/api/snapshot';

export const runtime = 'nodejs';

/**
 * Reject a guest's payment claim.
 *
 * Only rejection lives here — banking a claim goes through POST /api/payments with
 * a `claimId`, so it lands in the ordinary receipt rules (and the ordinary
 * verification queue when a second signature is required).
 */
/**
 * Reading one claim is a review action: it stamps `reviewedAt` the first time a
 * member of staff opens it. That timestamp is the only difference between the
 * guest's "Proof submitted" and "Under verification" labels — it is a real record of
 * somebody having looked, not a guessed delay.
 */
export const GET = apiRoute({
  permission: 'payments.view',
  handler: async ({ params, session }) => {
    return runAtomicTransaction((db) => {
      const claim = (db.paymentClaims ?? []).find((c) => c.id === params.id);
      if (!claim) throw new HttpError('Payment claim not found.', 404, 'not_found');
      if (claim.status === 'awaiting_verification' && !claim.reviewedAt) {
        claim.reviewedAt = new Date().toISOString();
        claim.reviewedBy = session.user.name;
      }
      return { claim, snapshot: buildSnapshot(db, session) };
    });
  },
});

export const PATCH = apiRoute({
  permission: 'payments.verify',
  handler: async ({ req, session, params }) => {
    const body = await readBody(req, guestPaymentClaimReviewSchema);
    if (body.status !== 'rejected') {
      throw new HttpError(
        'Use POST /api/payments with the claimId to bank a claim. This endpoint only rejects.',
        422,
        'validation',
      );
    }
    return runAtomicTransaction((db) => ({
      claim: rejectPaymentClaim(db, session.user.id, params.id, body.note ?? ''),
      snapshot: buildSnapshot(db, session),
    }));
  },
});
