import { isBrevoEmailConfigured } from '@/lib/notifications/email-config';
import { buildBrandedEmailHtml, sendEmailNotification } from '@/lib/notifications/providers';
import { NextResponse } from 'next/server';
import {
  addBookingAccess,
  bookingAccessLink,
  bookingCookie,
  createBookingAccessToken,
} from '@/lib/booking/access';
import { HttpError, readBody } from '@/lib/api/http';
import { publicBookingSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { createReservation, paymentQuote } from '@/lib/domain/operations';
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
    const guestToken = createBookingAccessToken();
    const emailToken = createBookingAccessToken();
    const emailLink = bookingAccessLink(emailToken);

    const created = await runAtomicTransaction((db) => {
      if (!db.settings.property.name) {
        throw new HttpError('The property is not configured.', 500, 'config');
      }

      const customerUid = session?.user.role === 'guest' ? session.uid : null;
      const reservation = createReservation(db, customerUid ?? 'public', {
        userId: customerUid,
        publicSubmission: true,
        apartmentId: input.apartmentId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guestCount: input.guestCount,
        selectedServiceIds: input.selectedServiceIds,
        source: 'website',
        notes: input.notes ?? '',
        arrivalTime: input.arrivalTime,
        purposeOfVisit: input.purposeOfVisit,
        asInquiry: true,
        guest: {
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          nationalId: input.nationalId,
          idType: input.idType,
          nationality: input.nationality,
          countryOfResidence: input.countryOfResidence,
          residentialAddress: input.residentialAddress,
          city: input.city,
          countryOfOrigin: input.countryOfOrigin,
          specialRequests: input.notes,
        },
      });

      if (!customerUid) {
        addBookingAccess(db, reservation.id, guestToken);
        if (emailLink && isBrevoEmailConfigured()) {
          addBookingAccess(db, reservation.id, emailToken, 30 * 60);
        }
      }

      const quote = paymentQuote(db, reservation);
      const chosen =
        quote.methods.find((m) => m.id === input.paymentMethod) ?? quote.methods[0] ?? null;
      const apt = db.apartments.find((a) => a.id === reservation.apartmentId);

      return {
        id: reservation.id,
        reference: reservation.reference,
        status: reservation.status,
        checkIn: reservation.checkIn,
        checkOut: reservation.checkOut,
        nights: reservation.nights,
        totalAmount: reservation.totalAmount,
        depositDue: Math.round((reservation.totalAmount * db.settings.booking.depositPercent) / 100),
        apartmentName: apt?.name ?? '',
        apartmentNumber: apt?.number ?? 0,
        depositPercent: db.settings.booking.depositPercent,
        checkInTime: db.settings.booking.checkInTime,
        checkOutTime: db.settings.booking.checkOutTime,
        contactPhone: db.settings.property.phone,
        contactWhatsapp: db.settings.property.whatsapp,
        payment: chosen
          ? {
              ...chosen,
              method: chosen.id,
              totalAmount: quote.totalAmount,
              depositPercent: quote.depositPercent,
              suggestedAmount: quote.suggestedAmount,
              reference: quote.reference,
              proofUploadEnabled: quote.proofUploadEnabled,
            }
          : null,
        methods: quote.methods.map((m) => ({ id: m.id, label: m.label })),
      };
    });

    if (isBrevoEmailConfigured()) {
      const access =
        session?.user.role !== 'guest' && emailLink
          ? `\n\nOpen your booking online (link valid for 30 minutes): ${emailLink}`
          : '';
      const textBody = `We received your booking request ${created.reference}. Your request is ${created.status === 'inquiry' ? 'awaiting confirmation' : 'recorded'}.${access}`;
      await sendEmailNotification({
        to: input.email,
        subject: 'Your Lemma Heights Apartments booking request',
        textBody,
        htmlBody: buildBrandedEmailHtml({
          subject: 'Your Lemma Heights Apartments booking request',
          body: textBody,
          ctaLabel: emailLink && session?.user.role !== 'guest' ? 'Open booking' : undefined,
          ctaUrl: emailLink && session?.user.role !== 'guest' ? emailLink : undefined,
        }),
      }).catch(() => undefined);
    }
    const response = NextResponse.json({ ok: true, data: created }, { status: 201 });
    if (session?.user.role !== 'guest') {
      response.cookies.set(bookingCookie(created.id, guestToken));
    }
    return response;
  } catch (error) {
    const err = error as { status?: number; code?: string; message?: string; details?: unknown };
    const status = err.status ?? 500;
    if (status >= 500) console.error('[public-booking]', error);
    return Response.json(
      {
        ok: false,
        error:
          err.code === 'date_conflict'
            ? 'This apartment is not available for those dates. Please choose different dates.'
            : status >= 500
              ? 'We could not accept that request right now. Please contact reception before trying again.'
              : (err.message ?? 'We could not accept that request. Please contact reception.'),
        code: err.code ?? 'server_error',
      },
      { status: status >= 400 && status <= 503 ? status : 500 },
    );
  }
}
