import { apiRoute } from '@/lib/api/http';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { paginateRecords } from '@/lib/db/pagination';

export const runtime = 'nodejs';

export const GET = apiRoute({
  roles: ['super_admin', 'admin'],
  permission: 'audit.view',
  handler: async ({ search }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const category = search.get('category') ?? 'all';
    const q = (search.get('q') ?? '').trim().toLowerCase();

    let rows = [...(db.auditLogs ?? [])];
    if (category !== 'all') {
      rows = rows.filter((a) => a.category === category);
    }
    if (q) {
      rows = rows.filter(
        (a) =>
          a.summary.toLowerCase().includes(q) ||
          a.actorName.toLowerCase().includes(q) ||
          a.action.toLowerCase().includes(q),
      );
    }

    return paginateRecords(rows, {
      cursor: search.get('cursor'),
      limit: search.get('limit') ? Number(search.get('limit')) : 20,
      getId: (a) => a.id,
    });
  },
});
