import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { notificationPatchSchema } from '@/lib/api/schemas';
import { mutate } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { markNotification } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const PATCH = apiRoute({
  permission: 'notifications.view',
  handler: async ({ req, session, params }) => {
    const patch = await readBody(req, notificationPatchSchema);
    if (patch.delivered && !session.permissions.has('notifications.send')) {
      throw new HttpError('Only staff who can send messages can mark one as sent.', 403, 'forbidden');
    }
    return mutate((db) => ({
      notification: markNotification(db, params.id, { ...patch, actor: session.user.name }),
      snapshot: buildSnapshot(db, session),
    }));
  },
});
