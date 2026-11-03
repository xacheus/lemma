import { apiRoute, readBody } from '@/lib/api/http';
import { apartmentSchema } from '@/lib/api/schemas';
import { mutate } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { upsertApartment } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const POST = apiRoute({
  permission: 'apartments.manage',
  handler: async ({ req, session }) => {
    const input = await readBody(req, apartmentSchema);
    return mutate((db) => ({ apartment: upsertApartment(db, session.user.id, input), snapshot: buildSnapshot(db, session) }));
  },
});
