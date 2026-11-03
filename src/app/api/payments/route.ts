import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { paymentCreateSchema, refundSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { paginateRecords } from '@/lib/db/pagination';
import { buildSnapshot } from '@/lib/api/snapshot';
import { issuePaymentRefund, recordPayment } from '@/lib/domain/operations';
import { recomputeReservation } from '@/lib/domain/selectors';

export const runtime = 'nodejs';

export const GET = apiRoute({
  permission: 'payments.view',
  handler: async ({ search }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const status = search.get('status') ?? 'all';
    const method = search.get('method') ?? 'all';
    const q = (search.get('q') ?? '').trim().toLowerCase();

    let rows = [...db.payments].sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
    if (status !== 'all') rows = rows.filter((p) => p.verificationStatus === status);
    if (method !== 'all') rows = rows.filter((p) => p.method === method);
    if (q) {
      rows = rows.filter(
        (p) =>
          p.reference.toLowerCase().includes(q) ||
          (p.receiptNumber && p.receiptNumber.toLowerCase().includes(q)),
      );
    }

    return paginateRecords(rows, {
      cursor: search.get('cursor'),
      limit: search.get('limit') ? Number(search.get('limit')) : 20,
      getId: (p) => p.id,
    });
  },
});

export const POST = apiRoute({
  permission: 'payments.record',
  handler: async ({ req, session }) => {
    const input = await readBody(req, paymentCreateSchema);
    return runAtomicTransaction((db) => {
      const payment = recordPayment(db, session.user.id, input);
      const folio = recomputeReservation(db, input.reservationId);
      return { payment, folio, snapshot: buildSnapshot(db, session) };
    });
  },
});

export const PUT = apiRoute({
  permission: 'payments.refund',
  handler: async ({ req, session }) => {
    const input = await readBody(req, refundSchema);
    if (!input.reservationId) {
      throw new HttpError('reservationId is required to issue a refund.', 422, 'validation');
    }
    const reservationId = input.reservationId;
    return runAtomicTransaction((db) => {
      const refund = issuePaymentRefund(db, session.uid, {
        reservationId,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
        note: input.note,
      });
      return { refund, snapshot: buildSnapshot(db, session) };
    });
  },
});
