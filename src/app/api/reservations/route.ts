import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { reservationCreateSchema } from '@/lib/api/schemas';
import { getDb, mutate } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { createReservation } from '@/lib/domain/operations';
import { checkAvailability } from '@/lib/domain/availability';

export const runtime = 'nodejs';

/** Pre-flight availability probe used by the booking form as dates are typed. */
export const GET = apiRoute({
  permission: 'reservations.view',
  handler: ({ search }) => {
    const db = getDb();
    const apartmentId = search.get('apartmentId') ?? '';
    const checkIn = search.get('checkIn') ?? '';
    const checkOut = search.get('checkOut') ?? '';
    const guests = Number(search.get('guests') ?? 1);
    const exclude = search.get('exclude');
    if (!apartmentId || !checkIn || !checkOut) {
      throw new HttpError('apartmentId, checkIn and checkOut are required.', 422, 'validation');
    }
    return checkAvailability(db, {
      apartmentId,
      checkIn,
      checkOut,
      guestCount: guests,
      excludeReservationId: exclude,
      today: db.__today,
      allowPast: search.get('allowPast') === 'true',
    });
  },
});

export const POST = apiRoute({
  permission: 'reservations.create',
  handler: async ({ req, session }) => {
    const input = await readBody(req, reservationCreateSchema);
    return mutate((db) => {
      const created = createReservation(db, session.user.id, input);
      return { created: created.id, reference: created.reference, snapshot: buildSnapshot(db, session) };
    });
  },
});
