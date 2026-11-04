import { publicRoute, HttpError } from '@/lib/api/http';
import { take } from '@/lib/api/rate-limit';
import { getDb } from '@/lib/db/store';
import { searchAvailability } from '@/lib/domain/availability';
import { businessToday } from '@/lib/domain/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unauthenticated availability search for the public site. It returns apartments
 * and prices only — never guest names, never the ledger.
 */
export const GET = publicRoute(({ search, req }) => {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
  const limit = take(`availability:${ip}`);
  if (!limit.allowed) {
    throw new HttpError('Too many availability checks — please wait a moment.', 429, 'rate_limited');
  }
  const db = getDb();
  const checkIn = search.get('checkIn') ?? businessToday();
  const checkOut = search.get('checkOut') ?? '';
  const guests = Math.max(1, Math.min(12, Number(search.get('guests') ?? 2)));
  const apartmentId = search.get('apartmentId');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    throw new HttpError('Arrival and departure dates are required.', 422, 'validation');
  }
  const result = searchAvailability(db, { checkIn, checkOut, guests, apartmentId, today: db.__today });
  return {
    ...result,
    nights: result.nights,
    currency: 'ZMW',
    policy: {
      checkInTime: db.settings.booking.checkInTime,
      checkOutTime: db.settings.booking.checkOutTime,
      depositPercent: db.settings.booking.depositPercent,
      cancellationText: db.settings.booking.cancellationText,
      taxesIncluded: db.settings.booking.taxesIncluded,
    },
  };
});
