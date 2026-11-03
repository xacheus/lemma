import { apiRoute, readBody } from '@/lib/api/http';
import { reservationCreateSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { paginateRecords } from '@/lib/db/pagination';
import { buildSnapshot } from '@/lib/api/snapshot';
import { createReservation } from '@/lib/domain/operations';
import { checkAvailability } from '@/lib/domain/availability';
import { decorateAll } from '@/lib/domain/selectors';

export const runtime = 'nodejs';

/**
 * Supports BOTH:
 * 1) Pre-flight availability probe when `apartmentId`, `checkIn`, and `checkOut` are provided.
 * 2) Cursor-paginated reservation listing (default 20 items/page) when queried as a collection.
 */
export const GET = apiRoute({
  permission: 'reservations.view',
  handler: async ({ search }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const apartmentId = search.get('apartmentId') ?? '';
    const checkIn = search.get('checkIn') ?? '';
    const checkOut = search.get('checkOut') ?? '';

    if (apartmentId && checkIn && checkOut) {
      const guests = Number(search.get('guests') ?? 1);
      const exclude = search.get('exclude');
      return checkAvailability(db, {
        apartmentId,
        checkIn,
        checkOut,
        guestCount: guests,
        excludeReservationId: exclude,
        today: db.__today,
        allowPast: search.get('allowPast') === 'true',
      });
    }

    const status = search.get('status') ?? 'all';
    const paymentStatus = search.get('paymentStatus') ?? 'all';
    const q = (search.get('q') ?? '').trim().toLowerCase();

    let rows = decorateAll(
      db,
      [...db.reservations].sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1)),
    );
    if (status !== 'all') rows = rows.filter((r) => r.status === status);
    if (paymentStatus !== 'all') rows = rows.filter((r) => r.paymentStatus === paymentStatus);
    if (q) {
      rows = rows.filter(
        (r) =>
          r.reference.toLowerCase().includes(q) ||
          (r.guest?.fullName ?? '').toLowerCase().includes(q) ||
          (r.guest?.phone ?? '').toLowerCase().includes(q) ||
          (r.apartment?.name ?? '').toLowerCase().includes(q),
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
  permission: 'reservations.create',
  handler: async ({ req, session }) => {
    const input = await readBody(req, reservationCreateSchema);
    return runAtomicTransaction((db) => {
      const created = createReservation(db, session.user.id, input);
      return {
        created: created.id,
        reference: created.reference,
        snapshot: buildSnapshot(db, session),
      };
    });
  },
});
