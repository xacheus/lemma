import { apiRoute, readBody } from '@/lib/api/http';
import { cancellationRequestSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { requestBookingCancellation } from '@/lib/domain/operations';
import { buildSnapshot } from '@/lib/api/snapshot';

export const runtime = 'nodejs';

export const POST = apiRoute({
  handler: async ({ req, session, params }) => {
    const input = await readBody(req, cancellationRequestSchema);
    return runAtomicTransaction((db) => {
      const reservation = requestBookingCancellation(db, session.uid, params.id, input.reason);
      return {
        reservation,
        snapshot: buildSnapshot(db, session),
      };
    });
  },
});
