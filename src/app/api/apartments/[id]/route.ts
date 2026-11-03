import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { apartmentSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { deleteApartmentFromInventory, upsertApartment } from '@/lib/domain/operations';
import { isConfirmed } from '@/lib/domain/availability';

export const runtime = 'nodejs';

export const PATCH = apiRoute({
  permission: 'apartments.manage',
  handler: async ({ req, session, params }) => {
    const patch = await readBody(req, apartmentSchema.partial());
    return runAtomicTransaction((db) => {
      const hasFutureBookings = db.reservations.some(
        (r) => r.apartmentId === params.id && isConfirmed(r.status) && r.checkOut > db.__today,
      );
      if ((patch.active === false || patch.outOfService === true) && hasFutureBookings) {
        throw new HttpError(
          'Apartments with future bookings cannot be deactivated or taken out of service. Cancel or move those reservations first.',
          409,
          'has_future_bookings',
        );
      }
      return {
        apartment: upsertApartment(db, session.user.id, { ...patch, id: params.id }),
        snapshot: buildSnapshot(db, session),
      };
    });
  },
});

export const DELETE = apiRoute({
  permission: 'apartments.manage',
  handler: async ({ session, params }) =>
    runAtomicTransaction((db) => {
      const deleted = deleteApartmentFromInventory(db, session.uid, params.id);
      return {
        deletedId: deleted.id,
        snapshot: buildSnapshot(db, session),
      };
    }),
});
