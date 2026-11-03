import { apiRoute, readBody } from '@/lib/api/http';
import { maintenanceCreateSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { paginateRecords } from '@/lib/db/pagination';
import { createMaintenanceTicket } from '@/lib/domain/operations';
import { buildSnapshot } from '@/lib/api/snapshot';

export const runtime = 'nodejs';

export const GET = apiRoute({
  permission: 'housekeeping.view',
  handler: async ({ search, session }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const status = search.get('status') ?? 'all';
    const priority = search.get('priority') ?? 'all';
    let rows = [...(db.maintenance ?? [])];

    if (session.user.role === 'cleaner') {
      rows = rows.filter((m) => m.assignedTo === session.uid || m.reportedBy === session.uid);
    }
    if (status !== 'all') rows = rows.filter((m) => m.status === status);
    if (priority !== 'all') rows = rows.filter((m) => m.priority === priority);

    return paginateRecords(rows, {
      cursor: search.get('cursor'),
      limit: search.get('limit') ? Number(search.get('limit')) : 20,
      getId: (m) => m.id,
    });
  },
});

export const POST = apiRoute({
  permission: 'housekeeping.maintenance',
  handler: async ({ req, session }) => {
    const input = await readBody(req, maintenanceCreateSchema);
    return runAtomicTransaction((db) => {
      const ticket = createMaintenanceTicket(db, session.uid, input);
      return { ticket, snapshot: buildSnapshot(db, session) };
    });
  },
});
