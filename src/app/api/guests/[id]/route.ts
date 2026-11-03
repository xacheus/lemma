import { apiRoute, readBody } from '@/lib/api/http';
import { guestSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { updateGuest } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const PATCH = apiRoute({
  permission: 'guests.manage',
  handler: async ({ req, session, params }) => {
    const patch = await readBody(req, guestSchema.partial());
    return runAtomicTransaction((db) => ({
      guest: updateGuest(db, params.id, patch, session.user.id),
      snapshot: buildSnapshot(db, session),
    }));
  },
});
