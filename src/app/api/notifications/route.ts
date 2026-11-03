import { apiRoute, readBody } from '@/lib/api/http';
import { notificationSendSchema } from '@/lib/api/schemas';
import { mutate } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { draftNotification, runReminderSweep } from '@/lib/domain/operations';

export const runtime = 'nodejs';

/** Compose a message to a guest. Nothing leaves the building: see the delivery column. */
export const POST = apiRoute({
  permission: 'notifications.send',
  handler: async ({ req, session }) => {
    const input = await readBody(req, notificationSendSchema);
    return mutate((db) => {
      const record = draftNotification(db, {
        event: 'booking_confirmation',
        channel: input.channel,
        title: input.title,
        body: input.body,
        recipientName: input.recipientName,
        recipientContact: input.recipientContact,
        guestId: input.guestId ?? db.reservations.find((r) => r.id === input.reservationId)?.guestId ?? null,
        reservationId: input.reservationId ?? null,
        apartmentId:
          db.reservations.find((r) => r.id === input.reservationId)?.apartmentId ?? null,
        actor: session.user.name,
      });
      if (input.markSent) {
        record.deliveryStatus = 'delivered_manually';
        record.markedDeliveredAt = new Date().toISOString();
        record.markedDeliveredBy = session.user.name;
        record.deliveryDetail = `Sent by ${session.user.name} from their own handset. This demo has no provider to confirm delivery, so the timestamp is a staff claim, not a carrier receipt.`;
      }
      return { notification: record, snapshot: buildSnapshot(db, session) };
    });
  },
});

/** Manual run of the scheduler: drafts today's reminders, skipping anything drafted already. */
export const PUT = apiRoute({
  permission: 'notifications.manage',
  handler: ({ session }) =>
    mutate((db) => ({ sweep: runReminderSweep(db), snapshot: buildSnapshot(db, session) })),
});
