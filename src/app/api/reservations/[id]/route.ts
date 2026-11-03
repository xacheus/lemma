import { apiRoute, readBody } from '@/lib/api/http';
import { reservationPatchSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { updateReservation } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const PATCH = apiRoute({
  permission: 'reservations.edit',
  handler: async ({ req, session, params }) => {
    const patch = await readBody(req, reservationPatchSchema);
    return runAtomicTransaction((db) => ({
      updated: updateReservation(db, session.user.id, params.id, patch),
      snapshot: buildSnapshot(db, session),
    }));
  },
});
