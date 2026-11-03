import { apiRoute, readBody } from '@/lib/api/http';
import { quotationCreateSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { paginateRecords } from '@/lib/db/pagination';
import { buildSnapshot } from '@/lib/api/snapshot';
import { createQuotation } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const GET = apiRoute({
  permission: 'quotations.view',
  handler: async ({ search }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const q = (search.get('q') ?? '').trim().toLowerCase();
    const status = search.get('status') ?? 'all';

    let rows = [...(db.quotations ?? [])];
    if (status !== 'all') rows = rows.filter((r) => r.status === status);
    if (q) {
      rows = rows.filter(
        (r) =>
          r.quotationNumber.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.customerPhone.toLowerCase().includes(q) ||
          r.apartmentName.toLowerCase().includes(q),
      );
    }
    return paginateRecords(rows, {
      cursor: search.get('cursor'),
      limit: search.get('limit') ? Number(search.get('limit')) : 20,
      getId: (r) => r.id,
    });
  },
});

export const POST = apiRoute({
  permission: 'quotations.manage',
  handler: async ({ req, session }) => {
    const input = await readBody(req, quotationCreateSchema);
    return runAtomicTransaction((db) => {
      const quotation = createQuotation(db, session.uid, input);
      return {
        quotation,
        snapshot: buildSnapshot(db, session),
      };
    });
  },
});
