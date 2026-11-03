import { apiRoute, readBody } from '@/lib/api/http';
import { paymentVerifySchema } from '@/lib/api/schemas';
import { mutate } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { setPaymentVerification } from '@/lib/domain/operations';

export const runtime = 'nodejs';

/** Authorised sign-off on a receipt: verified or rejected, with a note. */
export const PATCH = apiRoute({
  permission: 'payments.verify',
  handler: async ({ req, session, params }) => {
    const patch = await readBody(req, paymentVerifySchema);
    return mutate((db) => ({
      payment: setPaymentVerification(db, session.user.id, params.id, patch.status, patch.note ?? ''),
      snapshot: buildSnapshot(db, session),
    }));
  },
});
