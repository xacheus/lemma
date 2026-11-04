import { apiRoute, HttpError, publicRoute, readBody } from '@/lib/api/http';
import { quotationActionSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import {
  convertQuotationToInvoice,
  convertQuotationToReservation,
  updateQuotationStatus,
} from '@/lib/domain/operations';
import { buildBrandedEmailHtml, sendEmailNotification } from '@/lib/notifications/providers';

export const runtime = 'nodejs';

export const GET = publicRoute(async ({ params, search, session }) => {
  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const quotation = (db.quotations ?? []).find((q) => q.id === params.id);
  if (!quotation) throw new HttpError('Quotation not found.', 404, 'not_found');

  const shareToken = search.get('token');
  const allowedByToken = Boolean(shareToken && quotation.shareToken === shareToken);
  const allowedByStaff = Boolean(session && session.permissions.has('quotations.view'));
  const allowedByOwner = Boolean(
    session &&
      (quotation.userId === session.uid ||
        (db.users?.some((u) => u.uid === session.uid && u.emailVerified) &&
          quotation.customerEmail &&
          quotation.customerEmail.toLowerCase() === session.user.email.toLowerCase())),
  );

  if (!allowedByToken && !allowedByStaff && !allowedByOwner) {
    throw new HttpError('Not authorised to view this quotation.', 403, 'forbidden');
  }
  return { quotation, property: db.settings.property };
});

export const POST = apiRoute({
  permission: 'quotations.manage',
  handler: async ({ req, session, params }) => {
    const body = await readBody(req, quotationActionSchema);

    if (body.action === 'send_email') {
      await ensureCloudFirestoreHydrated();
      const db = getDb();
      const quotation = (db.quotations ?? []).find((q) => q.id === params.id);
      if (!quotation) throw new HttpError('Quotation not found.', 404, 'not_found');
      const targetEmail = (body.emailTo || quotation.customerEmail).trim();
      if (!targetEmail) {
        throw new HttpError('Enter a recipient email address to send the quotation.', 422, 'validation');
      }

      const origin = new URL(req.url).origin;
      const pdfUrl = `${origin}/api/documents/quotation/${quotation.id}/pdf?token=${encodeURIComponent(quotation.shareToken)}`;
      const sendRes = await sendEmailNotification({
        to: targetEmail,
        subject: `Quotation ${quotation.quotationNumber} — ${db.settings.property.name}`,
        textBody: `Dear ${quotation.customerName},\n\nPlease find your quotation ${quotation.quotationNumber} for ${quotation.apartmentName} (${quotation.checkIn} to ${quotation.checkOut}) totalling K${quotation.totalAmount.toLocaleString('en-US')}.\n\nDownload PDF: ${pdfUrl}`,
        htmlBody: buildBrandedEmailHtml({
          propertyName: db.settings.property.name,
          heading: `Quotation ${quotation.quotationNumber}`,
          bodyLines: [
            `Dear ${quotation.customerName},`,
            `Thank you for your enquiry with ${db.settings.property.name}. Your stay quotation for ${quotation.apartmentName} (${quotation.checkIn} to ${quotation.checkOut}) is K${quotation.totalAmount.toLocaleString('en-US')}.`,
            `Download Official PDF Quotation: ${pdfUrl}`,
          ],
        }),
      });

      const snapshot = await runAtomicTransaction((txDb) => {
        const q = (txDb.quotations ?? []).find((x) => x.id === params.id);
        if (q && sendRes.ok) {
          q.emailedAt = new Date().toISOString();
          if (q.status === 'draft') q.status = 'sent';
        }
        return buildSnapshot(txDb, session);
      });

      return {
        sent: sendRes.ok,
        deliveryStatus: sendRes.deliveryStatus,
        detail: sendRes.detail,
        shareUrl: pdfUrl,
        snapshot,
      };
    }

    return runAtomicTransaction((db) => {
      if (body.action === 'set_status') {
        if (!body.status) throw new HttpError('Select a status.', 422, 'validation');
        const quotation = updateQuotationStatus(db, session.uid, params.id, body.status);
        return { quotation, snapshot: buildSnapshot(db, session) };
      }
      if (body.action === 'convert_to_booking') {
        const result = convertQuotationToReservation(db, session.uid, params.id);
        return { ...result, snapshot: buildSnapshot(db, session) };
      }
      if (body.action === 'convert_to_invoice') {
        const invoice = convertQuotationToInvoice(db, session.uid, params.id, body.customerTpin ?? '');
        return { invoice, snapshot: buildSnapshot(db, session) };
      }
      throw new HttpError('Unsupported quotation action.', 400, 'bad_request');
    });
  },
});
