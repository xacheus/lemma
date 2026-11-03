import { apiRoute, readBody } from '@/lib/api/http';
import { guestSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { paginateRecords } from '@/lib/db/pagination';
import { buildSnapshot } from '@/lib/api/snapshot';
import { findOrCreateGuest } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const GET = apiRoute({
  permission: 'guests.view',
  handler: async ({ search, session }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const seePii = session.permissions.has('guests.viewPii');
    const q = (search.get('q') ?? '').trim().toLowerCase();

    let rows = db.guests.map((g) => (seePii ? g : { ...g, nationalId: '' }));
    if (q) {
      rows = rows.filter(
        (g) =>
          g.fullName.toLowerCase().includes(q) ||
          g.phone.toLowerCase().includes(q) ||
          g.email.toLowerCase().includes(q),
      );
    }

    return paginateRecords(rows, {
      cursor: search.get('cursor'),
      limit: search.get('limit') ? Number(search.get('limit')) : 20,
      getId: (g) => g.id,
    });
  },
});

export const POST = apiRoute({
  permission: 'guests.manage',
  handler: async ({ req, session }) => {
    const input = await readBody(req, guestSchema);
    return runAtomicTransaction((db) => {
      const created = findOrCreateGuest(db, { ...input, source: input.source ?? 'phone' });
      return { guest: created, snapshot: buildSnapshot(db, session) };
    });
  },
});
