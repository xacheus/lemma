import { apiRoute, readBody } from '@/lib/api/http';
import { invoiceCreateSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { paginateRecords } from '@/lib/db/pagination';
import { buildSnapshot } from '@/lib/api/snapshot';
import { createInvoiceFromReservation } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const GET = apiRoute({
  permission: 'invoices.view',
  handler: async ({ search }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const q = (search.get('q') ?? '').trim().toLowerCase();
    const status = search.get('status') ?? 'all';

    let rows = [...(db.invoices ?? [])];
    if (status !== 'all') rows = rows.filter((i) => i.status === status);
    if (q) {
      rows = rows.filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(q) ||
          i.customerName.toLowerCase().includes(q) ||
          i.customerCompany.toLowerCase().includes(q),
      );
    }

    return paginateRecords(rows, {
      cursor: search.get('cursor'),
      limit: search.get('limit') ? Number(search.get('limit')) : 20,
      getId: (i) => i.id,
    });
  },
});

export const POST = apiRoute({
  permission: 'invoices.manage',
  handler: async ({ req, session }) => {
    const input = await readBody(req, invoiceCreateSchema);
    return runAtomicTransaction((db) => {
      const invoice = createInvoiceFromReservation(db, session.uid, input.reservationId, {
        customerCompany: input.customerCompany,
        customerTpin: input.customerTpin,
        notes: input.notes,
      });
      return {
        invoice,
        snapshot: buildSnapshot(db, session),
      };
    });
  },
});
