import { apiRoute } from '@/lib/api/http';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { paginateRecords } from '@/lib/db/pagination';

export const runtime = 'nodejs';

export const GET = apiRoute({
  permission: 'payments.view',
  handler: async ({ search }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const q = (search.get('q') ?? '').trim().toLowerCase();
    let rows = [...(db.receipts ?? [])];
    if (q) {
      rows = rows.filter(
        (r) =>
          r.receiptNumber.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.bookingReference.toLowerCase().includes(q),
      );
    }
    return paginateRecords(rows, {
      cursor: search.get('cursor'),
      limit: search.get('limit') ? Number(search.get('limit')) : 20,
      getId: (r) => r.id,
    });
  },
});
