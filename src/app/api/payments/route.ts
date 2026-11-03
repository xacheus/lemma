import { apiRoute, readBody } from '@/lib/api/http';
import { paymentCreateSchema } from '@/lib/api/schemas';
import { mutate } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { recordPayment } from '@/lib/domain/operations';
import { recomputeReservation } from '@/lib/domain/selectors';

export const runtime = 'nodejs';

/**
 * Recording money is separate from confirming it: unless the person entering the
 * receipt can also verify payments, the row lands as `pending` and the guest's
 * balance does not move. See docs/DEMO-LIMITATIONS.md.
 */
export const POST = apiRoute({
  permission: 'payments.record',
  handler: async ({ req, session }) => {
    const input = await readBody(req, paymentCreateSchema);
    return mutate((db) => {
      const payment = recordPayment(db, session.user.id, input);
      const folio = recomputeReservation(db, input.reservationId);
      return { payment, folio, snapshot: buildSnapshot(db, session) };
    });
  },
});
