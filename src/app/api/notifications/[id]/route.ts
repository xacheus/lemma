import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { notificationPatchSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { markNotification } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const PATCH = apiRoute({
  permission: 'notifications.view',
  handler: async ({ req, session, params }) => {
    const patch = await readBody(req, notificationPatchSchema);
    if (session.user.role === 'guest' && (patch.delivered || patch.note !== undefined)) {
      throw new HttpError('Guests can only change the read state.', 403, 'forbidden');
    }
    if (patch.delivered && !session.permissions.has('notifications.send')) {
      throw new HttpError('Only staff who can send messages can mark one as sent.', 403, 'forbidden');
    }
    return runAtomicTransaction((db) => {
      if (session.user.role === 'guest' && !(buildSnapshot(db, session).notifications ?? []).some((n) => n.id === params.id)) {
        throw new HttpError('Notification not found.', 404, 'not_found');
      }
      return {
        notification: markNotification(db, params.id, { ...patch, actor: session.user.name }),
        snapshot: buildSnapshot(db, session),
      };
    });
  },
});
