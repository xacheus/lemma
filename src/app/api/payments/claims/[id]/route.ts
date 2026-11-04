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
