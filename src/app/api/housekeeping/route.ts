import { apiRoute, readBody } from '@/lib/api/http';
import { housekeepingCreateSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { paginateRecords } from '@/lib/db/pagination';
import { buildSnapshot } from '@/lib/api/snapshot';
import { createHousekeepingTask } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const GET = apiRoute({
  permission: 'housekeeping.view',
  handler: async ({ search, session }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    let rows = [...db.housekeeping];
    if (session.user.role === 'cleaner') {
      rows = rows.filter((t) => t.assignedTo === session.uid);
    }
    const status = search.get('status') ?? 'all';
    if (status !== 'all') rows = rows.filter((t) => t.status === status);

    return paginateRecords(rows, {
      cursor: search.get('cursor'),
      limit: search.get('limit') ? Number(search.get('limit')) : 20,
      getId: (t) => t.id,
    });
  },
});

export const POST = apiRoute({
  permission: 'housekeeping.assign',
  handler: async ({ req, session }) => {
    const input = await readBody(req, housekeepingCreateSchema);
    return runAtomicTransaction((db) => ({
      task: createHousekeepingTask(db, session.user.id, input),
      snapshot: buildSnapshot(db, session),
    }));
  },
});
