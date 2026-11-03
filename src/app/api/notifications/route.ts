import { apiRoute, readBody } from '@/lib/api/http';
import { notificationSendSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { draftNotification, runReminderSweep } from '@/lib/domain/operations';
import { dispatchExternalNotification } from '@/lib/notifications/providers';

export const runtime = 'nodejs';

/**
 * Composes and dispatches a notification. Only marks `sent` when a real external
 * provider (WhatsApp Cloud API, SMS Webhook, or Resend) returns HTTP 2xx with a
 * provider message ID; otherwise records `not_connected`, `in_app_only`, or
 * `delivered_manually` honestly.
 */
export const POST = apiRoute({
  permission: 'notifications.send',
  handler: async ({ req, session }) => {
    const input = await readBody(req, notificationSendSchema);
    const providerAttempt = await dispatchExternalNotification({
      channel: input.channel,
      recipientContact: input.recipientContact,
      title: input.title,
      body: input.body,
    });

    return runAtomicTransaction((db) => {
      const record = draftNotification(db, {
        event: 'booking_confirmation',
        channel: input.channel,
        title: input.title,
        body: input.body,
        recipientName: input.recipientName,
        recipientContact: input.recipientContact,
        guestId:
          input.guestId ??
          db.reservations.find((r) => r.id === input.reservationId)?.guestId ??
          null,
        reservationId: input.reservationId ?? null,
        apartmentId:
          db.reservations.find((r) => r.id === input.reservationId)?.apartmentId ?? null,
        actor: session.user.name,
      });

      if (providerAttempt.status === 'sent') {
        record.deliveryStatus = 'sent';
        record.providerMessageId = providerAttempt.providerMessageId;
        record.sentAt = new Date().toISOString();
        record.deliveryDetail = providerAttempt.detail;
      } else if (input.markSent) {
        record.deliveryStatus = 'delivered_manually';
        record.markedDeliveredAt = new Date().toISOString();
        record.markedDeliveredBy = session.user.name;
        record.deliveryDetail = `Dispatched manually by ${session.user.name} from handset.`;
      } else {
        record.deliveryStatus = providerAttempt.status;
        record.deliveryDetail = providerAttempt.detail;
      }

      return { notification: record, snapshot: buildSnapshot(db, session) };
    });
  },
});

export const PUT = apiRoute({
  permission: 'notifications.manage',
  handler: ({ session }) =>
    runAtomicTransaction((db) => ({
      sweep: runReminderSweep(db),
      snapshot: buildSnapshot(db, session),
    })),
});
