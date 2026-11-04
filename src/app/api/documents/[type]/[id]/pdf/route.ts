import { NextResponse } from 'next/server';
import { HttpError, publicRoute } from '@/lib/api/http';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { decorate } from '@/lib/domain/selectors';
import {
  generateBookingConfirmationPdf,
  generateInvoicePdf,
  generateQuotationPdf,
  generateReceiptPdf,
} from '@/lib/pdf/documents';

export const runtime = 'nodejs';

function ownsGuestOrReservation(
  db: ReturnType<typeof getDb>,
  uid: string,
  email: string,
  opts: { userId?: string | null; guestId?: string | null; reservationId?: string | null; docEmail?: string | null },
): boolean {
  if (opts.userId && opts.userId === uid) return true;
  if (opts.docEmail && email && opts.docEmail.toLowerCase() === email.toLowerCase()) return true;
  if (opts.guestId) {
    const g = db.guests.find((x) => x.id === opts.guestId);
    if (g && (g.userId === uid || (g.email && g.email.toLowerCase() === email.toLowerCase()))) {
      return true;
    }
  }
  if (opts.reservationId) {
    const r = db.reservations.find((x) => x.id === opts.reservationId);
    if (r) {
      if (r.userId === uid) return true;
      const g = db.guests.find((x) => x.id === r.guestId);
      if (g && (g.userId === uid || (g.email && g.email.toLowerCase() === email.toLowerCase()))) {
        return true;
      }
    }
  }
  return false;
}

export const GET = publicRoute(async ({ params, search, session }) => {
  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const verifiedEmail = session && db.users?.some((u) => u.uid === session.uid && u.emailVerified)
    ? session.user.email
    : '';
  const docType = params.type;
  const id = params.id;
  const download = search.get('download') === '1';
  const shareToken = search.get('token');

  const isStaff = Boolean(
    session && ['super_admin', 'admin', 'receptionist'].includes(session.user.role),
  );

  let pdfBytes: Uint8Array;
  let filename: string;

  if (docType === 'quotation') {
    const q = (db.quotations ?? []).find((x) => x.id === id || x.quotationNumber === id);
    if (!q) throw new HttpError('Quotation not found.', 404, 'not_found');

    const allowed =
      isStaff ||
      Boolean(shareToken && q.shareToken === shareToken) ||
      Boolean(
        session &&
          ownsGuestOrReservation(db, session.uid, verifiedEmail, {
            userId: q.userId,
            guestId: q.guestId,
            reservationId: q.reservationId,
            docEmail: q.customerEmail,
          }),
      );
    if (!allowed) throw new HttpError('Not authorised to access this quotation PDF.', 403, 'forbidden');

    pdfBytes = await generateQuotationPdf(q, db.settings);
    filename = `${q.quotationNumber}.pdf`;
  } else if (docType === 'invoice') {
    const inv = (db.invoices ?? []).find((x) => x.id === id || x.invoiceNumber === id);
    if (!inv) throw new HttpError('Invoice not found.', 404, 'not_found');

    const allowed =
      isStaff ||
      Boolean(
        session &&
          ownsGuestOrReservation(db, session.uid, verifiedEmail, {
            userId: inv.userId,
            guestId: inv.guestId,
            reservationId: inv.reservationId,
            docEmail: inv.customerEmail,
          }),
      );
    if (!allowed) throw new HttpError('Not authorised to access this invoice PDF.', 403, 'forbidden');

    pdfBytes = await generateInvoicePdf(inv, db.settings);
    filename = `${inv.invoiceNumber}.pdf`;
  } else if (docType === 'receipt') {
    // Allow lookup by receipt ID, receiptNumber, or verified paymentId
    let rc = (db.receipts ?? []).find(
      (x) => x.id === id || x.receiptNumber === id || x.paymentId === id,
    );
    if (!rc) {
      const payment = db.payments.find((p) => p.id === id && p.verificationStatus === 'verified');
      if (payment) {
        const r = db.reservations.find((x) => x.id === payment.reservationId);
        const guest = r ? db.guests.find((g) => g.id === r.guestId) : null;
        const apt = r ? db.apartments.find((a) => a.id === r.apartmentId) : null;
        if (r) {
          const decorated = decorate(db, r);
          rc = {
            id: `rcp-${payment.id}`,
            receiptNumber: payment.receiptNumber || payment.reference,
            paymentId: payment.id,
            reservationId: r.id,
            invoiceId: r.invoiceId ?? null,
            userId: r.userId ?? guest?.userId ?? null,
            guestId: r.guestId,
            customerName: guest?.fullName ?? 'Guest',
            customerEmail: guest?.email ?? '',
            customerPhone: guest?.phone ?? '',
            apartmentName: apt?.name ?? 'Apartment',
            apartmentNumber: apt?.number ?? 0,
            bookingReference: r.reference,
            amount: payment.amount,
            method: payment.method,
            transactionReference: payment.reference,
            paidAt: payment.paidAt,
            verifiedBy: payment.verifiedBy || 'Management',
            verifiedAt: payment.verifiedAt || payment.createdAt,
            totalBookingAmount: decorated.totalAmount,
            totalVerifiedPaid: decorated.verifiedPaid,
            remainingBalance: decorated.balanceDue,
            createdAt: payment.createdAt,
          };
        }
      }
    }
    if (!rc) {
      throw new HttpError(
        'Verified payment receipt not found. Unverified payments cannot issue an official receipt.',
        404,
        'not_found',
      );
    }

    const allowed =
      isStaff ||
      Boolean(
        session &&
          ownsGuestOrReservation(db, session.uid, verifiedEmail, {
            userId: rc.userId,
            guestId: rc.guestId,
            reservationId: rc.reservationId,
            docEmail: rc.customerEmail,
          }),
      );
    if (!allowed) throw new HttpError('Not authorised to access this receipt PDF.', 403, 'forbidden');

    pdfBytes = await generateReceiptPdf(rc, db.settings);
    filename = `${rc.receiptNumber}.pdf`;
  } else if (docType === 'confirmation') {
    const r = db.reservations.find((x) => x.id === id || x.reference === id);
    if (!r) throw new HttpError('Booking not found.', 404, 'not_found');

    const allowed =
      isStaff ||
      Boolean(
        session &&
          ownsGuestOrReservation(db, session.uid, verifiedEmail, {
            userId: r.userId,
            guestId: r.guestId,
            reservationId: r.id,
          }),
      );
    if (!allowed) throw new HttpError('Not authorised to access this booking confirmation.', 403, 'forbidden');

    const view = decorate(db, r);
    const apt = db.apartments.find((a) => a.id === r.apartmentId) ?? null;
    const guest = db.guests.find((g) => g.id === r.guestId) ?? null;
    pdfBytes = await generateBookingConfirmationPdf(view, apt, guest, db.settings);
    filename = `${r.reference}-Confirmation.pdf`;
  } else {
    throw new HttpError(`Unsupported document type "${docType}".`, 400, 'bad_request');
  }

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
