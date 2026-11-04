import { apiRoute, readBody } from '@/lib/api/http';
import { paymentVerifySchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { setPaymentVerification } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const PATCH = apiRoute({
  permission: 'payments.verify',
  roles: ['admin', 'super_admin'],
  handler: async ({ req, session, params }) => {
    const patch = await readBody(req, paymentVerifySchema);
    return runAtomicTransaction((db) => ({
      payment: setPaymentVerification(db, session.user.id, params.id, patch.status, patch.note ?? ''),
      snapshot: buildSnapshot(db, session),
    }));
  },
});
