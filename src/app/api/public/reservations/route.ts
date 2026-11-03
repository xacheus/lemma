import { HttpError, readBody } from '@/lib/api/http';
import { publicBookingSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { createReservation } from '@/lib/domain/operations';
import { take } from '@/lib/api/rate-limit';
import { getSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local';
  const limit = take(`booking:${ip}`);
  if (!limit.allowed) {
    return Response.json(
      {
        ok: false,
        error: `Too many booking attempts. Please wait ${limit.retryAfterSeconds} seconds or telephone reception.`,
        code: 'rate_limited',
      },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const input = await readBody(req, publicBookingSchema);
    if (input.company_url) {
      return Response.json({ ok: false, error: 'Submission rejected.', code: 'spam' }, { status: 400 });
    }

    const session = await getSession();

    const created = await runAtomicTransaction((db) => {
      if (!db.settings.property.name) {
        throw new HttpError('The property is not configured.', 500, 'config');
      }

      const reservation = createReservation(db, session?.uid ?? 'public', {
        userId: session?.uid ?? null,
        apartmentId: input.apartmentId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guestCount: input.guestCount,
        selectedServiceIds: input.selectedServiceIds,
        source: 'website',
        notes: input.notes ?? '',
        asInquiry: true,
        guest: {
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          nationalId: input.nationalId,
          idType: input.idType,
        },
      });

      return {
        id: reservation.id,
        reference: reservation.reference,
        status: reservation.status,
        checkIn: reservation.checkIn,
        checkOut: reservation.checkOut,
        nights: reservation.nights,
        totalAmount: reservation.totalAmount,
        depositDue: Math.round((reservation.totalAmount * db.settings.booking.depositPercent) / 100),
        apartmentName: db.apartments.find((a) => a.id === reservation.apartmentId)?.name ?? '',
        apartmentNumber: db.apartments.find((a) => a.id === reservation.apartmentId)?.number ?? 0,
        depositPercent: db.settings.booking.depositPercent,
        checkInTime: db.settings.booking.checkInTime,
        checkOutTime: db.settings.booking.checkOutTime,
        contactPhone: db.settings.property.phone,
        contactWhatsapp: db.settings.property.whatsapp,
      };
    });

    return Response.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    const err = error as { status?: number; code?: string; message?: string; details?: unknown };
    const status = err.status ?? 500;
    if (status >= 500) console.error('[public-booking]', error);
    return Response.json(
      {
        ok: false,
        error: err.message ?? 'We could not accept that request. Please try again or call reception.',
        code: err.code ?? 'server_error',
        ...(err.details ? { details: err.details } : {}),
      },
      { status: status >= 400 && status < 500 ? status : 500 },
    );
  }
}
