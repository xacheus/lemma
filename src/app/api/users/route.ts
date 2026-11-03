import { apiRoute } from '@/lib/api/http';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { paginateRecords } from '@/lib/db/pagination';
import { stripUser } from '@/lib/api/snapshot';

export const runtime = 'nodejs';

export const GET = apiRoute({
  roles: ['super_admin', 'admin'],
  permission: 'staff.manage',
  handler: async ({ search }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const q = (search.get('q') ?? '').trim().toLowerCase();
    const roleFilter = search.get('role') ?? 'all';
    const statusFilter = search.get('status') ?? 'all';

    let rows = (db.users ?? []).map(stripUser);
    if (roleFilter !== 'all') {
      rows = rows.filter((u) => u.role === roleFilter);
    }
    if (statusFilter !== 'all') {
      rows = rows.filter((u) => u.accountStatus === statusFilter);
    }
    if (q) {
      rows = rows.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.phoneNumber.toLowerCase().includes(q) ||
          (u.username && u.username.toLowerCase().includes(q)),
      );
    }

    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return paginateRecords(rows, {
      cursor: search.get('cursor'),
      limit: search.get('limit') ? Number(search.get('limit')) : 20,
      getId: (u) => u.uid,
    });
  },
});
