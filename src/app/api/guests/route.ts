import { apiRoute, readBody } from '@/lib/api/http';
import { guestSchema } from '@/lib/api/schemas';
import { mutate } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { findOrCreateGuest } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const POST = apiRoute({
  permission: 'guests.manage',
  handler: async ({ req, session }) => {
    const input = await readBody(req, guestSchema);
    return mutate((db) => {
      const created = findOrCreateGuest(db, { ...input, source: input.source ?? 'phone' });
      return { guest: created, snapshot: buildSnapshot(db, session) };
    });
  },
});
