import { apiRoute, publicRoute, readBody } from '@/lib/api/http';
import { apartmentSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { paginateRecords } from '@/lib/db/pagination';
import { buildSnapshot } from '@/lib/api/snapshot';
import { upsertApartment } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const GET = publicRoute(async ({ search, session }) => {
  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const isStaff = Boolean(
    session && ['super_admin', 'admin', 'receptionist'].includes(session.user.role),
  );
  let rows = [...db.apartments].sort((a, b) => a.number - b.number);
  if (!isStaff) {
    rows = rows.filter((a) => a.active && a.publicationStatus !== 'draft');
  }
  const tier = search.get('tier') ?? 'all';
  if (tier !== 'all') rows = rows.filter((a) => a.tier === tier);

  return paginateRecords(rows, {
    cursor: search.get('cursor'),
    limit: search.get('limit') ? Number(search.get('limit')) : 20,
    getId: (a) => a.id,
  });
});

export const POST = apiRoute({
  permission: 'apartments.manage',
  handler: async ({ req, session }) => {
    const input = await readBody(req, apartmentSchema);
    return runAtomicTransaction((db) => ({
      apartment: upsertApartment(db, session.user.id, input),
      snapshot: buildSnapshot(db, session),
    }));
  },
});
